import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import {
  type JalaliDate,
  todayJalali,
  jalaliMonthName,
  daysInJalaliMonth,
  formatJalaliDate,
  toPersianDigits,
  parseJalaliString,
  jalaliToGregorian,
} from '@/utils/jalali';

interface JalaliDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  onClose?: () => void;
}

export function JalaliDatePicker({ value, onChange, onClose }: JalaliDatePickerProps) {
  const initial = parseJalaliString(value) ?? todayJalali();
  const [view, setView] = useState<{ jy: number; jm: number }>({ jy: initial.jy, jm: initial.jm });
  const [selected, setSelected] = useState<JalaliDate>(initial);
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const yearsStart = Math.floor(initial.jy / 12) * 12;
  const [yearPage, setYearPage] = useState(yearsStart);

  const days = daysInJalaliMonth(view.jy, view.jm);

  // First weekday offset (Saturday = 0 in Persian calendar)
  const getFirstWeekday = () => {
    const g = jalaliToGregorian(view.jy, view.jm, 1);
    // JS getDay: 0=Sunday, 1=Monday, ... 6=Saturday
    // Persian week starts Saturday=0
    return (g.getDay() + 1) % 7;
  };

  const firstWeekday = getFirstWeekday();
  const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  const handlePrevMonth = () => {
    if (mode === 'years') {
      setYearPage((p) => p - 12);
      return;
    }
    setView((v) => {
      let jm = v.jm - 1;
      let jy = v.jy;
      if (jm < 1) {
        jm = 12;
        jy -= 1;
      }
      return { jy, jm };
    });
  };

  const handleNextMonth = () => {
    if (mode === 'years') {
      setYearPage((p) => p + 12);
      return;
    }
    setView((v) => {
      let jm = v.jm + 1;
      let jy = v.jy;
      if (jm > 12) {
        jm = 1;
        jy += 1;
      }
      return { jy, jm };
    });
  };

  const handleSelectDay = (day: number) => {
    const date: JalaliDate = { jy: view.jy, jm: view.jm, jd: day };
    setSelected(date);
    onChange(formatJalaliDate(date));
    onClose?.();
  };

  const handleSelectMonth = (jm: number) => {
    setView((v) => ({ ...v, jm }));
    setMode('days');
  };

  const handleSelectYear = (jy: number) => {
    setView((v) => ({ ...v, jy }));
    setMode('months');
  };

  const years = Array.from({ length: 12 }, (_, i) => yearPage + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="glass rounded-3xl p-5 shadow-glass-lg w-72 mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevMonth}
          className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {mode === 'days' && (
            <button
              onClick={() => setMode('months')}
              className="text-sm font-bold text-slate-900 hover:text-indigo-600 transition-colors"
            >
              {jalaliMonthName(view.jm)}
            </button>
          )}
          <button
            onClick={() => setMode('years')}
            className="text-sm font-bold text-slate-900 hover:text-indigo-600 transition-colors"
          >
            {toPersianDigits(view.jy)}
          </button>
        </div>
        <button
          onClick={handleNextMonth}
          className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      {/* Days mode */}
      {mode === 'days' && (
        <>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-medium text-slate-400 py-1"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
              const isSelected =
                selected.jd === day &&
                selected.jm === view.jm &&
                selected.jy === view.jy;
              const isToday = (() => {
                const t = todayJalali();
                return t.jd === day && t.jm === view.jm && t.jy === view.jy;
              })();
              return (
                <button
                  key={day}
                  onClick={() => handleSelectDay(day)}
                  className={`h-9 w-9 rounded-lg text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                      : isToday
                        ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200'
                        : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Months mode */}
      {mode === 'months' && (
        <div className="grid grid-cols-3 gap-2">
          {months.map((m) => (
            <button
              key={m}
              onClick={() => handleSelectMonth(m)}
              className={`rounded-xl py-3 text-sm font-medium transition-all ${
                view.jm === m
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {jalaliMonthName(m)}
            </button>
          ))}
        </div>
      )}

      {/* Years mode */}
      {mode === 'years' && (
        <div className="grid grid-cols-3 gap-2">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => handleSelectYear(y)}
              className={`rounded-xl py-3 text-sm font-medium transition-all ${
                view.jy === y
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {toPersianDigits(y)}
            </button>
          ))}
        </div>
      )}

      {/* Manual input */}
      <div className="mt-4 pt-4 border-t border-slate-200/60">
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="۱۴۰۵/۰۵/۱۵"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-center text-slate-900 placeholder:text-slate-400 focus-ring"
            dir="ltr"
          />
          <button
            onClick={() => {
              const parsed = parseJalaliString(value);
              if (parsed) {
                setSelected(parsed);
                setView({ jy: parsed.jy, jm: parsed.jm });
                onClose?.();
              }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
