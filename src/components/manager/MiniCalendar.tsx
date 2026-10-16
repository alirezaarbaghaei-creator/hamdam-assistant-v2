import { ChevronRight, ChevronLeft } from 'lucide-react';
import type { MJalaliDate } from '@/types/manager';
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS_SHORT,
  getMonthMatrix,
  getTodayJalali,
  isFriday,
  isSameDay,
  toFaDigits,
  toGregorian,
  gregorianToISO,
  formatGregorian,
  getHijriForDate,
  formatHijri,
} from '@/utils/jalaliDate';

interface MiniCalendarProps {
  view: MJalaliDate;
  selected: MJalaliDate;
  onSelect: (d: MJalaliDate) => void;
  onNavigate: (dir: -1 | 1) => void;
  /** Optional dot marker (tasks/events) keyed by Gregorian ISO date */
  hasItems?: (iso: string) => boolean;
  /** Highlight official holidays */
  isHoliday?: (iso: string) => boolean;
  /** Occasion titles keyed by Gregorian ISO date (for tooltip) */
  occasionTitles?: (iso: string) => string[];
}

export function toISO(d: MJalaliDate): string {
  return gregorianToISO(toGregorian(d.year, d.month, d.day));
}

export function MiniCalendar({ view, selected, onSelect, onNavigate, hasItems, isHoliday, occasionTitles }: MiniCalendarProps) {
  const matrix = getMonthMatrix(view);
  const today = getTodayJalali();

  return (
    <div className="glass rounded-3xl p-4 shadow-glass">
      {/* Month header */}
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => onNavigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100"
          aria-label="ماه قبل"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-base font-bold text-slate-700">
            {JALALI_MONTHS[view.month - 1]} {toFaDigits(view.year)}
          </p>
        </div>
        <button
          onClick={() => onNavigate(1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100"
          aria-label="ماه بعد"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {JALALI_WEEKDAYS_SHORT.map((w, i) => (
          <div
            key={w}
            className={`py-1 text-center text-[11px] font-medium ${
              i === 6 ? 'text-red-400' : 'text-slate-400'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="space-y-1">
        {matrix.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              if (!day) return <div key={`e-${di}`} />;
              const iso = toISO(day);
              const isSelected = isSameDay(day, selected);
              const isToday = isSameDay(day, today);
              const holiday = isHoliday?.(iso);
              const marker = hasItems?.(iso);
              const occTitles = occasionTitles?.(iso) ?? [];
              const g = toGregorian(day.year, day.month, day.day);
              const h = getHijriForDate(g.gy, g.gm, g.gd);
              const tooltipParts = [
                formatGregorian(g),
                formatHijri(h),
                ...occTitles,
              ];
              return (
                <button
                  key={iso}
                  onClick={() => onSelect(day)}
                  title={tooltipParts.join(' | ')}
                  className={`relative flex h-9 items-center justify-center rounded-xl text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                      : isToday
                        ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200'
                        : holiday
                          ? 'bg-red-50 text-red-500 hover:bg-red-100'
                          : isFriday(day)
                            ? 'text-red-400 hover:bg-slate-100'
                            : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {toFaDigits(day.day)}
                  {marker && (
                    <span
                      className={`absolute bottom-1 h-1 w-1 rounded-full ${
                        isSelected ? 'bg-white' : holiday ? 'bg-red-500' : 'bg-teal-500'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
