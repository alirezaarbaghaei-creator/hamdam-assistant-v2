/**
 * Jalali (Shamsi) date utilities for the Life Manager module.
 * Direct port of life_manager/src/services/jalaliDate.ts — uses the
 * { year, month, day } MJalaliDate shape (distinct from @/utils/jalali).
 */
import type { MJalaliDate, TimeSlot } from '@/types/manager';

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const JALALI_WEEKDAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
];

export const JALALI_WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export const FRIDAY_INDEX = 6;

export const HIJRI_MONTHS = [
  'محرم',
  'صفر',
  'ربیع‌الاول',
  'ربیع‌الثانی',
  'جمادی‌الاول',
  'جمادی‌الثانی',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذی‌القعده',
  'ذی‌الحجه',
];

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function mod(a: number, b: number): number {
  return a - div(a, b) * b;
}

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];

  let jm = 0;
  let jump = 0;
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalali year ' + jy);

  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export function toGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  const r = jalCal(jy);
  return d2g(g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1);
}

export function toJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const r = jalCal(gy - 621);
  const jdn = g2d(gy, gm, gd) - g2d(r.gy, 3, r.march);
  let jy = gy - 621;
  let k = jdn;

  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + div(k, 31);
      const jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  const jm = 7 + div(k, 30);
  const jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function getMonthDays(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

export function getDayOfWeek(jy: number, jm: number, jd: number): number {
  const g = toGregorian(jy, jm, jd);
  const date = new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
  return (date.getUTCDay() + 1) % 7;
}

export function getTodayJalali(): MJalaliDate {
  const now = new Date();
  const j = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { year: j.jy, month: j.jm, day: j.jd };
}

export function formatJalali(date: MJalaliDate, format: 'full' | 'long' | 'short' = 'full'): string {
  const weekday = JALALI_WEEKDAYS[getDayOfWeek(date.year, date.month, date.day)];
  if (format === 'full') {
    return `${weekday} ${toFaDigits(date.day)} ${JALALI_MONTHS[date.month - 1]} ${toFaDigits(date.year)}`;
  }
  if (format === 'long') {
    return `${toFaDigits(date.day)} ${JALALI_MONTHS[date.month - 1]} ${toFaDigits(date.year)}`;
  }
  return `${toFaDigits(date.year)}/${toFaDigits(String(date.month).padStart(2, '0'))}/${toFaDigits(String(date.day).padStart(2, '0'))}`;
}

export function parseJalali(input: string): MJalaliDate | null {
  const enInput = toEnDigits(input.trim());
  const parts = enInput.split('/').map((p) => parseInt(p.trim(), 10));
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
}

export function jalaliToDate(date: MJalaliDate): Date {
  const g = toGregorian(date.year, date.month, date.day);
  return new Date(g.gy, g.gm - 1, g.gd);
}

export function dateToJalali(date: Date): MJalaliDate {
  const j = toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return { year: j.jy, month: j.jm, day: j.jd };
}

export function isoDateToJalali(iso: string): MJalaliDate {
  const parts = iso.split('T')[0].split('-').map(Number);
  const j = toJalali(parts[0], parts[1], parts[2]);
  return { year: j.jy, month: j.jm, day: j.jd };
}

export function addJalaliDays(date: MJalaliDate, days: number): MJalaliDate {
  const g = jalaliToDate(date);
  g.setDate(g.getDate() + days);
  return dateToJalali(g);
}

export function compareDates(a: MJalaliDate, b: MJalaliDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function isSameDay(a: MJalaliDate, b: MJalaliDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function getStartOfWeek(date: MJalaliDate): MJalaliDate {
  const dow = getDayOfWeek(date.year, date.month, date.day);
  return addJalaliDays(date, -dow);
}

export function getEndOfWeek(date: MJalaliDate): MJalaliDate {
  return addJalaliDays(getStartOfWeek(date), 6);
}

export function getStartOfMonth(date: MJalaliDate): MJalaliDate {
  return { year: date.year, month: date.month, day: 1 };
}

export function getEndOfMonth(date: MJalaliDate): MJalaliDate {
  return { year: date.year, month: date.month, day: getMonthDays(date.year, date.month) };
}

export function getWeekDates(date: MJalaliDate): MJalaliDate[] {
  const start = getStartOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addJalaliDays(start, i));
}

export function getMonthMatrix(date: MJalaliDate): (MJalaliDate | null)[][] {
  const firstDay = getStartOfMonth(date);
  const startDow = getDayOfWeek(firstDay.year, firstDay.month, firstDay.day);
  const daysInMonth = getMonthDays(date.year, date.month);

  const weeks: (MJalaliDate | null)[][] = [];
  let currentWeek: (MJalaliDate | null)[] = [];

  for (let i = 0; i < startDow; i++) currentWeek.push(null);

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push({ year: date.year, month: date.month, day });
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  return weeks;
}

export function isFriday(date: MJalaliDate): boolean {
  return getDayOfWeek(date.year, date.month, date.day) === FRIDAY_INDEX;
}

export function getJalaliWeekdayName(date: MJalaliDate): string {
  return JALALI_WEEKDAYS[getDayOfWeek(date.year, date.month, date.day)];
}

export function toFaDigits(input: string | number): string {
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(input).replace(/[0-9]/g, (d) => faDigits[parseInt(d, 10)]);
}

export function toEnDigits(input: string): string {
  return input.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function jalaliToISO(date: MJalaliDate, time?: string): string {
  const g = toGregorian(date.year, date.month, date.day);
  const dateStr = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  return time ? `${dateStr}T${time}:00` : `${dateStr}T00:00:00`;
}

export function isoToJalali(iso: string): MJalaliDate {
  const parts = iso.split('T')[0].split('-').map(Number);
  const j = toJalali(parts[0], parts[1], parts[2]);
  return { year: j.jy, month: j.jm, day: j.jd };
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${toFaDigits(hours)} ساعت و ${toFaDigits(mins)} دقیقه`;
  if (hours > 0) return `${toFaDigits(hours)} ساعت`;
  return `${toFaDigits(mins)} دقیقه`;
}

export function slotToFa(slot: TimeSlot): string {
  return `${slot.weekdayName} ${toFaDigits(slot.startTime)} تا ${toFaDigits(slot.endTime)}`;
}

export function getTodayISO(): string {
  const today = getTodayJalali();
  const g = toGregorian(today.year, today.month, today.day);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

/** Convert a Gregorian { gy, gm, gd } to ISO date (YYYY-MM-DD) */
export function gregorianToISO(g: { gy: number; gm: number; gd: number }): string {
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

export function gregorianToHijri(gy: number, gm: number, gd: number): { hy: number; hm: number; hd: number } {
  const julianDay =
    Math.floor((1461 * (gy + 4800 + Math.floor((gm - 14) / 12))) / 4) +
    Math.floor((367 * (gm - 2 - 12 * Math.floor((gm - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((gy + 4900 + Math.floor((gm - 14) / 12)) / 100)) / 4) +
    gd -
    32075;

  const l0 = julianDay - 1948440 + 10632;
  const n = Math.floor((l0 - 1) / 10631);
  const l1 = l0 - 10631 * n + 354;
  const j =
    Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719) +
    Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238);
  const l2 =
    l1 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const hm = Math.floor((24 * l2) / 709);
  const hd = l2 - Math.floor((709 * hm) / 24);
  const hy = 30 * n + j - 30;

  return { hy, hm, hd };
}

export function getHijriForDate(gy: number, gm: number, gd: number): { hy: number; hm: number; hd: number } {
  return gregorianToHijri(gy, gm, gd);
}

export function formatHijri(h: { hy: number; hm: number; hd: number }): string {
  return `${toFaDigits(h.hd)} ${HIJRI_MONTHS[h.hm - 1]} ${toFaDigits(h.hy)}`;
}

export function getGregorianForJalali(jalali: MJalaliDate): { gy: number; gm: number; gd: number } {
  return toGregorian(jalali.year, jalali.month, jalali.day);
}

export function formatGregorian(g: { gy: number; gm: number; gd: number }): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${g.gd} ${months[g.gm - 1]} ${g.gy}`;
}

