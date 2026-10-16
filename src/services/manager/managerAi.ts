/**
 * Rule-based Persian intent parser for the Life Manager assistant.
 * Port of life_manager/src/services/ai/aiService.ts (pure functions,
 * works fully offline — used as fallback when the LLM edge function is
 * unavailable).
 */
import type { AIIntentResult, AIIntent, TimeSlot, MJalaliDate } from '@/types/manager';
import {
  toFaDigits,
  getTodayJalali,
  addJalaliDays,
  formatJalali,
  getJalaliWeekdayName,
  slotToFa,
  getDayOfWeek,
} from '@/utils/jalaliDate';

const WEEKDAY_MAP: Record<string, number> = {
  'شنبه': 0,
  'یکشنبه': 1,
  'یک شنبه': 1,
  'دوشنبه': 2,
  'دو شنبه': 2,
  'سه‌شنبه': 3,
  'سه شنبه': 3,
  'چهارشنبه': 4,
  'چهار شنبه': 4,
  'پنجشنبه': 5,
  'پنج شنبه': 5,
  'جمعه': 6,
};

const RECURRENCE_PATTERNS: { pattern: RegExp; type: 'daily' | 'weekly' | 'monthly' | 'yearly' }[] = [
  { pattern: /هر\s+روز/i, type: 'daily' },
  { pattern: /هر\s+شب/i, type: 'daily' },
  { pattern: /هر\s+(?:هفته|شنبه|یکشنبه|دوشنبه|سه‌شنبه|چهارشنبه|پنجشنبه|جمعه)/i, type: 'weekly' },
  { pattern: /هر\s+ماه/i, type: 'monthly' },
  { pattern: /هر\s+سال/i, type: 'yearly' },
  { pattern: /ماهانه/i, type: 'monthly' },
  { pattern: /سالانه/i, type: 'yearly' },
  { pattern: /روزانه/i, type: 'daily' },
];

function digitsToNumber(raw: string): number {
  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  let n = 0;
  for (const ch of raw) {
    const idx = faDigits.indexOf(ch);
    n = n * 10 + (idx >= 0 ? idx : parseInt(ch, 10) || 0);
  }
  return n;
}

function extractTime(text: string): string | null {
  const timeMatch = text.match(/(\d{1,2})[:：](\d{2})/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  const faTimeMatch = text.match(/([\u06F0-\u06F9]{1,2})[:：]([\u06F0-\u06F9]{2})/);
  if (faTimeMatch) {
    const h = digitsToNumber(faTimeMatch[1]);
    const m = digitsToNumber(faTimeMatch[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  const hourMatch = text.match(/ساعت\s+([\u06F0-\u06F9]+|[0-9]+)/);
  if (hourMatch) {
    const h = digitsToNumber(hourMatch[1]);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  return null;
}

function extractDayOfMonth(text: string): number | null {
  const match = text.match(/(\d+|[\u06F0-\u06F9]+)\s*(?:م|ام|مین)?\s*(?:هر\s*ماه|ماهانه)/);
  if (match) {
    const day = digitsToNumber(match[1]);
    if (day >= 1 && day <= 31) return day;
  }
  return null;
}

function extractDuration(text: string): number | null {
  const match = text.match(/(\d+|[\u06F0-\u06F9]+)\s*ساعت/);
  if (match) {
    return digitsToNumber(match[1]) * 60;
  }

  const minMatch = text.match(/(\d+|[\u06F0-\u06F9]+)\s*دقیقه/);
  if (minMatch) {
    return digitsToNumber(minMatch[1]);
  }

  return null;
}

function extractRelativeDate(text: string): { offset: number; matched: boolean } {
  if (/امروز/.test(text)) return { offset: 0, matched: true };
  if (/پس\s*فردا/.test(text)) return { offset: 2, matched: true };
  if (/فردا/.test(text)) return { offset: 1, matched: true };
  return { offset: 0, matched: false };
}

function extractWeekday(text: string): number | null {
  for (const [word, idx] of Object.entries(WEEKDAY_MAP)) {
    if (text.includes(word)) return idx;
  }
  return null;
}

function isEventText(text: string): boolean {
  return /جلسه|ملاقات|دیدار|قرار|تاریخ|نوبت|دکتر|پزشک|آزمایش|تولد|سالگرد|کنسرت|همایش|جشن|مراسم|اعلام|برنامه/.test(text);
}

function isTaskText(text: string): boolean {
  return /کار|پرداخت|قسط|تمرین|مطالعه|پروژه|پایان‌نامه|تمیز|خرید|بنویسم|بخوانم|انجام|بشورم|بشور|ببرم|ببر|ماشین|کارواش|دانلود|نصب|تماس|زنگ|پیام|رسید|تحویل|جمع|پاک|شست|نظافت|آشپزی|طبخ|ورزش|باشگاه|کلاس|درس|تکلیف|میوه|نان|لبنیات|سوپرمارکت|بازار|پختن|آماده/.test(text);
}

function isFindFreeTime(text: string): boolean {
  return /وقت\s*آزاد|زمان\s*آزاد|برنامه\s*خالی|وقت\s*خالی|چند ساعت|دو ساعت|سه ساعت|یک ساعت|پیدا\s*کن/.test(text);
}

function isSummary(text: string): boolean {
  if (/امروز.+چیکار|امروز.+چه|برنامه\s*امروز/.test(text)) return true;
  if (/این\s*هفته.+چیکار|این\s*هفته.+چه|برنامه\s*هفته/.test(text)) return true;
  if (/هفته\s*بعد.+چیکار|هفته\s*بعد.+چه/.test(text)) return true;
  if (/هفته\s*آینده.+چیکار|هفته\s*آینده.+چه/.test(text)) return true;
  if (/آخر\s*هفته.+چیکار|آخر\s*هفته.+چه|برنامه\s*آخر\s*هفته/.test(text)) return true;
  if (/فردا.+چیکار|فردا.+چه|برنامه\s*فردا/.test(text)) return true;
  if (/پس\s*فردا.+چیکار|پس\s*فردا.+چه/.test(text)) return true;
  if (/این\s*ماه.+چیکار|این\s*ماه.+چه|رویداد.*ماه/.test(text)) return true;
  // Weekday-specific schedule query: "چهارشنبه برنامم چیه؟"
  if (/(شنبه|یکشنبه|یک\s*شنبه|دوشنبه|دو\s*شنبه|سه‌شنبه|سه\s*شنبه|چهارشنبه|چهار\s*شنبه|پنجشنبه|پنج\s*شنبه|جمعه).+(برنامه|چیکار|چه|کار).*/.test(text)) return true;
  return false;
}

function isCompleteTask(text: string): boolean {
  return /انجام\s*دادم|تمام\s*کردم|انجام\s*شد|کامل\s*کردم/.test(text);
}

/** Remove filler/modal verbs and date/time references to extract a clean task title */
function cleanTitle(text: string): string {
  let t = text;
  // Remove modal/filler phrases
  t = t.replace(/باید/g, '');
  t = t.replace(/می‌?خوام|می‌?خواهم|لازمه|بایدم|گریدم|احتیاج دارم|برای\s+\S+\s+(?:انجام|ردن|کردن)/g, '');
  t = t.replace(/می‌?خوام\s+برم|می‌?خوام\s+بشم|می‌?خوام\s+کنم|می‌?خوام\s+بذارم/g, '');
  t = t.replace(/برم|بشم|کنم|بذارم|بریم/g, '');
  t = t.replace(/رین|لازمه|عزیز/g, '');
  // Remove date references
  t = t.replace(/پس\s*فردا|فردا|امروز/g, '');
  t = t.replace(/هفته\s*بعد|هفته\s*آینده|این\s*هفته/g, '');
  // Remove weekday names
  for (const word of Object.keys(WEEKDAY_MAP)) {
    t = t.replace(new RegExp(word, 'g'), '');
  }
  // Remove time references
  t = t.replace(/ساعت\s+[\u06F0-\u06F9]+|[0-9]+[:：][0-9]+|[\u06F0-\u06F9]+[:：][\u06F0-\u06F9]+/g, '');
  // Remove recurrence words
  t = t.replace(/هر\s+(روز|شب|هفته|ماه|سال)/g, '');
  t = t.replace(/ماهانه|سالانه|روزانه/g, '');
  // Clean up
  t = t.replace(/[،,.؟!]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function resolveWeekdayDate(
  text: string,
  weekday: number,
  today: MJalaliDate,
): { date: MJalaliDate; offset: number } {
  const todayDow = getDayOfWeek(today.year, today.month, today.day);
  const isNextWeek = /هفته\s*بعد|هفته\s*آینده/.test(text);
  const isThisWeek = /این\s*هفته/.test(text);

  if (isNextWeek) {
    let diff = weekday - todayDow;
    if (diff <= 0) diff += 7;
    diff += 7;
    return { date: addJalaliDays(today, diff), offset: diff };
  }

  if (isThisWeek) {
    let diff = weekday - todayDow;
    if (diff < 0) diff += 7;
    return { date: addJalaliDays(today, diff), offset: diff };
  }

  let diff = weekday - todayDow;
  if (diff <= 0) diff += 7;
  return { date: addJalaliDays(today, diff), offset: diff };
}

export function parseUserIntent(input: string): AIIntentResult {
  const text = input.trim();

  if (isFindFreeTime(text)) {
    const duration = extractDuration(text) || 120;
    return {
      intent: { action: 'find_free_time', duration },
      confidence: 0.8,
      needsConfirmation: false,
    };
  }

  if (isSummary(text)) {
    if (/هفته\s*بعد|هفته\s*آینده/.test(text)) {
      return { intent: { action: 'show_upcoming', period: 'next_week' }, confidence: 0.75, needsConfirmation: false };
    }
    if (/آخر\s*هفته/.test(text)) {
      // آخر هفته = جمعه این هفته
      const today = getTodayJalali();
      const todayDow = getDayOfWeek(today.year, today.month, today.day);
      const fridayOffset = (6 - todayDow + 7) % 7 || 7;
      const friday = addJalaliDays(today, fridayOffset);
      return {
        intent: { action: 'show_day', date: formatJalali(friday, 'short') },
        confidence: 0.75,
        needsConfirmation: false,
      };
    }
    if (/هفته|این\s*هفته/.test(text)) {
      return { intent: { action: 'summarize_week' }, confidence: 0.75, needsConfirmation: false };
    }
    if (/ماه/.test(text)) {
      return { intent: { action: 'show_upcoming', period: 'this_month' }, confidence: 0.75, needsConfirmation: false };
    }
    // Weekday-specific: "چهارشنبه برنامم چیه؟"
    const weekday = extractWeekday(text);
    if (weekday !== null && !/امروز|فردا|پس\s*فردا/.test(text)) {
      const today = getTodayJalali();
      const target = resolveWeekdayDate(text, weekday, today);
      return {
        intent: { action: 'show_day', date: formatJalali(target.date, 'short') },
        confidence: 0.75,
        needsConfirmation: false,
      };
    }
    if (/فردا/.test(text)) {
      const tomorrow = addJalaliDays(getTodayJalali(), 1);
      return {
        intent: { action: 'show_day', date: formatJalali(tomorrow, 'short') },
        confidence: 0.75,
        needsConfirmation: false,
      };
    }
    return { intent: { action: 'show_today' }, confidence: 0.75, needsConfirmation: false };
  }

  if (isCompleteTask(text)) {
    return {
      intent: { action: 'complete_task', text },
      confidence: 0.6,
      needsConfirmation: false,
    };
  }

  const recurrence = RECURRENCE_PATTERNS.find((r) => r.pattern.test(text));
  const time = extractTime(text);
  const dayOfMonth = extractDayOfMonth(text);
  const duration = extractDuration(text);
  const relativeDate = extractRelativeDate(text);
  const weekday = extractWeekday(text);

  if (recurrence) {
    let title = text;
    title = title.replace(/هر\s+(روز|شب|هفته|ماه|سال|شنبه|یکشنبه|دوشنبه|سه‌شنبه|چهارشنبه|پنجشنبه|جمعه)/g, '');
    title = title.replace(/ماهانه|سالانه|روزانه/g, '');
    title = title.replace(/ساعت\s+[\u06F0-\u06F9]+|[0-9]+[:：][0-9]+/g, '');
    title = title.replace(/[،,.]/g, ' ');
    title = title.replace(/\s+/g, ' ').trim();

    if (!title || title.length < 2) {
      title = 'کار تکرارشونده';
    }

    const intent: AIIntent = {
      action: 'create_recurring_task',
      title,
      recurrence: recurrence.type,
      time: time || undefined,
      dayOfMonth: dayOfMonth || undefined,
      weekday: weekday !== null ? weekday : undefined,
    };

    let confirmationMessage = '';
    if (recurrence.type === 'monthly' && dayOfMonth) {
      confirmationMessage = `باشه. ${title} رو برای ${toFaDigits(dayOfMonth)}م هر ماه ثبت کنم؟`;
    } else if (recurrence.type === 'weekly' && weekday !== null) {
      const weekdays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
      confirmationMessage = `باشه. ${title} رو برای هر ${weekdays[weekday]}${time ? ' ساعت ' + toFaDigits(time) : ''} ثبت کنم؟`;
    } else if (recurrence.type === 'daily') {
      confirmationMessage = `باشه. ${title} رو برای هر روز${time ? ' ساعت ' + toFaDigits(time) : ''} ثبت کنم؟`;
    } else {
      confirmationMessage = `باشه. ${title} رو به‌صورت ${recurrence.type === 'yearly' ? 'سالانه' : 'تکرارشونده'} ثبت کنم؟`;
    }

    return {
      intent,
      confidence: 0.85,
      needsConfirmation: true,
      confirmationMessage,
    };
  }

  const isEvent = isEventText(text);
  const isTask = isTaskText(text);

  if (isEvent || (!isTask && (time || relativeDate.matched || weekday !== null) && /جلسه|قرار|نوبت|دکتر|دیدار|تاریخ/.test(text))) {
    let title = text;
    title = title.replace(/پس\s*فردا|فردا|امروز/g, '');
    title = title.replace(/هفته\s*بعد|هفته\s*آینده|این\s*هفته/g, '');
    title = title.replace(/ساعت\s+[\u06F0-\u06F9]+|[0-9]+[:：][0-9]+/g, '');
    title = title.replace(/با\s+\S+/g, '');
    title = title.replace(/[،,.]/g, ' ');
    title = title.replace(/\s+/g, ' ').trim();

    if (!title || title.length < 2) title = 'رویداد';

    let targetDate: MJalaliDate;
    const today = getTodayJalali();

    if (relativeDate.matched) {
      targetDate = addJalaliDays(today, relativeDate.offset);
    } else if (weekday !== null) {
      targetDate = resolveWeekdayDate(text, weekday, today).date;
    } else {
      targetDate = today;
    }

    return {
      intent: {
        action: 'create_event',
        title,
        date: formatJalali(targetDate, 'short'),
        time: time || undefined,
        duration: duration || undefined,
      },
      confidence: 0.8,
      needsConfirmation: true,
      confirmationMessage: `این یک رویداد است: ${title} در ${formatJalali(targetDate, 'long')}${time ? ' ساعت ' + toFaDigits(time) : ''}. ثبت کنم؟`,
    };
  }

  let title = cleanTitle(text);
  if (!title || title.length < 2) title = 'کار';

  const today = getTodayJalali();
  let targetDate: MJalaliDate;

  if (relativeDate.matched) {
    targetDate = addJalaliDays(today, relativeDate.offset);
  } else if (weekday !== null) {
    targetDate = resolveWeekdayDate(text, weekday, today).date;
  } else {
    targetDate = today;
  }

  // If no time specified, flag it so the assistant can ask for a time
  if (!time) {
    return {
      intent: {
        action: 'create_task',
        title,
        date: formatJalali(targetDate, 'short'),
        duration: duration || undefined,
      },
      confidence: 0.7,
      needsConfirmation: true,
      confirmationMessage: `«${title}» رو برای ${formatJalali(targetDate, 'long')} ثبت می‌کنم. چه ساعتی خوبه؟`,
      needsTime: true,
    };
  }

  return {
    intent: {
      action: 'create_task',
      title,
      date: formatJalali(targetDate, 'short'),
      time,
      duration: duration || undefined,
    },
    confidence: 0.75,
    needsConfirmation: true,
    confirmationMessage: `«${title}» رو برای ${formatJalali(targetDate, 'long')} ساعت ${toFaDigits(time)} ثبت کنم؟`,
  };
}


export function generateScheduleSuggestion(slots: TimeSlot[], taskTitle: string): string {
  if (slots.length === 0) {
    return 'متأسفانه در روزهای پیش رو زمان آزادی پیدا نکردم. می‌تونی ساعات کاریت رو در تنظیمات تغییر بدی.';
  }

  const best = slots[0];
  if (slots.length === 1) {
    return `تنها زمان آزاد ${slotToFa(best)} هست. ${taskTitle} رو در این زمان قرار بدم؟`;
  }

  const top3 = slots.slice(0, 3);
  let message = `در روزهای پیش‌رو این زمان‌ها رو داری:\n\n`;
  for (const slot of top3) {
    message += `${slotToFa(slot)}\n`;
  }
  message += `\n${slotToFa(best)} رو پیشنهاد می‌کنم چون طولانی‌ترین زمان آزاده.`;

  return message;
}

export function generateDailySummary(
  taskCount: number,
  eventCount: number,
  freeMinutes: number,
): string {
  const today = getTodayJalali();
  const weekday = getJalaliWeekdayName(today);
  let summary = `${weekday} ${toFaDigits(today.day)} ${['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'][today.month - 1]} ${toFaDigits(today.year)}\n\n`;
  summary += `وضعیت امروز:\n`;
  summary += `${toFaDigits(taskCount)} کار\n`;
  summary += `${toFaDigits(eventCount)} رویداد\n`;
  if (freeMinutes > 0) {
    const hours = Math.floor(freeMinutes / 60);
    const mins = freeMinutes % 60;
    if (hours > 0 && mins > 0) {
      summary += `${toFaDigits(hours)} ساعت و ${toFaDigits(mins)} دقیقه زمان آزاد`;
    } else if (hours > 0) {
      summary += `${toFaDigits(hours)} ساعت زمان آزاد`;
    } else {
      summary += `${toFaDigits(mins)} دقیقه زمان آزاد`;
    }
  }
  return summary;
}

export function generateWeeklyInsight(completed: number, pending: number): string {
  const total = completed + pending;
  if (total === 0) return 'این هفته هنوز کاری ثبت نکردی.';
  const rate = Math.round((completed / total) * 100);
  let insight = `این هفته ${toFaDigits(completed)} کار انجام دادی و ${toFaDigits(pending)} کار باقی مانده. نرخ موفقیتت ${toFaDigits(rate)}٪ است. `;
  if (rate >= 80) {
    insight += 'عالی بود! همین روند رو ادامه بده.';
  } else if (rate >= 50) {
    insight += 'خوب بود ولی می‌تونه بهتر بشه. پیشنهاد می‌کنم برنامه‌ات رو سبک‌تر کنی.';
  } else {
    insight += 'به نظر می‌رسه برنامه‌ات سنگینه. پیشنهاد می‌کنم اولویت‌هات رو مرور کنی.';
  }
  return insight;
}

export const managerAi = {
  parseUserIntent,
  generateScheduleSuggestion,
  generateDailySummary,
  generateWeeklyInsight,
};

