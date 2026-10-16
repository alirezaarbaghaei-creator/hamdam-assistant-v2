import type { LetterType, Profile, LetterField, LetterCategory, LetterTone } from '@/types';
import { buildLetter } from '@/services/aiEngine';
import { apiCall } from '@/lib/api';
import { isOnline } from '@/lib/network';

/** Error thrown when the device is offline before an AI request */
export class NetworkOfflineError extends Error {
  constructor(message = 'اتصال اینترنت برقرار نیست') {
    super(message);
    this.name = 'NetworkOfflineError';
  }
}

/** Error thrown when the request fails due to network/server issues */
export class NetworkRequestError extends Error {
  constructor(message = 'ارتباط با سرور برقرار نشد') {
    super(message);
    this.name = 'NetworkRequestError';
  }
}

/** Check network before sending an AI request; throw a user-friendly error if offline. */
function assertOnline(): void {
  if (!isOnline()) {
    throw new NetworkOfflineError(
      'اتصال اینترنت برقرار نیست. برای ارسال درخواست به هوش مصنوعی، ابتدا اتصال اینترنت خود را بررسی کنید.',
    );
  }
}

/** Classify a fetch/supabase error as either offline or server-unreachable. */
function classifyError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (!isOnline() || /fetch|network|abort|timeout/i.test(msg)) {
    if (!isOnline()) {
      return new NetworkOfflineError(
        'اتصال اینترنت برقرار نیست. لطفاً اتصال اینترنت خود را بررسی کنید و دوباره تلاش کنید.',
      );
    }
    return new NetworkRequestError(
      'ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت خود را بررسی کنید و دوباره تلاش کنید.',
    );
  }
  return new NetworkRequestError('سرور در دسترس نیست. لطفاً بعداً دوباره تلاش کنید.');
}

const CLIENT_MAX_RETRIES = 2;
const CLIENT_RETRY_DELAYS = [1000, 2000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chatCompletion(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature = 0.7,
  maxTokens?: number,
  model?: string,
): Promise<string> {
  assertOnline();

  const body: Record<string, unknown> = { messages, temperature };
  if (maxTokens) body.max_tokens = maxTokens;
  if (model) body.model = model;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= CLIENT_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(CLIENT_RETRY_DELAYS[attempt - 1] ?? 2000);
    }

    try {
      const data = await apiCall('ai_proxy', body);

      if (data?.error) {
        lastError = new Error(data.error);
        if (!/429|5\d\d|timeout|در دسترس نیست|طول کشید|نامعتبر/i.test(String(data.error))) {
          throw new NetworkRequestError(String(data.error));
        }
        continue;
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('پاسخ هوش مصنوعی معتبر نیست');
      }
      return content;
    } catch (err) {
      if (err instanceof NetworkOfflineError) throw err;
      if (err instanceof NetworkRequestError && !/429|5\d\d|timeout|در دسترس نیست|طول کشید|نامعتبر/i.test(err.message)) {
        throw err;
      }
      lastError = err;
    }
  }

  if (lastError instanceof NetworkOfflineError) throw lastError;
  throw classifyError(lastError);
}

// ─── Types ─────────────────────────────────────────────────────

export interface AIDiscoveryResult {
  title: string;
  category: LetterCategory;
  description: string;
  confidence: number;
  fields: LetterField[];
  tone: LetterTone;
}

export interface QualityResult {
  score: number;
  feedback: string;
}

export interface ProfileSaveSuggestion {
  fields: { key: string; label: string; value: string }[];
}

// ─── Discovery: AI analyzes user's natural-language request ────

export async function aiDiscoverLetterType(query: string): Promise<AIDiscoveryResult | null> {
  const systemPrompt = `تو «کاتب» هستی؛ یک دستیار هوشمند برای تولید انواع متون، اسناد و خروجی‌های ساختاریافته.

وظیفه تو این است که درخواست کاربر را تحلیل کنی، نوع خروجی موردنیاز را تشخیص بدهی، اطلاعات ضروری را به‌صورت مرحله‌ای از کاربر دریافت کنی و در نهایت متنی کامل، دقیق، متناسب با هدف، مخاطب، لحن و قالب موردنیاز تولید کنی.

تو فقط برای نوشتن نامه طراحی نشده‌ای؛ بلکه باید بتوانی برای انواع درخواست‌ها مانند موارد زیر خروجی تولید کنی:
- نامه‌های اداری و رسمی
- درخواست‌ها و فرم‌های سازمانی
- انشا، مقاله و متن آموزشی
- گزارش، صورت‌جلسه و پروپوزال
- رزومه و متن معرفی
- قرارداد و توافق‌نامه
- فاکتور و پیش‌فاکتور
- آگهی تبلیغاتی و متن فروش
- پیام رسمی، دوستانه یا مناسب شبکه‌های اجتماعی
- ایمیل
- شکایت، درخواست، تعهدنامه و رضایت‌نامه
- برنامه، چک‌لیست و جدول
- متن خلاقانه، داستان، سناریو و کپشن
- هر نوع متن یا سند دیگری که کاربر درخواست کند

## مرحله اول: تحلیل درخواست

ابتدا درخواست کاربر را از نظر موارد زیر تحلیل کن:
1. هدف اصلی کاربر
2. نوع متن یا سند موردنیاز
3. مخاطب یا دریافت‌کننده متن
4. میزان رسمی یا غیررسمی بودن
5. ساختار مناسب خروجی
6. اطلاعات ضروری برای تولید خروجی
7. اطلاعات اختیاری که کیفیت خروجی را بهتر می‌کند
8. زبان، سبک و لحن مناسب

## مرحله دوم: طراحی فرم هوشمند

پس از تشخیص نوع درخواست، یک فرم پویا و اختصاصی برای همان نوع خروجی طراحی کن.
فرم نباید همیشه یکسان باشد. پرسش‌ها باید کاملاً متناسب با درخواست کاربر باشند.

برای مثال:
- برای نامه مرخصی: نام، سمت، واحد، بازه مرخصی، علت، مخاطب و تاریخ
- برای انشا: موضوع، پایه تحصیلی، تعداد کلمات، سبک، مقدمه یا نتیجه‌گیری موردنظر
- برای فاکتور: اطلاعات فروشنده، خریدار، اقلام، تعداد، قیمت، تخفیف، مالیات و جمع کل
- برای رزومه: اطلاعات فردی، تحصیلات، سوابق شغلی، مهارت‌ها و دستاوردها
- برای گزارش: موضوع، بازه زمانی، مخاطب، یافته‌ها، آمار و نتیجه‌گیری
- برای متن تبلیغاتی: محصول، مخاطب هدف، مزیت‌ها، رسانه انتشار و لحن
- برای قرارداد: مشخصات طرفین، موضوع، تعهدات، مبلغ، مدت، شرایط فسخ و امضاها

پرسش‌ها را به دو گروه تقسیم کن:
1. اطلاعات ضروری: بدون آن‌ها تولید خروجی دقیق ممکن نیست.
2. اطلاعات اختیاری: در صورت ارائه، کیفیت و شخصی‌سازی خروجی را افزایش می‌دهند.

اگر اطلاعاتی را بتوانی به‌صورت منطقی و کم‌خطر از متن کاربر برداشت کنی، دوباره درباره آن سؤال نپرس. در صورت نبود اطلاعات ضروری، مقدار حدسی وارد نکن.

Now analyze the user's request and determine:
1. The type of document (title)
2. The category (one of: administrative, legal, personal, official, financial, hr, contract, document, pledge, agreement)
3. A short description
4. The fields needed to write this document
5. The TONE — this is critical. Choose the tone that matches the context:
   - "formal": Official/administrative letters to authorities, organizations, or unknown recipients
   - "semi-formal": Workplace letters to colleagues or supervisors, semi-official communications
   - "informal": Personal letters to acquaintances, neighbors, or community members
   - "friendly": Casual letters to friends, family, or close relations

Respond ONLY in valid JSON with this exact structure:
{
  "title": "string (in Persian)",
  "category": "one of the categories above",
  "description": "string (in Persian, 1-2 sentences)",
  "confidence": number (0-1),
  "tone": "one of: formal, semi-formal, informal, friendly",
  "fields": [
    {
      "id": "unique_short_id",
      "label": "Persian label",
      "type": "text|date|textarea|select|number",
      "required": true|false,
      "optional": true|false,
      "hint": "Persian hint for the AI question",
      "options": ["option1", "option2"] (only for select type),
      "defaultOptions": ["suggested answer 1", "suggested answer 2", ...] (optional, for text/textarea/number types — common answers the user can pick or override),
      "dataSource": "banks|provinces|cities|countries|universities|ministries|leaveTypes|custom" (optional, for select type)
    }
  ]
}

Rules:
- Always include at least 6 fields, at most 12 fields. The more relevant details you collect, the better the final output.
- Be thorough and specific — collect ALL details that would make the document complete and professional.
- For formal and semi-formal letters: include identity fields ("نام و نام خانوادگی متقاضی" required, "کد پرسنلی" optional, "سمت/عنوان شغلی" optional, "اداره/سازمان" optional, "شماره تماس" optional).
- For informal and friendly letters: identity fields are optional. Focus on content, context, and relationship.
- Include recipient information: "نام و سمت گیرنده" or "اداره/بخش مقصد" for formal; "نام گیرنده" for informal/friendly.
- Include date fields when the document involves time periods (start date, end date, response deadline, etc.).
- Include amount/quantity fields for financial or leave letters.
- Include reason/purpose fields as textarea for detailed explanations.
- For leave requests: include leave_type (select with options like "استحقاقی", "استعفاضی", "بدون حقوق"), start_date, end_date, number_of_days, reason, deputy_name (person who covers during absence).
- For invitation letters: include event type, date, location, host name, number of guests, RSVP deadline.
- For contract/pledge: include party names, subject, amount, duration, terms, termination conditions, witness names.
- For invoices: include seller info, buyer info, items, quantities, prices, discount, tax, total, payment terms.
- For essays: include topic, grade level, word count, style, intro/conclusion preference, key points to cover.
- For resumes: include personal info, education, work experience, skills, achievements, languages, references.
- For advertisements: include product, target audience, advantages, medium, tone, call-to-action, special offer.
- For administrative letters: include subject, recipient, priority/urgency, reference number, attachments, action requested.
- For complaints: include subject of complaint, date of incident, parties involved, desired resolution, supporting evidence.
- For reports: include subject, reporting period, findings, statistics, recommendations, conclusion.
- For any field where common answers exist (e.g. urgency level, relationship type, duration, reason category), provide 3-6 "defaultOptions" so the user can quickly pick one or type their own custom answer.
- For text and textarea fields, think about what typical answers users would give and provide them as defaultOptions. Example: for "reason" field, provide common reasons; for "urgency" field, provide ["فوری", "مهم", "عادی"]; for "relationship" field, provide common relationships.
- Mark truly optional context fields (phone, address, additional notes) as optional=true.
- Field IDs should be short snake_case English strings.
- All labels and hints must be in Persian.
- Use "hint" to phrase a natural, conversational question in Persian for each field.`;

  try {
    const content = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      0.3,
      2000,
    );

    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.title || !parsed.fields || !Array.isArray(parsed.fields)) {
      return null;
    }

    const validCategories: LetterCategory[] = [
      'administrative', 'legal', 'personal', 'official',
      'financial', 'hr', 'contract', 'document', 'pledge', 'agreement',
    ];
    const category = validCategories.includes(parsed.category)
      ? parsed.category
      : 'administrative';

    const fields: LetterField[] = parsed.fields.map((f: any) => ({
      id: f.id ?? `field_${Math.random().toString(36).slice(2, 8)}`,
      label: f.label ?? 'فیلد',
      type: f.type ?? 'text',
      required: f.required ?? false,
      optional: f.optional ?? !f.required,
      hint: f.hint,
      options: f.options,
      defaultOptions: Array.isArray(f.defaultOptions) ? f.defaultOptions : undefined,
      dataSource: f.dataSource,
    }));

    const validTones: LetterTone[] = ['formal', 'semi-formal', 'informal', 'friendly'];
    const tone: LetterTone = validTones.includes(parsed.tone) ? parsed.tone : 'formal';

    return {
      title: parsed.title,
      category,
      description: parsed.description ?? '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      fields,
      tone,
    };
  } catch (err) {
    if (err instanceof NetworkOfflineError) throw err;
    if (err instanceof NetworkRequestError) throw err;
    return null;
  }
}

// ─── Letter generation ─────────────────────────────────────────

export async function generateLetter(params: {
  letterType: LetterType;
  profile: Profile | null;
  fieldValues: Record<string, string>;
}): Promise<string> {
  const { letterType, profile, fieldValues } = params;

  const fieldDescriptions = letterType.fields
    .map((f) => `${f.label}: ${fieldValues[f.id] ?? '—'}`)
    .join('\n');

  const profileSection = profile
    ? `نام و نام خانوادگی: ${profile.fullName}
کد ملی: ${profile.nationalId}
کد پرسنلی: ${profile.employeeCode}
سمت: ${profile.jobTitle}
سازمان: ${profile.organization}
${Object.entries(profile.extraFields ?? {})
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n')}`
    : 'بدون پروفایل';

  const tone = letterType.tone ?? 'formal';

  const toneInstructions: Record<string, string> = {
    formal: `لحن: کاملاً رسمی و اداری. از عبارات قالبی مناسب اداری فارسی استفاده کن (مثلاً: «به استحضار می‌رساند»، «لذا از محضر عالی تقاضا می‌گردد»، «مستدعی است دستور فرمایید»).
ساختار استاندارد نامه اداری:
- سطر اول: «بسمه تعالی»
- تاریخ شمسی (در صورت وجود)
- گیرنده (جناب آقای / سرکار خانم + سمت)
- موضوع: کوتاه، دقیق و گویا
- متن بدنه با «با سلام و احترام،» آغاز شود
- پاراگراف معرفی کوتاه (نام، سمت، سازمان)
- پاراگراف‌های اصلی (شرح موضوع، استدلال، درخواست)
- پاراگراف پایانی (درخواست/نتیجه‌گیری)
- «با تجدید احترام»
- نام و نام خانوادگی، سمت و سازمان`,

    'semi-formal': `لحن: نیمه‌رسمی و محترمانه. رسمی اما بدون اغراق در تعارفات اداری. مناسب برای مکاتبات داخلی سازمانی با همکاران یا مدیران.
ساختار:
- «بسمه تعالی» (اختیاری)
- تاریخ (در صورت وجود)
- گیرنده (جناب آقای / سرکار خانم + نام/سمت)
- موضوع: کوتاه و مرتبط
- متن بدنه با «با سلام و احترام،» آغاز شود
- پاراگراف‌های اصلی با شرح موضوع و درخواست
- پاراگراف پایانی با درخواست و تشکر
- «با تجدید احترام» یا «با سپاس»
- نام و سمت فرستنده`,

    informal: `لحن: محترمانه اما صمیمی و غیررسمی. مناسب برای نامه‌های شخصی به همسایه، مدیر مدرسه، یا آشنایان. از اصطلاحات سنگین اداری استفاده نکن.
ساختار:
- تاریخ (در صورت وجود)
- گیرنده (جناب آقای / سرکار خانم + نام)
- متن بدنه با «با سلام و احترام،» آغاز شود
- پاراگراف‌های اصلی با شرح موضوع و درخواست
- پاراگراف پایانی با تشکر
- «با تجدید احترام» یا «با سپاس»
- نام فرستنده`,

    friendly: `لحن: صمیمی، دوستانه و گرم. مناسب برای دعوت‌نامه، تبریک، تشکر، یا نامه به دوستان و خانواده. از اصطلاحات رسمی و اداری (مثل «به استحضار می‌رساند»، «مستدعی است») استفاده نکن.
ساختار:
- تاریخ (در صورت وجود)
- گیرنده (نام به‌صورت صمیمی، مثلاً «همکار گرامی» یا «دوست عزیز»)
- متن بدنه با «با سلام و احترام،» یا «با سلام و آرزوی خیر،» آغاز شود
- پاراگراف‌های اصلی با لحن صمیمی و گیرا
- پاراگراف پایانی با آرزوی خوب یا تشکر
- «با تجدید احترام» یا «با صمیمیت» یا «ارادتمند شما»
- نام فرستنده`,
  };

  const systemPrompt = `تو «کاتب» هستی؛ یک دستیار هوشمند برای تولید انواع متون، اسناد و خروجی‌های ساختاریافته.

وظیفه تو تولید متن نهایی بر اساس اطلاعات جمع‌آوری‌شده از کاربر است.

## مرحله پنجم: تولید خروجی

متن نهایی را بر اساس اطلاعات کاربر تولید کن.

الزامات تولید خروجی:
- متن باید کامل، منسجم، دقیق و قابل استفاده باشد.
- ساختار خروجی باید متناسب با نوع درخواست باشد.
- لحن، واژگان و میزان رسمیت باید با مخاطب و هدف هماهنگ باشد.
- از کلی‌گویی و جملات تکراری خودداری کن.
- اطلاعاتی را که کاربر ارائه نکرده است جعل نکن.
- در صورت نبود اطلاعات، از عبارت‌هایی مانند [نام]، [تاریخ]، [مبلغ] یا [تکمیل شود] استفاده کن.
- برای اسناد رسمی، قالب استاندارد و قابل چاپ ایجاد کن.
- برای فاکتور و اسناد مالی، محاسبات را دقیق انجام بده.
- برای متون آموزشی، سطح سنی و تحصیلی مخاطب را رعایت کن.
- برای متن‌های خلاقانه، از لحن و سبک درخواستی کاربر پیروی کن.
- در صورت درخواست، خروجی را در قالب جدول، فهرست، JSON، Markdown، HTML یا قالب مناسب دیگر ارائه کن.
- از اضافه‌کردن توضیحات غیرضروری قبل یا بعد از متن نهایی خودداری کن.

**قانون طلایی:** خروجی تو باید **فقط و فقط متن نهایی** باشد. هیچ مقدمه، توضیح، عذرخواهی، یا متن اضافی قبل یا بعد از متن ننویس.

**حریم خصوصی و امنیت اطلاعات — بسیار مهم:**
- به‌هیچ‌عنوان اطلاعات حساسی که کاربر ارائه نکرده (کد ملی، شماره تماس، شماره حساب، کد پرسنلی) را در متن قرار نده.
- اگر فیلدی خالی است یا اطلاعاتی ندارد، آن بخش را حذف کن یا با عبارت عمومی بنویس. هرگز اطلاعات شخصی یا حساس را حدس نزن یا نسخ نکن.

**قواعد نگارشی:**
۱. زبان: فارسی معیار با رعایت کامل قواعد نگارشی و املایی (نیم‌فاصله، علائم نگارشی، فعل‌ها و ضمایر صحیح).
۲. متن بدنه باید کامل و محتوامند باشد، نه فقط فهرست فیلدها. اطلاعات فیلدها را در جریان طبیعی متن بگنجان.
۳. هر پاراگراف باید حداقل ۲-۴ جمله باشد و ارتباط منطقی با پاراگراف قبلی و بعدی داشته باشد.
۴. به‌هیچ‌عنوان از نشانه‌هایی مثل {{...}} یا [خالی] یا «...» به‌جای مقادیر واقعی استفاده نکن؛ همه مقادیر را واقعی بنویس.
۵. اگر اطلاعاتی در فیلدها نیست، آن بخش را حذف کن یا با عبارت عمومی بنویس؛ هرگز نام، تاریخ، شماره، مبلغ، سمت یا واقعیت جدیدی را حدس نزن.
۶. طول متن باید متناسب با نوع مکتوب باشد — نه کوتاه و تلگرافی، نه اغراق‌آمیز.
۷. موضوع را دقیق و مرتبط با محتوا بنویس.

${toneInstructions[tone]}

نوع مکتوب: ${letterType.title}
دسته‌بندی: ${letterType.category}
لحن: ${tone}
${letterType.promptHint ? `دستورالعمل تکمیلی: ${letterType.promptHint}` : ''}

اطلاعات فرستنده:
${profileSection}

جزئیات مکتوب:
${fieldDescriptions}`;

  try {
    const content = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `لطفاً ${letterType.title} را بر اساس اطلاعات بالا، به‌صورت کامل و رسمی نگارش کن. متن نامه باید کامل، ساختاریافته و آماده استفاده باشد؛ فقط فهرست اطلاعات را تکرار نکن. فقط متن نامه را بنویس و هیچ متن اضافی قبل یا بعد از آن قرار نده.` },
      ],
      0.75,
      8000,
    );

    if (content.trim()) return content.trim();
    return buildLetter(letterType, profile, fieldValues);
  } catch (err) {
    if (err instanceof NetworkOfflineError) throw err;
    if (err instanceof NetworkRequestError) throw err;
    return buildLetter(letterType, profile, fieldValues);
  }
}

// ─── Quality scoring ───────────────────────────────────────────

export interface QualityResult {
  score: number;
  feedback: string;
  /** بخش‌های برجسته ارزیابی */
  details?: {
    completeness: number;
    formality: number;
    structure: number;
    tone: number;
    accuracy: number;
  };
  /** نکات قوت */
  strengths?: string[];
  /** پیشنهادهای بهبود */
  improvements?: string[];
}

export async function aiScoreQuality(
  letterType: LetterType,
  content: string,
  fieldValues: Record<string, string>,
): Promise<QualityResult | null> {
  const systemPrompt = `تو یک ارزیاب متخصص مکاتبات فارسی هستی.
نامه زیر را ارزیابی کن و یک امتیاز کیفیت و بازخورد دقیق ارائه بده.

معیارهای ارزیابی:
- تکمیل بودن اطلاعات (completeness)
- تناسب لحن با نوع مکتوب (tone) — آیا لحن نامه با نوع و هدف آن همخوانی دارد؟ نامه دوستانه نباید بیش از حد رسمی باشد و نامه رسمی نباید بیش از حد صمیمی باشد.
- ساختار استاندارد (structure)
- دقت در استفاده از اطلاعات واردشده (accuracy)
- رعایت قواعد نگارشی و املایی فارسی (formality)

فقط و فقط در قالب JSON معتبر پاسخ بده:
{
  "score": عددی بین ۰ تا ۱۰۰,
  "feedback": "متن فارسی، ۲-۳ جمله با پیشنهادهای بهبود مشخص",
  "details": {
    "completeness": عدد ۰-۱۰۰ برای تکمیل بودن,
    "formality": عدد ۰-۱۰۰ برای تناسب لحن و رسمی بودن,
    "structure": عدد ۰-۱۰۰ برای ساختار,
    "tone": عدد ۰-۱۰۰ برای تناسب لحن با نوع مکتوب,
    "accuracy": عدد ۰-۱۰۰ برای دقت اطلاعات
  },
  "strengths": ["نقطه قوت ۱", "نقطه قوت ۲"],
  "improvements": ["پیشنهاد بهبود ۱", "پیشنهاد بهبود ۲"]
}`;

  const fieldSummary = letterType.fields
    .map((f) => `${f.label}: ${fieldValues[f.id] ?? '—'}`)
    .join('\n');

  try {
    const result = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `نوع مکتوب: ${letterType.title}\n\nفیلدها:\n${fieldSummary}\n\nمتن نامه:\n${content}` },
      ],
      0.3,
      1500,
    );

    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      score: typeof parsed.score === 'number' ? Math.min(100, Math.max(0, parsed.score)) : 75,
      feedback: parsed.feedback ?? 'ارزیابی انجام شد.',
      details: parsed.details,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    };
  } catch (err) {
    if (err instanceof NetworkOfflineError) throw err;
    if (err instanceof NetworkRequestError) throw err;
    return null;
  }
}

// ─── Profile field suggestions ─────────────────────────────────

export async function aiSuggestProfileFields(
  fieldValues: Record<string, string>,
  letterType: LetterType,
): Promise<ProfileSaveSuggestion | null> {
  const systemPrompt = `You are an assistant that helps users save useful information to their profile.
Analyze the letter fields and identify values that could be useful to save for future letters
(e.g., organization name, job title, employee code, phone number, etc.).

Respond ONLY in valid JSON:
{
  "fields": [
    { "key": "Persian field name", "label": "Persian label", "value": "the actual value from the letter" }
  ]
}

Only suggest fields that have actual values (not empty or placeholder).
Only suggest fields that would be reusable in future letters (not letter-specific details like dates or leave duration).
Return at most 5 fields. If nothing is worth saving, return {"fields": []}.`;

  const fieldValueList = Object.entries(fieldValues)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => {
      const field = letterType.fields.find((f) => f.id === k);
      return `${field?.label ?? k}: ${v}`;
    })
    .join('\n');

  if (!fieldValueList) return { fields: [] };

  try {
    const result = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Letter type: ${letterType.title}\n\nField values:\n${fieldValueList}` },
      ],
      0.3,
      1000,
    );

    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      fields: Array.isArray(parsed.fields) ? parsed.fields : [],
    };
  } catch (err) {
    if (err instanceof NetworkOfflineError) throw err;
    if (err instanceof NetworkRequestError) throw err;
    return { fields: [] };
  }
}
