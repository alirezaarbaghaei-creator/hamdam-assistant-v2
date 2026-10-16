import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function genToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function genUuid(): string {
  return crypto.randomUUID();
}

function genOtpCode(): string {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function getAuth(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

interface Settings {
  sms_api_key: string;
  sms_pattern_code: string;
  sms_line_number: string;
  ai_api_url: string;
  ai_api_key: string;
  ai_models: string;
}

let cachedSettings: Settings | null = null;
let settingsCacheTime = 0;

async function getSettings(): Promise<Settings> {
  const now = Date.now();
  if (cachedSettings && now - settingsCacheTime < 30000) return cachedSettings;
  const { data } = await supabase.from("kateb_settings").select("*").eq("id", 1).maybeSingle();
  cachedSettings = (data as Settings) ?? {
    sms_api_key: "", sms_pattern_code: "", sms_line_number: "",
    ai_api_url: "", ai_api_key: "", ai_models: "",
  };
  settingsCacheTime = now;
  return cachedSettings!;
}

async function sendSms(phone: string, code: string): Promise<boolean> {
  try {
    const s = await getSettings();
    if (!s.sms_api_key || !s.sms_pattern_code) return false;
    const payload = {
      code: s.sms_pattern_code,
      attributes: { code },
      recipient: phone,
      line_number: s.sms_line_number,
      number_format: "english",
    };
    const res = await fetch("https://api.iranpayamak.com/ws/v1/sms/pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Api-Key": s.sms_api_key },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (e) {
    console.error("SMS send error:", e);
    return false;
  }
}

interface SessionUser {
  id: string;
  phone: string;
  full_name: string;
  is_admin: boolean;
  coins: number;
  plan_type?: string;
  ai_assistant_usage_this_month?: number;
  template_usage_this_month?: number;
}

async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = getAuth(req);
  if (!token) return null;
  const { data, error } = await supabase
    .from("kateb_sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  const { data: user } = await supabase
    .from("kateb_users")
    .select("id, phone, full_name, is_admin, coins, plan_type, ai_assistant_usage_this_month, template_usage_this_month")
    .eq("id", data.user_id)
    .maybeSingle();
  if (!user) return null;
  return {
    id: user.id,
    phone: user.phone,
    full_name: user.full_name ?? "",
    is_admin: user.is_admin ?? false,
    coins: user.coins ?? 0,
    plan_type: user.plan_type ?? "free",
    ai_assistant_usage_this_month: user.ai_assistant_usage_this_month ?? 0,
    template_usage_this_month: user.template_usage_this_month ?? 0,
  };
}

async function createSession(userId: string, phone: string): Promise<string> {
  const token = genToken();
  const expires = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
  await supabase.from("kateb_sessions").insert({
    token, user_id: userId, phone, expires_at: expires,
  });
  return token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";
    const body = await req.json().catch(() => ({}));

    // ─── OTP: Send ──────────────────────────────────────────────
    if (action === "otp_send") {
      const phone = String(body.phone ?? "");
      if (!/^09\d{9}$/.test(phone)) {
        return json({ error: "شماره موبایل نامعتبر" }, 400);
      }
      const { count } = await supabase
        .from("kateb_otp_codes")
        .select("id", { count: "exact", head: true })
        .eq("phone", phone)
        .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
      if (count !== null && count >= 3) {
        return json({ error: "تعداد درخواست زیاد است. کمی صبر کنید." }, 429);
      }
      // Check if user exists so frontend knows whether to ask for name+password
      const { data: existingUser } = await supabase
        .from("kateb_users")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      const isExisting = !!existingUser;
      const code = genOtpCode();
      const expires = new Date(Date.now() + 120 * 1000).toISOString();
      const { error: insertErr } = await supabase
        .from("kateb_otp_codes")
        .insert({ id: genUuid(), phone, code, expires_at: expires, used: false });
      if (insertErr) return json({ error: "خطا در ثبت کد" }, 500);
      const smsSent = await sendSms(phone, code);
      return json({ success: true, message: "کد تایید ارسال شد", sms_sent: smsSent, is_existing_user: isExisting });
    }

    // ─── OTP: Verify ────────────────────────────────────────────
    if (action === "otp_verify") {
      const phone = String(body.phone ?? "");
      const code = String(body.code ?? "");
      const fullName = String(body.full_name ?? "");
      const password = String(body.password ?? "");
      if (!/^09\d{9}$/.test(phone)) {
        return json({ error: "شماره موبایل نامعتبر" }, 400);
      }
      const { data: otp } = await supabase
        .from("kateb_otp_codes")
        .select("id, code, used, expires_at")
        .eq("phone", phone)
        .eq("code", code)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!otp) return json({ error: "کد تایید اشتباه یا منقضی شده" }, 400);
      await supabase.from("kateb_otp_codes").update({ used: true }).eq("id", otp.id);

      let { data: user } = await supabase
        .from("kateb_users")
        .select("id, phone, full_name, is_admin, coins")
        .eq("phone", phone)
        .maybeSingle();
      let isNewUser = false;
      if (!user) {
        // New user: require full_name and password
        if (!fullName.trim()) return json({ error: "نام و نام خانوادگی الزامی است" }, 400);
        if (password.length < 4) return json({ error: "رمز عبور باید حداقل ۴ کاراکتر باشد" }, 400);
        isNewUser = true;
        const newId = genUuid();
        const hash = await sha256(password);
        const { data: created } = await supabase
          .from("kateb_users")
          .insert({ id: newId, phone, full_name: fullName, password_hash: hash })
          .select("id, phone, full_name, is_admin, coins")
          .maybeSingle();
        user = created ?? { id: newId, phone, full_name: fullName, is_admin: false, coins: 10 };
      } else {
        // Existing user: just log in, optionally update name if provided and was empty
        if (fullName && !user.full_name) {
          await supabase.from("kateb_users").update({ full_name: fullName }).eq("id", user.id);
          user.full_name = fullName;
        }
      }
      const token = await createSession(user.id, phone);
      return json({
        success: true,
        session: {
          access_token: token,
          user: { id: user.id, phone: user.phone, full_name: user.full_name ?? "", is_admin: user.is_admin ?? false, coins: user.coins ?? 10, plan_type: user.plan_type ?? "free", ai_assistant_usage_this_month: user.ai_assistant_usage_this_month ?? 0, template_usage_this_month: user.template_usage_this_month ?? 0 },
        },
        is_new_user: isNewUser,
      });
    }

    // ─── Password Login ─────────────────────────────────────────
    if (action === "password_login") {
      const phone = String(body.phone ?? "");
      const password = String(body.password ?? "");
      if (!/^09\d{9}$/.test(phone)) {
        return json({ error: "شماره موبایل نامعتبر" }, 400);
      }
      if (!password) return json({ error: "رمز عبور را وارد کنید" }, 400);
      const { data: user } = await supabase
        .from("kateb_users")
        .select("id, phone, full_name, is_admin, coins, password_hash")
        .eq("phone", phone)
        .maybeSingle();
      if (!user || !user.password_hash) {
        return json({ error: "شماره موبایل یا رمز عبور اشتباه است" }, 401);
      }
      const hashed = await sha256(password);
      if (hashed !== user.password_hash && password !== user.password_hash) {
        return json({ error: "شماره موبایل یا رمز عبور اشتباه است" }, 401);
      }
      const token = await createSession(user.id, user.phone);
      return json({
        success: true,
        session: {
          access_token: token,
          user: { id: user.id, phone: user.phone, full_name: user.full_name ?? "", is_admin: user.is_admin ?? false, coins: user.coins ?? 10, plan_type: user.plan_type ?? "free", ai_assistant_usage_this_month: user.ai_assistant_usage_this_month ?? 0, template_usage_this_month: user.template_usage_this_month ?? 0 },
        },
      });
    }

    // ─── Auth: me ───────────────────────────────────────────────
    if (action === "me") {
      const user = await getSessionUser(req);
      if (!user) return json({ error: "احراز هویت نشده" }, 401);
      return json({ user });
    }

    // ─── Usage: increment AI assistant ──────────────────────────
    if (action === "increment_ai_usage") {
      const user = await getSessionUser(req);
      if (!user) return json({ error: "احراز هویت نشده" }, 401);
      const newCount = (user.ai_assistant_usage_this_month ?? 0) + 1;
      const { error: e } = await supabase.from("kateb_users")
        .update({ ai_assistant_usage_this_month: newCount })
        .eq("id", user.id);
      if (e) return json({ error: e.message }, 500);
      return json({ success: true, ai_assistant_usage_this_month: newCount });
    }

    // ─── Usage: increment template ──────────────────────────────
    if (action === "increment_template_usage") {
      const user = await getSessionUser(req);
      if (!user) return json({ error: "احراز هویت نشده" }, 401);
      const newCount = (user.template_usage_this_month ?? 0) + 1;
      const { error: e } = await supabase.from("kateb_users")
        .update({ template_usage_this_month: newCount })
        .eq("id", user.id);
      if (e) return json({ error: e.message }, 500);
      return json({ success: true, template_usage_this_month: newCount });
    }

    // ─── Usage: get current (returns plan + expiry) ────────────────
    if (action === "usage_get") {
      const user = await getSessionUser(req);
      if (!user) return json({ error: "احراز هویت نشده" }, 401);
      const { data: sub } = await supabase.from("subscriptions")
        .select("expires_at, cycle_start")
        .eq("user_id", user.id).eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return json({
        plan_type: user.plan_type ?? "free",
        ai_assistant_usage_this_month: user.ai_assistant_usage_this_month ?? 0,
        template_usage_this_month: user.template_usage_this_month ?? 0,
        expires_at: sub?.expires_at ?? null,
        cycle_start: sub?.cycle_start ?? null,
      });
    }

    // ─── Auth: signout ──────────────────────────────────────────
    if (action === "signout") {
      const token = getAuth(req);
      if (token) await supabase.from("kateb_sessions").delete().eq("token", token);
      return json({ success: true });
    }

    // ─── Auth: set password ─────────────────────────────────────
    if (action === "set_password") {
      const user = await getSessionUser(req);
      if (!user) return json({ error: "احراز هویت نشده" }, 401);
      const password = String(body.password ?? "");
      if (password.length < 4) return json({ error: "رمز عبور باید حداقل ۴ کاراکتر باشد" }, 400);
      const hash = await sha256(password);
      const { error: e } = await supabase.from("kateb_users").update({ password_hash: hash }).eq("id", user.id);
      if (e) return json({ error: e.message }, 500);
      return json({ success: true });
    }

    // ─── Auth: update account (full name) ──────────────────────
    if (action === "update_account") {
      const user = await getSessionUser(req);
      if (!user) return json({ error: "احراز هویت نشده" }, 401);
      const fullName = String(body.full_name ?? "").trim();
      if (!fullName) return json({ error: "نام نمی‌تواند خالی باشد" }, 400);
      const { error: e } = await supabase.from("kateb_users").update({ full_name: fullName }).eq("id", user.id);
      if (e) return json({ error: e.message }, 500);
      return json({ success: true, user: { ...user, full_name: fullName } });
    }

    // ─── Payment Callback (public, no auth required) ────────────
    // ZarinPal redirects the external browser here after payment.
    // This must NOT depend on the user's browser session.
    // Handles both coin_orders and plan_transactions.
    if (action === "payment_callback") {
      const authority = String(body.authority ?? "");
      const statusParam = String(body.status ?? "");
      if (!authority) return json({ error: "authority missing" }, 400);

      // Try coin_orders first, then plan_transactions
      let orderType: "coin" | "plan" = "coin";
      let order: any = null;
      const { data: coinOrder } = await supabase.from("coin_orders")
        .select("*").eq("authority", authority).maybeSingle();
      if (coinOrder) {
        order = coinOrder;
        orderType = "coin";
      } else {
        const { data: planTx } = await supabase.from("plan_transactions")
          .select("*").eq("authority", authority).maybeSingle();
        if (planTx) {
          order = planTx;
          orderType = "plan";
        }
      }
      if (!order) return json({ error: "سفارش یافت نشد" }, 404);

      // Already paid — idempotent: return success without re-crediting
      if (order.status === "paid") {
        return json({
          success: true,
          already_paid: true,
          order_id: order.id,
          status: "paid",
          type: orderType,
          coins: orderType === "coin" ? order.coins : undefined,
          plan_id: orderType === "plan" ? order.plan_id : undefined,
          ref_id: order.ref_id ?? "",
        });
      }

      // User cancelled or payment failed (Status != OK)
      if (statusParam !== "OK") {
        if (order.status === "pending") {
          const table = orderType === "coin" ? "coin_orders" : "plan_transactions";
          await supabase.from(table).update({ status: "failed" }).eq("id", order.id);
        }
        return json({ success: false, status: "failed", order_id: order.id, type: orderType });
      }

      // Status=OK — verify with ZarinPal
      const s = await getSettings();
      const merchantId = s.zarinpal_merchant_id || "00000000-0000-0000-0000-000000000000";
      const sandbox = s.zarinpal_sandbox ?? true;
      const verifyUrl = sandbox
        ? "https://sandbox.zarinpal.com/pg/v4/payment/verify.json"
        : "https://payment.zarinpal.com/pg/v4/payment/verify.json";
      const amount = orderType === "coin" ? order.amount_toman : order.amount_toman;

      try {
        const vRes = await fetch(verifyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ merchant_id: merchantId, amount, authority }),
        });
        const vData = await vRes.json();
        const refId = vData?.data?.ref_id;
        const code = vData?.data?.code;

        if (code === 100 || code === 101 || refId) {
          const table = orderType === "coin" ? "coin_orders" : "plan_transactions";
          const { data: updated, error: updErr } = await supabase.from(table)
            .update({
              status: "paid",
              ref_id: String(refId ?? ""),
              paid_at: new Date().toISOString(),
            })
            .eq("id", order.id)
            .eq("status", "pending")
            .select("*")
            .maybeSingle();

          if (updErr || !updated) {
            const { data: reloaded } = await supabase.from(table)
              .select("*").eq("id", order.id).maybeSingle();
            if (reloaded?.status === "paid") {
              return json({
                success: true,
                already_paid: true,
                order_id: order.id,
                status: "paid",
                type: orderType,
                coins: orderType === "coin" ? reloaded.coins : undefined,
                plan_id: orderType === "plan" ? reloaded.plan_id : undefined,
                ref_id: reloaded.ref_id ?? "",
              });
            }
            return json({ success: false, status: "failed", order_id: order.id, type: orderType });
          }

          if (orderType === "coin") {
            // Credit coins to the user
            const { data: u } = await supabase.from("kateb_users")
              .select("coins").eq("id", updated.user_id).maybeSingle();
            const newCoins = (u?.coins ?? 0) + updated.coins;
            await supabase.from("kateb_users")
              .update({ coins: newCoins }).eq("id", updated.user_id);
            return json({
              success: true, status: "paid", order_id: order.id, type: "coin",
              coins: newCoins, added: updated.coins, ref_id: String(refId ?? ""),
            });
          } else {
            // Activate subscription for plan purchase
            const planId = updated.plan_id;
            const planLimits: Record<string, { ai: number; templates: number }> = {
              basic: { ai: 20, templates: 30 },
              pro: { ai: 80, templates: 120 },
            };
            const limits = planLimits[planId] ?? planLimits.basic;
            const durationMonths = (updated as any).duration_months ?? 1;
            const cycleStart = new Date().toISOString();
            const expiresAt = new Date(Date.now() + durationMonths * 30 * 24 * 60 * 60 * 1000).toISOString();

            // Cancel existing active subs
            await supabase.from("subscriptions")
              .update({ status: "cancelled" })
              .eq("user_id", updated.user_id).eq("status", "active");

            // Insert new subscription
            await supabase.from("subscriptions").insert({
              id: genUuid(),
              user_id: updated.user_id,
              plan_id: planId,
              status: "active",
              ai_assistant_limit: limits.ai,
              template_limit: limits.templates,
              ai_assistant_usage: 0,
              template_usage: 0,
              price_toman: updated.amount_toman,
              started_at: cycleStart,
              expires_at: expiresAt,
              cycle_start: cycleStart,
              authority: authority,
              ref_id: String(refId ?? ""),
            });

            // Update user's plan_type and reset usage counters
            await supabase.from("kateb_users")
              .update({
                plan_type: planId,
                ai_assistant_usage_this_month: 0,
                template_usage_this_month: 0,
                usage_cycle_start: cycleStart,
              })
              .eq("id", updated.user_id);

            return json({
              success: true, status: "paid", order_id: order.id, type: "plan",
              plan_id: planId, ref_id: String(refId ?? ""),
            });
          }
        }

        // ZarinPal verification failed
        const table = orderType === "coin" ? "coin_orders" : "plan_transactions";
        await supabase.from(table).update({ status: "failed" }).eq("id", order.id);
        return json({ success: false, status: "failed", order_id: order.id, type: orderType });
      } catch (e) {
        return json({
          success: false,
          status: "pending",
          order_id: order.id,
          type: orderType,
          message: "تأیید پرداخت در حال انجام است. لطفاً چند لحظه دیگر تلاش کنید.",
        });
      }
    }

    // ─── Payment Status (public, no auth required) ──────────────
    // APK calls this with order_id to get the real payment result.
    // Checks both coin_orders and plan_transactions.
    if (action === "payment_status") {
      const orderId = String(body.order_id ?? "");
      if (!orderId) return json({ error: "order_id missing" }, 400);

      // Try coin_orders first
      const { data: coinOrder } = await supabase.from("coin_orders")
        .select("id, status, coins, ref_id, amount_toman")
        .eq("id", orderId).maybeSingle();
      if (coinOrder) {
        return json({
          success: coinOrder.status === "paid",
          status: coinOrder.status,
          order_id: coinOrder.id,
          type: "coin",
          coins: coinOrder.coins,
          ref_id: coinOrder.ref_id ?? "",
        });
      }

      // Try plan_transactions
      const { data: planTx } = await supabase.from("plan_transactions")
        .select("id, status, plan_id, ref_id, amount_toman")
        .eq("id", orderId).maybeSingle();
      if (planTx) {
        return json({
          success: planTx.status === "paid",
          status: planTx.status,
          order_id: planTx.id,
          type: "plan",
          plan_id: planTx.plan_id,
          ref_id: planTx.ref_id ?? "",
        });
      }

      return json({ error: "سفارش یافت نشد" }, 404);
    }

    // ─── Zarinpal Verify (legacy, still session-based for in-app) ─
    if (action === "zarinpal_verify") {
      const authority = String(body.authority ?? "");
      const statusParam = String(body.status ?? "");
      if (!authority) return json({ error: "authority missing" }, 400);

      const { data: order } = await supabase.from("coin_orders")
        .select("*").eq("authority", authority).maybeSingle();
      if (!order) return json({ error: "سفارش یافت نشد" }, 404);

      if (order.status === "paid") {
        return json({ success: true, already_paid: true, coins: order.coins, ref_id: order.ref_id ?? "" });
      }

      if (statusParam !== "OK") {
        if (order.status === "pending") {
          await supabase.from("coin_orders").update({ status: "failed" }).eq("id", order.id);
        }
        return json({ error: "پرداخت ناموفق" }, 400);
      }

      const s = await getSettings();
      const merchantId = s.zarinpal_merchant_id || "00000000-0000-0000-0000-000000000000";
      const sandbox = s.zarinpal_sandbox ?? true;
      const verifyUrl = sandbox
        ? "https://sandbox.zarinpal.com/pg/v4/payment/verify.json"
        : "https://payment.zarinpal.com/pg/v4/payment/verify.json";

      try {
        const vRes = await fetch(verifyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ merchant_id: merchantId, amount: order.amount_toman, authority }),
        });
        const vData = await vRes.json();
        const refId = vData?.data?.ref_id;
        const code = vData?.data?.code;

        if (code === 100 || code === 101 || refId) {
          const { data: updated, error: updErr } = await supabase.from("coin_orders")
            .update({
              status: "paid",
              ref_id: String(refId ?? ""),
              paid_at: new Date().toISOString(),
            })
            .eq("id", order.id)
            .eq("status", "pending")
            .select("id, user_id, coins, status")
            .maybeSingle();

          if (updErr || !updated) {
            const { data: reloaded } = await supabase.from("coin_orders")
              .select("status, coins, ref_id").eq("id", order.id).maybeSingle();
            if (reloaded?.status === "paid") {
              return json({ success: true, already_paid: true, coins: reloaded.coins, ref_id: reloaded.ref_id ?? "" });
            }
            return json({ error: "تأیید پرداخت ناموفق" }, 400);
          }

          const { data: u } = await supabase.from("kateb_users")
            .select("coins").eq("id", updated.user_id).maybeSingle();
          const newCoins = (u?.coins ?? 0) + updated.coins;
          await supabase.from("kateb_users").update({ coins: newCoins }).eq("id", updated.user_id);
          return json({ success: true, coins: newCoins, ref_id: refId, added: updated.coins });
        }

        await supabase.from("coin_orders").update({ status: "failed" }).eq("id", order.id);
        return json({ error: "تأیید پرداخت ناموفق" }, 400);
      } catch (e) {
        return json({ error: "خطا در تأیید پرداخت" }, 500);
      }
    }

    // ─── All remaining actions require auth ─────────────────────
    const user = await getSessionUser(req);
    if (!user) return json({ error: "احراز هویت نشده" }, 401);
    const uid = user.id;

    // ─── Profiles ───────────────────────────────────────────────
    if (action === "profiles_list") {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", uid).order("created_at", { ascending: true });
      return json({ data: data ?? [] });
    }
    if (action === "profiles_create") {
      const id = genUuid();
      const { error: e } = await supabase.from("profiles").insert({
        id, user_id: uid,
        full_name: body.full_name ?? "", national_id: body.national_id ?? "",
        employee_code: body.employee_code ?? "", organization: body.organization ?? "",
        job_title: body.job_title ?? "", extra_fields: body.extra_fields ?? {},
        is_default: body.is_default ?? false,
      });
      if (e) return json({ error: e.message }, 500);
      return json({ data: { id } });
    }
    if (action === "profiles_update") {
      const { id, ...patch } = body;
      const updateFields: Record<string, unknown> = {};
      for (const f of ["full_name", "national_id", "employee_code", "organization", "job_title"]) {
        if (f in patch) updateFields[f] = patch[f];
      }
      if ("extra_fields" in patch) updateFields.extra_fields = patch.extra_fields;
      if ("is_default" in patch) updateFields.is_default = patch.is_default;
      const { error: e } = await supabase.from("profiles").update(updateFields).eq("id", id).eq("user_id", uid);
      if (e) return json({ error: e.message }, 500);
      return json({ success: true });
    }
    if (action === "profiles_delete") {
      await supabase.from("profiles").delete().eq("id", body.id ?? "").eq("user_id", uid);
      return json({ success: true });
    }

    // ─── Letters ────────────────────────────────────────────────
    if (action === "letters_list") {
      const { data } = await supabase.from("generated_letters").select("*").eq("user_id", uid).order("created_at", { ascending: false });
      return json({ data: data ?? [] });
    }
    if (action === "letters_create") {
      const id = genUuid();
      const { error: e } = await supabase.from("generated_letters").insert({
        id, user_id: uid,
        letter_type_id: body.letter_type_id ?? "", template_id: body.template_id ?? "",
        template_title: body.template_title ?? "", profile_id: body.profile_id ?? null,
        title: body.title ?? "", content: body.content ?? "",
        field_values: body.field_values ?? {}, status: body.status ?? "draft",
        quality_score: body.quality_score ?? null, quality_feedback: body.quality_feedback ?? null,
      });
      if (e) return json({ error: e.message }, 500);
      return json({ data: { id } });
    }
    if (action === "letters_update") {
      const updateFields: Record<string, unknown> = {};
      for (const f of ["content", "title", "status"]) {
        if (f in body) updateFields[f] = body[f];
      }
      if ("quality_score" in body) updateFields.quality_score = body.quality_score;
      if ("quality_feedback" in body) updateFields.quality_feedback = body.quality_feedback;
      updateFields.updated_at = new Date().toISOString();
      const { error: e } = await supabase.from("generated_letters").update(updateFields).eq("id", body.id ?? "").eq("user_id", uid);
      if (e) return json({ error: e.message }, 500);
      return json({ success: true });
    }
    if (action === "letters_delete") {
      await supabase.from("generated_letters").delete().eq("id", body.id ?? "").eq("user_id", uid);
      return json({ success: true });
    }

    // ─── Drafts ─────────────────────────────────────────────────
    if (action === "drafts_list") {
      const { data } = await supabase.from("drafts").select("*").eq("user_id", uid).order("updated_at", { ascending: false });
      return json({ data: data ?? [] });
    }
    if (action === "drafts_save") {
      const id = body.id ?? "";
      const payload = {
        title: body.title ?? "", letter_type: body.letter_type ?? {},
        discovered_letter: body.discovered_letter ?? null, field_values: body.field_values ?? {},
        chat_messages: body.chat_messages ?? [], step: body.step ?? 0, phase: body.phase ?? "chat",
        use_profile: body.use_profile ?? true, include_optional: body.include_optional ?? true,
        updated_at: new Date().toISOString(),
      };
      if (id) {
        const { error: e } = await supabase.from("drafts").update(payload).eq("id", id).eq("user_id", uid);
        if (e) return json({ error: e.message }, 500);
        return json({ data: { id } });
      } else {
        const newId = genUuid();
        const { error: e } = await supabase.from("drafts").insert({ id: newId, user_id: uid, ...payload });
        if (e) return json({ error: e.message }, 500);
        return json({ data: { id: newId } });
      }
    }
    if (action === "drafts_delete") {
      await supabase.from("drafts").delete().eq("id", body.id ?? "").eq("user_id", uid);
      return json({ success: true });
    }

    // ─── Templates (public, with search + ratings) ─────────────
    if (action === "templates_list") {
      const search = String(body.search ?? "").trim();
      const includePending = Boolean(body.include_pending);
      let query = supabase.from("templates").select("*", { count: "exact" });
      // Non-admins only see approved templates; admins can optionally see pending
      if (!user.is_admin || !includePending) {
        query = query.eq("is_approved", true);
      }
      if (search) {
        query = query.or(`title.ilike.%${search}%,raw_request.ilike.%${search}%,creator_name.ilike.%${search}%`);
      }
      const { data, count: totalCount } = await query.order("created_at", { ascending: false });
      const templates = data ?? [];
      // Fetch ratings for all returned templates
      let ratingsMap: Record<string, { avg: number; count: number; myRating: number }> = {};
      if (templates.length > 0) {
        const templateIds = templates.map((t: any) => t.id);
        const { data: ratings } = await supabase
          .from("template_ratings")
          .select("template_id, user_id, rating")
          .in("template_id", templateIds);
        if (ratings) {
          for (const r of ratings as any[]) {
            if (!ratingsMap[r.template_id]) ratingsMap[r.template_id] = { avg: 0, count: 0, myRating: 0 };
            ratingsMap[r.template_id].count++;
            ratingsMap[r.template_id].avg += r.rating;
            if (r.user_id === uid) ratingsMap[r.template_id].myRating = r.rating;
          }
          for (const tid of Object.keys(ratingsMap)) {
            if (ratingsMap[tid].count > 0) ratingsMap[tid].avg = ratingsMap[tid].avg / ratingsMap[tid].count;
          }
        }
      }
      const enriched = templates.map((t: any) => ({
        ...t,
        rating: ratingsMap[t.id]?.avg ?? 0,
        rating_count: ratingsMap[t.id]?.count ?? 0,
        my_rating: ratingsMap[t.id]?.myRating ?? 0,
      }));
      return json({ data: enriched, total: totalCount ?? 0 });
    }
    if (action === "templates_create") {
      const id = genUuid();
      const creatorName = user.full_name ?? "";
      const { error: e } = await supabase.from("templates").insert({
        id, user_id: uid, letter_type: body.letter_type ?? {},
        title: body.title ?? "", raw_request: body.raw_request ?? "",
        rating: 0, rating_count: 0, creator_name: creatorName,
        sample_content: body.sample_content ?? "",
        source_template_id: body.source_template_id ?? null,
        is_approved: false,
      });
      if (e) return json({ error: e.message }, 500);
      return json({ data: { id } });
    }
    if (action === "templates_rate") {
      const templateId = String(body.template_id ?? "");
      const rating = Math.max(1, Math.min(5, Number(body.rating ?? 0)));
      if (!templateId || rating < 1) return json({ error: "Invalid input" }, 400);
      // Upsert rating (unique per user per template)
      const { data: existing } = await supabase
        .from("template_ratings")
        .select("id")
        .eq("template_id", templateId)
        .eq("user_id", uid)
        .maybeSingle();
      if (existing) {
        await supabase.from("template_ratings").update({ rating }).eq("id", existing.id);
      } else {
        await supabase.from("template_ratings").insert({
          id: genUuid(), template_id: templateId, user_id: uid, rating,
        });
      }
      // Recompute average
      const { data: allRatings } = await supabase
        .from("template_ratings")
        .select("rating")
        .eq("template_id", templateId);
      const rc = allRatings?.length ?? 0;
      const avg = rc > 0 ? (allRatings as any[]).reduce((s, r) => s + r.rating, 0) / rc : 0;
      return json({ data: { avg: Math.round(avg * 10) / 10, count: rc, my_rating: rating } });
    }
    if (action === "templates_delete") {
      await supabase.from("templates").delete().eq("id", body.id ?? "").eq("user_id", uid);
      return json({ success: true });
    }

    // ─── Template rating update (for re-used templates) ─────────
    if (action === "templates_update_rating") {
      const templateId = String(body.template_id ?? "");
      const rating = Math.max(1, Math.min(5, Number(body.rating ?? 0)));
      if (!templateId || rating < 1) return json({ error: "Invalid input" }, 400);
      // Upsert rating
      const { data: existing } = await supabase
        .from("template_ratings")
        .select("id")
        .eq("template_id", templateId)
        .eq("user_id", uid)
        .maybeSingle();
      if (existing) {
        await supabase.from("template_ratings").update({ rating }).eq("id", existing.id);
      } else {
        await supabase.from("template_ratings").insert({
          id: genUuid(), template_id: templateId, user_id: uid, rating,
        });
      }
      const { data: allRatings } = await supabase
        .from("template_ratings")
        .select("rating")
        .eq("template_id", templateId);
      const rc = allRatings?.length ?? 0;
      const avg = rc > 0 ? (allRatings as any[]).reduce((s, r) => s + r.rating, 0) / rc : 0;
      return json({ data: { avg: Math.round(avg * 10) / 10, count: rc, my_rating: rating } });
    }

    // ─── Coins ──────────────────────────────────────────────────
    if (action === "coins_balance") {
      const { data: u } = await supabase.from("kateb_users").select("coins").eq("id", uid).maybeSingle();
      return json({ coins: u?.coins ?? 0 });
    }
    if (action === "coins_deduct") {
      const amount = Math.max(1, Number(body.amount ?? 0));
      const reason = String(body.reason ?? "");
      const { data: u } = await supabase.from("kateb_users").select("coins").eq("id", uid).maybeSingle();
      const currentCoins = u?.coins ?? 0;
      if (currentCoins < amount) {
        return json({ error: "سکه کافی ندارید", coins: currentCoins }, 402);
      }
      const newCoins = currentCoins - amount;
      const { error: e } = await supabase.from("kateb_users").update({ coins: newCoins }).eq("id", uid);
      if (e) return json({ error: e.message }, 500);
      return json({ success: true, coins: newCoins, reason });
    }

    // ─── Discovery Usage ────────────────────────────────────────
    if (action === "discovery_count") {
      const { count } = await supabase
        .from("discovery_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid);
      return json({ count: count ?? 0 });
    }
    if (action === "discovery_record") {
      // Deduct 5 coins for discovery
      const { data: u } = await supabase.from("kateb_users").select("coins").eq("id", uid).maybeSingle();
      const currentCoins = u?.coins ?? 0;
      if (currentCoins < 5) {
        return json({ error: "سکه کافی ندارید", coins: currentCoins }, 402);
      }
      const newCoins = currentCoins - 5;
      const { error: coinErr } = await supabase.from("kateb_users").update({ coins: newCoins }).eq("id", uid);
      if (coinErr) return json({ error: coinErr.message }, 500);
      const { error: e } = await supabase.from("discovery_usage").insert({
        id: genUuid(), user_id: uid, query_text: body.query_text ?? "",
      });
      if (e) return json({ error: e.message }, 500);
      return json({ success: true, coins: newCoins });
    }

    // ─── Zarinpal Payment ─────────────────────────────────────
    if (action === "coin_packages") {
      // 5,000 Toman per coin
      return json({ data: [
        { id: 'small', coins: 10, price: 50000, label: '۱۰ سکه — ۵۰٬۰۰۰ تومان' },
        { id: 'medium', coins: 20, price: 100000, label: '۲۰ سکه — ۱۰۰٬۰۰۰ تومان', popular: true },
        { id: 'large', coins: 40, price: 200000, label: '۴۰ سکه — ۲۰۰٬۰۰۰ تومان' },
        { id: 'xlarge', coins: 90, price: 450000, label: '۹۰ سکه — ۴۵۰٬۰۰۰ تومان' },
      ]});
    }
    if (action === "zarinpal_request") {
      const pkgId = String(body.package_id ?? "");
      const s = await getSettings();
      const merchantId = s.zarinpal_merchant_id || "00000000-0000-0000-0000-000000000000";
      const sandbox = s.zarinpal_sandbox ?? true;
      const packages: Record<string, { coins: number; price: number }> = {
        small: { coins: 10, price: 50000 },
        medium: { coins: 20, price: 100000 },
        large: { coins: 40, price: 200000 },
        xlarge: { coins: 90, price: 450000 },
      };
      const pkg = packages[pkgId];
      if (!pkg) return json({ error: "بسته نامعتبر" }, 400);
      const callbackUrl = "https://app.kateb.site/payment/callback";
      const baseUrl = sandbox ? "https://sandbox.zarinpal.com/pg/v4/payment/request.json" : "https://payment.zarinpal.com/pg/v4/payment/request.json";
      const gatewayUrl = sandbox ? "https://sandbox.zarinpal.com/pg/StartPay/" : "https://payment.zarinpal.com/pg/StartPay/";
      try {
        const zRes = await fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            merchant_id: merchantId,
            amount: pkg.price,
            currency: "IRT",
            description: `خرید ${pkg.coins} سکه - کاتب`,
            callback_url: callbackUrl,
          }),
        });
        const zData = await zRes.json();
        const authority = zData?.data?.authority;
        if (!authority) {
          const errMsg = zData?.errors?.[0]?.message ?? "خطا در ارتباط با زرین‌پال";
          return json({ error: errMsg }, 500);
        }
        const orderId = genUuid();
        await supabase.from("coin_orders").insert({
          id: orderId, user_id: uid, amount_toman: pkg.price,
          coins: pkg.coins, status: 'pending', authority,
        });
        return json({ data: { authority, redirect_url: `${gatewayUrl}${authority}`, order_id: orderId } });
      } catch (e) {
        return json({ error: "خطا در ارتباط با زرین‌پال" }, 500);
      }
    }

    // ─── Plan Purchase Request (authenticated) ───────────────────
    if (action === "plan_request") {
      const planId = String(body.plan_id ?? "");
      const validPlans: Record<string, number> = { basic: 59000, pro: 119000 };
      if (!(planId in validPlans)) return json({ error: "طرح نامعتبر" }, 400);
      const monthlyPrice = validPlans[planId];

      const durationMonths = Math.floor(Number(body.duration_months ?? 1));
      if (![1, 3, 6].includes(durationMonths)) return json({ error: "مدت زمان نامعتبر" }, 400);

      const discountRate = durationMonths === 6 ? 0.20 : durationMonths === 3 ? 0.10 : 0;
      const baseTotal = monthlyPrice * durationMonths;
      const price = Math.round(baseTotal * (1 - discountRate));

      const s = await getSettings();
      const merchantId = s.zarinpal_merchant_id || "00000000-0000-0000-0000-000000000000";
      const sandbox = s.zarinpal_sandbox ?? true;
      const callbackUrl = "https://app.kateb.site/payment/callback";
      const baseUrl = sandbox ? "https://sandbox.zarinpal.com/pg/v4/payment/request.json" : "https://payment.zarinpal.com/pg/v4/payment/request.json";
      const gatewayUrl = sandbox ? "https://sandbox.zarinpal.com/pg/StartPay/" : "https://payment.zarinpal.com/pg/StartPay/";

      try {
        const zRes = await fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            merchant_id: merchantId,
            amount: price,
            currency: "IRT",
            description: `خرید طرح ${planId} (${durationMonths} ماه) - کاتب`,
            callback_url: callbackUrl,
          }),
        });
        const zData = await zRes.json();
        const authority = zData?.data?.authority;
        if (!authority) {
          const errMsg = zData?.errors?.[0]?.message ?? "خطا در ارتباط با زرین‌پال";
          return json({ error: errMsg }, 500);
        }
        const txId = genUuid();
        await supabase.from("plan_transactions").insert({
          id: txId, user_id: uid, plan_id: planId,
          amount_toman: price, status: 'pending', authority,
          duration_months: durationMonths,
        });
        return json({ data: { authority, redirect_url: `${gatewayUrl}${authority}`, order_id: txId } });
      } catch (e) {
        return json({ error: "خطا در ارتباط با زرین‌پال" }, 500);
      }
    }

    // ─── Plan Transactions List (authenticated) ──────────────────
    if (action === "plan_transactions_list") {
      const { data } = await supabase.from("plan_transactions")
        .select("*").eq("user_id", uid)
        .order("created_at", { ascending: false }).limit(20);
      return json({ data: data ?? [] });
    }
    if (action === "coin_orders_list") {
      const { data } = await supabase.from("coin_orders").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(20);
      return json({ data: data ?? [] });
    }

    // ═══ ADMIN ENDPOINTS ═════════════════════════════════════════
    if (!user.is_admin) return json({ error: "دسترسی غیرمجاز" }, 403);

    if (action === "admin_users_list") {
      const { data } = await supabase.from("kateb_users")
        .select("id, phone, full_name, is_admin, coins, plan_type, created_at")
        .order("created_at", { ascending: false });
      return json({ data: data ?? [] });
    }
    if (action === "admin_user_set_coins") {
      const targetId = String(body.id ?? "");
      const newCoinVal = Math.max(0, Math.floor(Number(body.coins ?? 0)));
      if (!targetId) return json({ error: "کاربر نامعتبر" }, 400);
      const { error: e } = await supabase.from("kateb_users").update({ coins: newCoinVal }).eq("id", targetId);
      if (e) return json({ error: e.message }, 500);
      return json({ success: true, coins: newCoinVal });
    }
    if (action === "admin_user_add_coins") {
      const targetId = String(body.id ?? "");
      const addAmount = Math.floor(Number(body.amount ?? 0));
      if (!targetId || !addAmount) return json({ error: "مقادیر نامعتبر" }, 400);
      const { data: target } = await supabase.from("kateb_users").select("coins").eq("id", targetId).maybeSingle();
      const newCoinVal = (target?.coins ?? 0) + addAmount;
      const { error: e } = await supabase.from("kateb_users").update({ coins: Math.max(0, newCoinVal) }).eq("id", targetId);
      if (e) return json({ error: e.message }, 500);
      return json({ success: true, coins: Math.max(0, newCoinVal) });
    }

    if (action === "admin_user_update") {
      const { id, ...patch } = body;
      const updateFields: Record<string, unknown> = {};
      if ("full_name" in patch) updateFields.full_name = patch.full_name;
      if ("is_admin" in patch) updateFields.is_admin = patch.is_admin;
      if ("password" in patch && patch.password) {
        updateFields.password_hash = await sha256(String(patch.password));
      }
      const { error: e } = await supabase.from("kateb_users").update(updateFields).eq("id", id);
      if (e) return json({ error: e.message }, 500);
      return json({ success: true });
    }

    if (action === "admin_user_delete") {
      const { id } = body;
      await supabase.from("kateb_users").delete().eq("id", id);
      return json({ success: true });
    }

    if (action === "admin_user_set_plan") {
      const targetId = String(body.id ?? "");
      const planId = String(body.plan_id ?? "free");
      if (!targetId) return json({ error: "کاربر نامعتبر" }, 400);
      const validPlans = ["free", "basic", "pro"];
      if (!validPlans.includes(planId)) return json({ error: "طرح نامعتبر" }, 400);

      const cycleStart = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Reset usage counters and set plan on user
      const { error: ue } = await supabase.from("kateb_users").update({
        plan_type: planId,
        ai_assistant_usage_this_month: 0,
        template_usage_this_month: 0,
        usage_cycle_start: cycleStart,
      }).eq("id", targetId);
      if (ue) return json({ error: ue.message }, 500);

      if (planId === "free") {
        await supabase.from("subscriptions")
          .update({ status: "cancelled" })
          .eq("user_id", targetId).eq("status", "active");
      } else {
        // Get plan limits from plans data
        const planLimits: Record<string, { ai: number; templates: number; price: number }> = {
          basic: { ai: 50, templates: 30, price: 99000 },
          pro: { ai: 200, templates: 100, price: 290000 },
        };
        const limits = planLimits[planId] ?? planLimits.basic;

        // Cancel existing active subs first
        await supabase.from("subscriptions")
          .update({ status: "cancelled" })
          .eq("user_id", targetId).eq("status", "active");

        // Insert new subscription
        const newSubId = genUuid();
        const { error: se } = await supabase.from("subscriptions").insert({
          id: newSubId,
          user_id: targetId,
          plan_id: planId,
          status: "active",
          ai_assistant_limit: limits.ai,
          template_limit: limits.templates,
          ai_assistant_usage: 0,
          template_usage: 0,
          price_toman: limits.price,
          started_at: cycleStart,
          expires_at: expiresAt,
          cycle_start: cycleStart,
          authority: `admin_${Date.now()}`,
          ref_id: "ADMIN_ASSIGN",
        });
        if (se) return json({ error: se.message }, 500);
      }
      return json({ success: true });
    }

    if (action === "admin_user_create") {
      const phone = String(body.phone ?? "");
      if (!/^09\d{9}$/.test(phone)) return json({ error: "شماره نامعتبر" }, 400);
      const password = String(body.password ?? "");
      if (password.length < 4) return json({ error: "رمز کوتاه" }, 400);
      const hash = await sha256(password);
      const newId = genUuid();
      const { error: e } = await supabase.from("kateb_users").insert({
        id: newId, phone, full_name: body.full_name ?? "",
        is_admin: body.is_admin ?? false, password_hash: hash,
      });
      if (e) return json({ error: e.message }, 500);
      return json({ data: { id: newId } });
    }

    if (action === "admin_settings_get") {
      const s = await getSettings();
      return json({ data: s });
    }

    if (action === "admin_settings_update") {
      const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const f of ["sms_api_key", "sms_pattern_code", "sms_line_number", "ai_api_url", "ai_api_key", "ai_models", "zarinpal_merchant_id", "zarinpal_sandbox"]) {
        if (f in body) updateFields[f] = body[f];
      }
      const { error: e } = await supabase.from("kateb_settings").update(updateFields).eq("id", 1);
      cachedSettings = null;
      if (e) return json({ error: e.message }, 500);
      return json({ success: true });
    }

    if (action === "admin_stats") {
      const [users, letters, drafts, templates, discovery] = await Promise.all([
        supabase.from("kateb_users").select("id", { count: "exact", head: true }),
        supabase.from("generated_letters").select("id", { count: "exact", head: true }),
        supabase.from("drafts").select("id", { count: "exact", head: true }),
        supabase.from("templates").select("id", { count: "exact", head: true }),
        supabase.from("discovery_usage").select("id", { count: "exact", head: true }),
      ]);
      return json({
        data: {
          users: users.count ?? 0,
          letters: letters.count ?? 0,
          drafts: drafts.count ?? 0,
          templates: templates.count ?? 0,
          discovery: discovery.count ?? 0,
        },
      });
    }

    // ─── Admin: list pending templates ────────────────────────────
    if (action === "admin_templates_list") {
      const { data, count: totalCount } = await supabase
        .from("templates")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });
      return json({
        data: data ?? [],
        total: totalCount ?? 0,
      });
    }

    // ─── Admin: approve a template ────────────────────────────────
    if (action === "admin_template_approve") {
      const { error: e } = await supabase
        .from("templates")
        .update({ is_approved: true })
        .eq("id", body.id ?? "");
      if (e) return json({ error: e.message }, 500);
      return json({ success: true });
    }

    // ─── Admin: reject (delete) a template ────────────────────────
    if (action === "admin_template_reject") {
      const { error: e } = await supabase
        .from("templates")
        .delete()
        .eq("id", body.id ?? "");
      if (e) return json({ error: e.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Unknown action", action }, 404);
  } catch (err) {
    return json({ error: err.message ?? "Internal error" }, 500);
  }
});
