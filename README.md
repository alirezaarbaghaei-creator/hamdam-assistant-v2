# همدم — دستیار هوشمند تقویم و برنامه (Persian AI Calendar Assistant)

همدم یک مدیر برنامه شخصی است: با یک جمله فارسی («فردا ساعت ۱۰ کلاس زبان دارم»،
«چهارشنبه این هفته باید برم باشگاه») رویداد یا یادآوری را در تقویم جلالی ثبت می‌کند،
مناسبت‌های مهم (یلدا، چهارشنبه‌سوری، روز معلم، روز ولنتاین و…) را به‌یاد می‌آورد و
گزارش روز و هفته می‌دهد.

این پروژه روی زیرساخت کامل محصول قبلی («کاتب») ساخته شده است: همان PHP/MySQL API،
همان احراز هویت OTP/رمز، همان زرین‌پال و کافه‌بازار، همان پنل پیامک و همان پروکسی
هوش مصنوعی — فقط لایه کسب‌وکار و رابط کاربری بازطراحی شده است.

## معماری (سه لایه)

| لایه | مسیر | توضیح |
|---|---|---|
| زیرساخت مشترک | `php-api/`, `src/lib/`, `src/services/{pushNotifications,smsAutofillPlugin,cafeBazaarBilling}`, `src/store/{authStore,planStore}` | احراز هویت، API، دیتابیس، پیامک، پرداخت، AI، اشتراک — **بدون تغییر** |
| منطق کسب‌وکار | `src/services/manager/*`, `src/data/occasions.ts`, `src/store/managerStore.ts`, `src/types/manager.ts` | دستیار جلالی، موتور زمان‌بندی، مناسبت‌ها، یادآوری |
| رابط کاربری | `src/pages/{Dashboard,ManagerPage,PricingPage,AccountPage,AdminPage}`, `src/pages/manager/*`, `src/components/*` | تقویم، دستیار گفتگویی، داشبورد، پنل مدیریت |

## راه‌اندازی

```bash
npm install
npm run dev        # توسعه وب
npm run build      # خروجی نهایی (tsc + vite)
npm run cap:sync   # همگام‌سازی اندروید (Capacitor)
```

## استقرار بک‌اند (تغییرات افزودنی)

1. فایل‌های `php-api/` را مثل قبل روی هاست (مثلاً `public_html/api/`) نگه دارید.
2. اسکریپت `php-api/migration-hamdam.sql` را روی همان دیتابیس اجرا کنید
   (جداول `occasions`, `calendar_events`, `manager_tasks` + داده اولیه مناسبت‌ها).
   اجرای تکراری بی‌خطر است؛ برای بازگشت `php-api/rollback-hamdam.sql`.
3. اگر API قبلاً اجرا شده باشد، `index.php` جدید هم به‌صورت خودکار همین جداول را می‌سازد.
4. اکشن‌های جدید API: `ai_assist`، `holidays_all`، `manager_event_save`،
   `manager_task_save`، `admin_occasion_save`، `admin_occasion_delete`.

## امنیت

- کلیدهای هوش مصنوعی، پیامک و پرداخت فقط در جدول `kateb_settings` سرور نگهداری می‌شوند و هرگز به فرانت‌اند نمی‌رسند.
- بعد از اولین استقرار، رمز کاربر مدیر پیش‌فرض را فوراً از پنل مدیریت عوض کنید.
- تغییرات دیتابیس کاملاً افزودنی است؛ داده‌ها و سوابق مالی قبلی دست‌نخورده می‌مانند.

مستندات کامل: `AUDIT.md` (ممیزی زیرساخت)، `REPORT-HAMDAM.md` (گزارش تغییرات)، `docs/APP_LINKS.md` (دیپ‌لینک).
