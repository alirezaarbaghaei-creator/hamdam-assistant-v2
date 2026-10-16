/**
 * Jalali (Shamsi) date conversion utilities.
 * Algorithm from the well-known jdf.scr.ir implementation.
 */

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

function div(a: number, b: number): number {
  return Math.floor(a / b);
}

function mod(a: number, b: number): number {
  return a - div(a, b) * b;
}

function isGregorianLeap(gy: number): boolean {
  return (mod(gy, 4) === 0 && mod(gy, 100) !== 0) || mod(gy, 400) === 0;
}

export function gregorianToJalali(date: Date): JalaliDate {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  return gregorianToJalaliNums(gy, gm, gd);
}

function gregorianToJalaliNums(gy: number, gm: number, gd: number): JalaliDate {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    div(gy2, 4) -
    div(gy2, 100) +
    div(gy2, 400) -
    79 +
    g_d_m[gm - 1] +
    gd;
  jy += 33 * div(days, 12053);
  days = mod(days, 12053);
  jy += 4 * div(days, 1461);
  days = mod(days, 1461);
  if (days > 365) {
    jy += div(days - 1, 365);
    days = mod(days - 1, 365);
  }
  let jm: number;
  let jd: number;
  if (days < 186) {
    jm = 1 + div(days, 31);
    jd = mod(days, 31) + 1;
  } else {
    days -= 186;
    jm = 7 + div(days, 30);
    jd = mod(days, 30) + 1;
  }
  return { jy, jm, jd };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days =
    365 * jy +
    div(jy, 33) * 8 +
    div(mod(jy, 33) + 3, 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : 186 + (jm - 7) * 30);
  gy += 400 * div(days, 146097);
  days = mod(days, 146097);
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    if (days > 365) days++;
    gy += 4 * div(days, 1461);
    days = mod(days, 1461);
    if (days > 365) {
      gy += div(days - 1, 365);
      days = mod(days - 1, 365);
    }
  }
  const sal_a = [
    0,
    31,
    28 + (isGregorianLeap(gy) ? 1 : 0),
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
  let gd = days + 1;
  let gm: number;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return new Date(gy, gm - 1, gd);
}

const persianMonthNames = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => persianDigits[parseInt(d, 10)]);
}

export function toEnglishDigits(input: string): string {
  return input.replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)));
}

export function formatJalaliDate(date: JalaliDate): string {
  const y = toPersianDigits(date.jy);
  const m = toPersianDigits(String(date.jm).padStart(2, '0'));
  const d = toPersianDigits(String(date.jd).padStart(2, '0'));
  return `${y}/${m}/${d}`;
}

export function formatJalaliDateLong(date: JalaliDate): string {
  return `${toPersianDigits(date.jd)} ${persianMonthNames[date.jm - 1]} ${toPersianDigits(date.jy)}`;
}

export function todayJalali(): JalaliDate {
  return gregorianToJalali(new Date());
}

export function parseJalaliString(str: string): JalaliDate | null {
  const clean = toEnglishDigits(str).replace(/[\/\-\.]/g, '/').trim();
  const parts = clean.split('/');
  if (parts.length !== 3) return null;
  const jy = parseInt(parts[0], 10);
  const jm = parseInt(parts[1], 10);
  const jd = parseInt(parts[2], 10);
  if (isNaN(jy) || isNaN(jm) || isNaN(jd)) return null;
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  return { jy, jm, jd };
}

export function jalaliMonthName(month: number): string {
  return persianMonthNames[month - 1] ?? '';
}

export function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // Esfand: 29 or 30 depending on leap year
  const g = jalaliToGregorian(jy, 12, 1);
  const next = jalaliToGregorian(jy + 1, 1, 1);
  const diff = Math.round((next.getTime() - g.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export { persianMonthNames, persianDigits };
