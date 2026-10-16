# AUDIT.md — ممیزی کامل پروژه «کاتب» (پیش از تبدیل به «همدم»)

> تاریخ ممیزی: ۱۴۰۴/مهر (اکتبر ۲۰۲۶) — نسخهٔ بررسی‌شده: مخزن کامل به‌همراه پوشه‌های `php-api`، `supabase`، `src`، `android`
> اصل ممیزی: هیچ فایلی حذف نشده؛ این سند نقشهٔ «قابلیت → فایل → وابستگی → مصرف در محصول جدید» است.

---

## ۱. نمای کلی و فناوری‌ها

| لایه | فناوری | نکته |
|---|---|---|
| فرانت‌اند | React 19 + TypeScript 5 + Vite 5 + Tailwind 3 + Zustand 5 + framer-motion + lucide-react، فونت وزیرمتن، RTL کامل | `package.json`, `vite.config.ts` (alias `@` → `src`، تقسیم chunk) |
| بک‌اند اصلی | PHP تک‌فایلی (`php-api/index.php` ≈۱۵۷۸ خط) روی هاست اشتراکی، PDO/MySQL | همه‌چیز با `POST {action: "..."} ` |
| دیتابیس ابری | Supabase (JS SDK) — همگام‌سازی اختیاری ماژول «مدیر من»، توابع Edge | فقط وقتی نشست Supabase وجود دارد فعال می‌شود |
| اعتبارسنجی | سفارشی: OTP پیامکی + رمز عبور، نشست Bearer ۳۰ روزه در جدول `kateb_sessions` | **بدون Supabase Auth** |
| موبایل | Capacitor 8 + Android (Gradle، پلاگین‌های بومی جاوا)، CI ساخت APK با GitHub Actions | `capacitor.config.ts`, `.github/workflows/android-apk.yml` |

## ۲. نقشهٔ پوشه‌ها

```
project/
├── php-api/            ← بک‌اند PHP/MySQL (API، احراز هویت، پرداخت، پیامک، AI)
│   ├── index.php       ← تک‌نقطهٔ ورود همهٔ اکشن‌ها + ساخت خودکار جداول
│   ├── config.php      ← فقط اتصال DB (env: KATEB_DB_*)
│   ├── schema.sql      ← DDL کامل + ردیف تنظیمات + کاربر مدیر پیش‌فرض
│   └── index copy.php  ← نسخهٔ پشتیبان قدیمی (بلامصرف)
├── supabase/
│   ├── functions/ai-proxy/   ← پروکسی AI سمت Edge (موازی با PHP، بلااستفاده در مسیر فعلی)
│   ├── functions/kateb-api/  ← نسخهٔ Edge بک‌اند (بلااستفاده در مسیر فعلی)
│   └── migrations/           ← ۱۲ مایگریشن جداول نامه/قالب/پرداخت
├── src/
│   ├── lib/            ← api.ts (کلاینت PHP)، supabase.ts (پیکربندی رانتایم)، capacitor، safeStorage، خروجی‌ها
│   ├── services/       ← deepseek.ts (موتور نامه‌نگاری)، manager/* (ماژول تقویم)، پرداخت، نوتیف
│   ├── store/          ← zustand: auth, plan, manager, drafts, archive, template, profile
│   ├── pages/          ← ۱۵ صفحه + pages/manager (۵ تب)
│   ├── components/     ← ناوبری، هدر، مودال‌ها، تقویم جلالی، ادیتور TipTap
│   └── types/ data/ utils/ ← تایپ‌ها، پلن‌ها، قالب‌ها، تبدیل تاریخ جلالی/قمری
├── android/            ← MainActivity + ۴ پلاگین بومی + منابع APK
└── docs/, public/, .github/, .bolt/
```

## ۳. اتصال دیتابیس و نقش هر بک‌اند

| مورد | توضیح | فایل |
|---|---|---|
| API اصلی | `https://app.kateb.site/api/index.php` (قابل تغییر از پنل مدیریت؛ کلید `kateb_api_url` در safeStorage) | `src/lib/api.ts` |
| احراز هویت | هدر `Authorization: Bearer <token ۶۴ hex>` → جدول `kateb_sessions` | `php-api/index.php` (`get_session_user`) |
| Supabase | پیکربندی رانتایم از پنل مدیریت (تب دیتابیس → `setSupabaseConfig`)، بدون anon-key هاردکد | `src/lib/supabase.ts` |
| نقش Supabase در نسخهٔ فعلی | (۱) همگام‌سازی بهینهٔ Task/Event/Holiday/Preferences/AISettings ماژول مدیر — local-first، خطا هرگز UI را نمی‌شکند (۲) دو Edge Function برای مسیر جایگزین | `src/services/manager/managerDb.ts` |
| جدول‌های MySQL | `kateb_users, kateb_otp_codes, kateb_sessions, kateb_settings, profiles, generated_letters, templates, template_ratings, drafts, discovery_usage, coin_orders, plan_orders` | `php-api/schema.sql` |
| سیاست تغییر | جداول جدید فقط **افزودنی (additive)**؛ هیچ DROP/ALTER مخرب؛ RLS فعلی دست‌نخورده | — |

## ۴. مسیرهای API (اکشن‌های PHP)

| گروه | اکشن‌ها | فایل/خط |
|---|---|---|
| زیرساخت | `ping`, `ai_proxy`(GET-style), `ai_test` (مدیر) | `index.php:537,583,712` |
| پرداخت | `payment_callback`, `payment_status`, `coin_packages`, `zarinpal_request`, `zarinpal_verify`, `coin_orders_list`, `plan_request`, `plan_transactions_list`, `bazaar_purchase_verify` | `index.php:631–1425` |
| احراز هویت | `otp_send`, `otp_verify`, `password_login`, `me`, `signout`, `set_password`, `update_account` | `index.php:717–858` |
| مصرف/سهمیه | `increment_ai_usage`, `increment_template_usage`, `usage_get`, `coins_balance`, `coins_deduct`, `discovery_count`, `discovery_record` | `index.php:859–1106` |
| محتوای نامه (قدیمی) | `profiles_*`, `letters_*`, `drafts_*`, `templates_*` | `index.php:884–1070` |
| مدیریت | `admin_users_list/create/update/delete`, `admin_user_set_coins/add_coins/set_plan`, `admin_settings_get/update`, `admin_stats`, `admin_templates_*`, `admin_subs_list`, `admin_transactions_list` | `index.php:1426–1578` |

کلاینت فرانت‌اند همهٔ این‌ها را از `src/lib/api.ts` صدا می‌زند؛ مدیریت خطا: `error` در بدنه + کد HTTP؛ Offline پیش از ارسال چک می‌شود (`OfflineError`).

## ۵. هوش مصنوعی

| مورد | جزئیات |
|---|---|
| محل کلید | فقط ردیف `kateb_settings` در MySQL (`ai_api_url, ai_api_key, ai_models`) — **هیچ کلیدی در فرانت‌اند نیست** |
| مقدار پیش‌فرض | `https://ai.parspack.com/v1` + مدل `qwen/qwen3-32b` |
| مسیر فراخوانی | فرانت → `apiCall('ai_proxy', {messages, model?, temperature?, max_tokens?})` → PHP با cURL (fallback `file_get_contents`) به OpenAI-compatible `/chat/completions` |
| مدیریت خطا | خطای اتصال → ۵۰۲ با پیام فارسی؛ مدل‌های reasoning → انتقال `reasoning` به `content` |
| تست اتصال | اکشن `ai_test` + تب «هوش مصنوعی» پنل مدیریت (`src/pages/AdminPage.tsx`) |
| موتور نامه‌نگاری (قدیمی) | `src/services/deepseek.ts` (کشف هوشمند، تولید، امتیازدهی) — مستقیماً از `ai_proxy` |
| موتور دستیار تقویم | `src/services/manager/managerLlm.ts` → در حال حاضر `supabase.functions('ai-chat')` را صدا می‌زند که **در مخزن وجود ندارد** → همیشه fallback محلی `managerAi.ts` (پارسر قانونی فارسی). در محصول جدید به `ai_proxy` PHP منتقل می‌شود |
| تنظیمات AI کاربر | `managerAiSettings.ts` (local + جدول `ai_settings`) — کلید کاربر، آدرس، مدل، تست اتصال در تب «بیشتر» |

## ۶. پیامک و OTP

| مورد | جزئیات |
|---|---|
| سرویس | الگویی `https://api.iranpayamak.com/ws/v1/sms/pattern` با هدر `Api-Key` |
| تنظیمات | `sms_api_key, sms_pattern_code, sms_line_number` از پنل مدیریت (جدول تنظیمات) |
| جریان | `otp_send` → کد ۶ رقمی، انقضا و محدودیت در جدول `kateb_otp_codes`؛ `otp_verify` → ساخت/به‌روزرسانی کاربر + نشست |
| پاسخ امن | کد OTP در پاسخ عمومی فقط وقتی سرویس پیامک تنظیم نیست برگردانده می‌شود (حالت توسعه) — رفتار حفظ شد |
| پرکردن خودکار | پلاگین بومی `OtpAutofillPlugin` + `OtpNotificationListener` (اندروید) و سرویس `smsAutofillPlugin.ts` |

## ۷. پرداخت و درآمد

| مورد | جزئیات |
|---|---|
| زرین‌پال | `zarinpal_request` → ساخت سفارش `pending` → ریدایرکت → `payment_callback`/`zarinpal_verify` سمت سرور با Merchant از تنظیمات + Sandbox toggle |
| کافه‌بازار | پلاگین بومی `CafeBazaarBillingPlugin.java` + `cafeBazaarBilling.ts` + توکن‌ها در تنظیمات (`bazaar_client_id/secret/refresh_token`) + `bazaar_purchase_verify` |
| اشتراک | پلن‌های free/basic/pro در `src/data/plans.ts`، دو شمارندهٔ مصرف ۳۰روزه (`ai_assistant_usage`, `template_usage`) با ریست خودکار (`reset_usage_if_needed`) |
| جلوگیری از پرداخت تکراری | وضعیت سفارش قبل از تأیید چک می‌شود (`already_paid`) |
| مدارک مالی | `coin_orders`, `plan_orders` + گزارش مدیریت (`admin_transactions_list`) |

## ۸. پنل مدیریت

تب‌ها در `src/pages/AdminPage.tsx`: آمار، کاربران، اشتراک‌ها، پرداخت‌ها، پنل پیامک، هوش مصنوعی، درگاه پرداخت، قالب‌ها، دیتابیس.
- همهٔ اکشن‌های `admin_*` گارد `is_admin` سمت سرور دارند.
- `admin_settings_get/update` مقادیر محرمانه را برای ویرایش برمی‌گرداند — فقط برای مدیر؛ در محصول جدید بازنویسی محتوایی نمی‌شود.
- آمار: `admin_stats` شمارش کاربر/مکتوب/پیش‌نویس/قالب/کشف.

## ۹. اعلان، دیپ‌لینک، آفلاین، خروجی

| قابلیت | فایل |
|---|---|
| یادآور محلی (Notification API + تایمر، سازگار WebView) | `src/services/manager/notifications.ts` |
| FCM Push (مرحله ۱: ثبت توکن) | `src/services/pushNotifications.ts` |
| دیپ‌لینک `kateb://` + App Links | `src/hooks/useDeepLinks.ts`, `docs/APP_LINKS.md`, `public/.well-known/assetlinks.json` |
| آفلاین | `useOnlineStatus` + `OfflineBanner` + local-first ماژول مدیر |
| خروجی PDF/Word/Excel/چاپ | `pdfExport.ts`, `wordExport.ts`, `excelExport.ts`, `printExport.ts` (مربوط به نامه — حفظ فایل) |
| SW/PWA | `public/sw.js` (کش پوسته)، `manifest.json` |

## ۱۰. اندروید / Capacitor

| مورد | جزئیات |
|---|---|
| شناسه | `com.kateb.app` — **تغییر نمی‌کند** (شکستنbilling/assetlinks) |
| پلاگین‌های بومی | `CafeBazaarBillingPlugin`, `DownloadsPlugin`, `OtpAutofillPlugin`, `OtpNotificationListener` |
| ساخت | `npm run cap:sync` → Android Studio؛ CI: `.github/workflows/android-apk.yml` (Node 22, Java 21، ساخت APK ریلیز، نشر در Releases) |
| AIDL | `IInAppBillingService.aidl` برای کافه‌بازار |

## ۱۱. متغیرهای محیطی و پیکربندی

| متغیر | محل مصرف |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | مقدار اولیهٔ `src/lib/supabase.ts` (قابل‌جایگزینی از پنل) |
| `VITE_ZARINPAL_CALLBACK_URL` | `src/lib/api.ts` → callback درگاه |
| `KATEB_DB_*` | `php-api/config.php` |
| Secrets CI | `VITE_*` از GitHub Secrets در ورک‌فلو — در مخزن ذخیره نیستند ✅ |

## ۱۲. یافته‌های امنیتی

1. ⚠️ `schema.sql` کاربر مدیر پیش‌فرض با رمز ضعیف می‌سازد (هش SHA-256 در فایل عمومی دیده می‌شود) → **باید بعد از استقرار فوراً از پنل عوض شود**؛ مقدار هش عمداً در این گزارش بازنشر نمی‌شود.
2. ⚠️ CORS در PHP `*` است — برای اپ موبایل لازم است ولی برای اکشن‌های مدیریتی بهتر است محدود شود (تغییر پرریسک نیست، در فاز جدید فقط مستند شد).
3. ✅ کلیدهای AI/پیامک/پرداخت فقط در DB سرور؛ CI Secretها خارج از مخزن.
4. ✅ `config.php` مسدود (`Require all denied`)؛ اعتبارسنجی سمت سرور برای پرداخت/مدیر برقرار است.

## ۱۳. تکلیف قابلیت‌ها برای محصول جدید («همدم»)

| قابلیت قدیمی | تکلیف |
|---|---|
| ورود OTP/رمز، نشست‌ها، مدیریت کاربران | **حفظ کامل** |
| زرین‌پال + کافه‌بازار + پلن‌ها + شمارنده‌های مصرف | **حفظ کامل** (فقط متن پلن‌ها برای تقویم بازنویسی می‌شود؛ شمارندهٔ «قالب» = «ثبت رویداد هوشمند» تفسیر می‌شود) |
| تنظیمات AI + پروکسی + تست | **حفظ** + اکشن جدید `ai_assist` (زمینهٔ جلالی سرور) برای دستیار |
| پیامک الگویی ایران‌پیامک | **حفظ کامل** |
| پنل مدیریت (۹ تب) | **حفظ** + تب جدید «مناسبت‌ها» |
| ماژول «مدیر من» (تقویم/کارها/دستیار/یادآور) | **ارتقا به هستهٔ محصول** — دستیار به پروکسی PHP وصل و مناسبت‌آگاه می‌شود |
| نامه‌نگاری (کشف/چت/پیش‌نویس/آرشیو/قالب/پروفایل اداری) | **خارج از مسیر ناوبری** (فایل‌ها و جداول حفظ می‌شوند؛ فقط روتینگ حذف می‌شود) |
| خروجی PDF/Word/Excel | حفظ فایل (legacy) |
| Edge Functions و مایگریشن‌های قدیمی | بدون تغییر |
