import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_BASE_URL = "https://ai.parspack.com/v1";
const DEFAULT_MODEL = "abrha/free-model";
const MAX_RETRIES = 3;
const RETRY_DELAYS = [800, 1600, 3200];

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface AiSettings {
  ai_api_url: string;
  ai_api_key: string;
  ai_models: string;
}

let cachedSettings: AiSettings | null = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 5000; // 5 seconds — short enough that admin saves are picked up quickly

async function getAiSettings(): Promise<AiSettings> {
  const now = Date.now();
  if (cachedSettings && now - settingsCacheTime < SETTINGS_CACHE_TTL) return cachedSettings;

  const { data } = await supabase
    .from("kateb_settings")
    .select("ai_api_url, ai_api_key, ai_models")
    .eq("id", 1)
    .maybeSingle();

  // Database value takes priority; env var is fallback for API key only
  const dbSettings = data as AiSettings | null;
  const envKey = Deno.env.get("PARSPACK_AI_API_KEY")?.trim() ?? "";

  cachedSettings = {
    ai_api_url: dbSettings?.ai_api_url?.trim() || DEFAULT_BASE_URL,
    ai_api_key: dbSettings?.ai_api_key?.trim() || envKey,
    ai_models: dbSettings?.ai_models?.trim() || DEFAULT_MODEL,
  };
  settingsCacheTime = now;
  return cachedSettings;
}

function normalizeBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  u = u.replace(/\/chat\/completions$/i, "");
  u = u.replace(/\/responses$/i, "");
  return u || DEFAULT_BASE_URL;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Determine if a model uses the Responses API or Chat Completions API.
 * Abrha models use Responses API; others use Chat Completions.
 */
function usesResponsesApi(model: string): boolean {
  return model.toLowerCase().startsWith("abrha/");
}

/**
 * Call the Responses API (OpenAI-compatible, used by Abrha).
 * Returns the text content from the response.
 */
async function callResponsesApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens?: number,
): Promise<{ content: string; raw: Record<string, unknown> }> {
  // Convert messages to a single input string for Responses API
  const input = messages
    .map((m) => {
      if (m.role === "system") return m.content;
      return m.content;
    })
    .join("\n\n");

  const payload: Record<string, unknown> = {
    model,
    input,
    temperature,
  };
  if (maxTokens) payload.max_output_tokens = maxTokens;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errText = await res.text().catch(() => JSON.stringify(data));
      const status = res.status;
      return { content: "", raw: { _error: true, status, body: errText.slice(0, 500) } };
    }

    // Responses API returns output in different shapes
    let content = "";
    let reasoningText = "";
    if (typeof data.output_text === "string") {
      content = data.output_text;
    } else if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === "reasoning" && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c.type === "reasoning_text" && c.text) reasoningText += c.text;
          }
        }
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c.type === "output_text" && c.text) content += c.text;
            else if (typeof c.text === "string") content += c.text;
          }
        }
      }
    } else if (data?.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content;
    }
    // Fallback to reasoning text if message content is empty
    if (!content && reasoningText) content = reasoningText;

    return { content, raw: data };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call the Chat Completions API (standard OpenAI-compatible).
 */
async function callChatCompletions(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens?: number,
): Promise<{ content: string; raw: Record<string, unknown> }> {
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature,
    stream: false,
  };
  if (maxTokens) payload.max_tokens = maxTokens;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errText = await res.text().catch(() => JSON.stringify(data));
      return { content: "", raw: { _error: true, status: res.status, body: errText.slice(0, 500) } };
    }

    let content = data?.choices?.[0]?.message?.content ?? "";
    if (!content && data?.choices?.[0]?.message?.reasoning) {
      content = data.choices[0].message.reasoning;
    }

    return { content, raw: data };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const isTest = url.searchParams.get("test") === "1";
    const body = await req.json().catch(() => ({}));
    const settings = await getAiSettings();

    const apiKey = settings.ai_api_key.trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "کلید API هوش مصنوعی تنظیم نشده است. لطفاً در پنل مدیریت کلید را وارد کنید.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseUrl = normalizeBaseUrl(settings.ai_api_url);
    const modelList = settings.ai_models
      ? settings.ai_models.split(",").map((m) => m.trim()).filter(Boolean)
      : [];

    // ─── Test mode: send a simple prompt and return success/failure ───
    if (isTest) {
      const testModel = modelList[0] ?? DEFAULT_MODEL;
      const testMessages = [{ role: "user", content: "سلام. فقط بنویس: اتصال Abrha با موفقیت انجام شد." }];

      try {
        let result;
        if (usesResponsesApi(testModel)) {
          result = await callResponsesApi(baseUrl, apiKey, testModel, testMessages, 0.7, 200);
        } else {
          result = await callChatCompletions(baseUrl, apiKey, testModel, testMessages, 0.7, 200);
        }

        if (result.raw._error) {
          const errData = result.raw as { status: number; body: string };
          return new Response(
            JSON.stringify({
              success: false,
              message: `خطای API (${errData.status}): ${errData.body.slice(0, 300)}`,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "اتصال موفق!",
            response: result.content || "پاسخی دریافت نشد",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        const msg = err instanceof DOMException && err.name === "AbortError"
          ? "پاسخ سرور بیش از حد طول کشید (timeout)"
          : err instanceof Error ? err.message : "خطا در اتصال";
        return new Response(
          JSON.stringify({ success: false, message: "خطا در اتصال: " + msg }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ─── Normal proxy mode ───
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "پیام درخواست هوش مصنوعی خالی است." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requestedModel = body.model ?? modelList[0] ?? DEFAULT_MODEL;
    const fallbackModels = modelList.filter((m) => m !== requestedModel);
    const modelsToTry = [requestedModel, ...fallbackModels];

    const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;
    const maxTokens = body.max_tokens ?? 2000;

    let lastError = "";
    let lastStatus = 502;

    for (const model of modelsToTry) {
      const useResponses = usesResponsesApi(model);

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          await sleep(RETRY_DELAYS[attempt - 1] ?? 3200);
        }

        try {
          let result;
          if (useResponses) {
            result = await callResponsesApi(baseUrl, apiKey, model, messages, temperature, maxTokens);
          } else {
            result = await callChatCompletions(baseUrl, apiKey, model, messages, temperature, maxTokens);
          }

          if (result.raw._error) {
            const errData = result.raw as { status: number; body: string };
            lastStatus = errData.status;
            lastError = errData.body;

            if (!isRetryable(lastStatus)) break;
            continue;
          }

          // Success — normalize output to chat completions format for frontend compatibility
          const normalized = useResponses
            ? {
                choices: [{
                  message: {
                    role: "assistant",
                    content: result.content,
                  },
                }],
                model,
              }
            : result.raw;

          return new Response(JSON.stringify(normalized), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            lastError = "timeout";
            lastStatus = 504;
          } else {
            lastError = err instanceof Error ? err.message : String(err);
            lastStatus = 502;
          }
        }
      }

      if (lastStatus !== 504 && !isRetryable(lastStatus)) break;
    }

    const userMessage = lastStatus === 504
      ? "پاسخ سرویس هوش مصنوعی بیش از حد طول کشید. لطفاً دوباره تلاش کنید."
      : lastStatus === 401
        ? "کلید API نامعتبر است. لطفاً در پنل مدیریت کلید معتبر وارد کنید."
        : lastStatus === 404
          ? "مدل یا آدرس API پیدا نشد. لطفاً تنظیمات را بررسی کنید."
          : "سرویس هوش مصنوعی در حال حاضر در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.";

    return new Response(
      JSON.stringify({ error: userMessage, detail: lastError }),
      { status: lastStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
