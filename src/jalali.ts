// Jalali (Persian) calendar helpers with no external dependencies.

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

// روزهای هفته از شنبه تا جمعه
export const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export const WEEKDAY_NAMES = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
];

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

// Gregorian -> Jalali (jalaali-js algorithm)
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) +
    gd +
    g_d_m[gm - 1];
  let jy = -1595 + 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

// Jalali -> Gregorian (jalaali-js algorithm)
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days =
    365 * jy +
    div(jy, 33) * 8 +
    div((jy % 33) + 3, 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 0;
  for (gm = 1; gm <= 12; gm++) {
    if (gd <= sal_a[gm]) break;
    gd -= sal_a[gm];
  }
  return [gy, gm, gd];
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // اسفند: کبیسه — الگوریتم jalaali-js
  const mod = jy % 33;
  const leapMods = [1, 5, 9, 13, 17, 22, 26, 30];
  return leapMods.includes(mod) ? 30 : 29;
}

// ISO Gregorian date string (YYYY-MM-DD) -> [jy, jm, jd]
export function isoToJalali(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return gregorianToJalali(y, m, d);
}

// [jy, jm, jd] -> ISO Gregorian date string
export function jalaliToIso(jy: number, jm: number, jd: number): string {
  const [y, m, d] = jalaliToGregorian(jy, jm, jd);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function toJalaliDate(date: Date): [number, number, number] {
  return gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

export function formatJalali(iso: string): string {
  const [jy, jm, jd] = isoToJalali(iso);
  return `${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`;
}

export function formatJalaliWithWeekday(iso: string): string {
  const date = new Date(iso + "T12:00:00");
  const weekday = (date.getDay() + 1) % 7; // Saturday = 0
  return `${WEEKDAY_NAMES[weekday]}، ${formatJalali(iso)}`;
}

export function weekdayOfIso(iso: string): number {
  const date = new Date(iso + "T12:00:00");
  return (date.getDay() + 1) % 7; // Saturday = 0 .. Friday = 6
}

export function toPersianDigits(s: string | number): string {
  const digits = "۰۱۲۳۴۵۶۷۸۹";
  return String(s).replace(/[0-9]/g, (d) => digits[Number(d)]);
}

export function toEnglishDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

export function formatTime(t: string): string {
  const [h, m] = t.split(":");
  return toPersianDigits(`${h}:${m}`);
}

// duration in hours (may be fractional) from two "HH:MM" strings
export function durationHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

export function formatDuration(start: string, end: string): string {
  const hours = durationHours(start, end);
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${toPersianDigits(h)} ساعت`);
  if (m > 0) parts.push(`${toPersianDigits(m)} دقیقه`);
  return parts.length ? parts.join(" و ") : "۰ دقیقه";
}
