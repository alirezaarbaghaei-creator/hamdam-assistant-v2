const AI_URL = import.meta.env?.VITE_AI_BASE_URL
  ? `${import.meta.env.VITE_AI_BASE_URL}/v1/messages`
  : "/ai-proxy/v1/messages";

export interface ParsedRequest {
  understood: boolean;
  title: string | null;
  day: string | null; // ISO Gregorian YYYY-MM-DD, resolved from relative phrases
  start_time: string | null; // "HH:MM" 24h
  end_time: string | null; // "HH:MM" 24h
  notes: string | null;
  reply: string; // short Persian sentence confirming what was understood / asking what's missing
}

const systemPrompt = `تو دستیار ثبت رویداد در یک اپلیکیشن تقویم فارسی هستی.
کاربر درخواست خودش را به زبان فارسی می‌گوید (مثلاً «یادم بنداز چهارشنبه ساعت ۹ تا ۱۱ جلسه دارم»).

وظیفه تو: استخراج پارامترهای رویداد. هر رویداد دقیقاً ۳ پارامتر ضروری دارد:
1. روز (تاریخ) — می‌تواند نسبی باشد مثل «امروز»، «فردا»، «سه‌شنبه»، «۸ آبان». اگر نسبی یا روز هفته است، بر اساس تاریخ امروز داده‌شده به تاریخ میلادی دقیق ISO (YYYY-MM-DD) تبدیلش کن.
2. ساعت شروع — به فرمت ۲۴ ساعته HH:MM
3. مدت‌زمان — که به صورت ساعت پایان هم داده می‌شود؛ مثلاً «از ۹ تا ۱۱» یعنی شروع 09:00 و پایان 11:00. «دو ساعت» از ۹ یعنی پایان 11:00.

اگر یکی از ۳ پارامتر (روز، ساعت شروع، ساعت پایان) در درخواست نبود، understood=true بگذار و آن فیلدها را null بگذار؛ در reply به فارسی فقط همان‌های گمشده را بپرس (کوتاه و محاوره‌ای).
اگر هیچ چیز قابل فهمیدن نبود understood=false بگذار.
اگر همه چیز کامل بود، در reply یک جمله کوتاه تأیید فارسی بنویس که خلاصه رویداد را تکرار کند.
عنوان (title) را کوتاه و مؤثر به فارسی بنویس؛ اگر کاربر عنوانی نگفته، از خود متن یک عنوان بساز.
فقط و فقط JSON معتبر برگردان، بدون markdown و بدون توضیح اضافه.

قالب:
{"understood": true, "title": "...", "day": "YYYY-MM-DD"|null, "start_time": "HH:MM"|null, "end_time": "HH:MM"|null, "notes": "..."|null, "reply": "..."}`;

export async function parseEventRequest(userText: string): Promise<ParsedRequest> {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const weekday = new Intl.DateTimeFormat("fa-IR", { weekday: "long" }).format(today);

  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "zai-org/GLM-5.3-Flash",
      max_tokens: 600,
      system: `${systemPrompt}\nامروز ${weekday} است، تاریخ میلادی: ${todayIso}`,
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!res.ok) {
    throw new Error(`AI request failed (${res.status})`);
  }

  const data = await res.json();
  const text: string =
    data?.content
      ?.filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("") ?? "";
  if (!text) throw new Error("پاسخ خالی از دستیار");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("پاسخ دستیار قابل تفسیر نبود");
  const parsed = JSON.parse(jsonMatch[0]);

  return {
    understood: Boolean(parsed.understood),
    title: parsed.title ?? null,
    day: parsed.day ?? null,
    start_time: parsed.start_time ?? null,
    end_time: parsed.end_time ?? null,
    notes: parsed.notes ?? null,
    reply: parsed.reply ?? "",
  };
}
