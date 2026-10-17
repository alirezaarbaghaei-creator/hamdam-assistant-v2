import { useState } from "react";
import { ChevronRight, ChevronLeft, CalendarDays, Plus } from "lucide-react";
import type { EventItem } from "../types";
import {
  JALALI_MONTHS,
  WEEKDAYS,
  isoToJalali,
  jalaliToIso,
  jalaliMonthLength,
  toJalaliDate,
  todayIso,
  toPersianDigits,
  weekdayOfIso,
} from "../jalali";

interface Props {
  events: EventItem[];
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  onNewEvent: (dateIso?: string) => void;
}

export default function CalendarView({ events, selectedDate, onSelectDate, onNewEvent }: Props) {
  const today = todayIso();
  const [view, setView] = useState(() => {
    const [jy, jm] = isoToJalali(todayIso());
    return { jy, jm };
  });

  const monthLength = jalaliMonthLength(view.jy, view.jm);
  const firstIso = jalaliToIso(view.jy, view.jm, 1);
  const startWeekday = weekdayOfIso(firstIso); // 0 = شنبه

  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: monthLength }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function shiftMonth(delta: number) {
    setView((v) => {
      let jm = v.jm + delta;
      let jy = v.jy;
      if (jm > 12) {
        jm = 1;
        jy += 1;
      }
      if (jm < 1) {
        jm = 12;
        jy -= 1;
      }
      return { jy, jm };
    });
  }

  function dayIso(day: number): string {
    return jalaliToIso(view.jy, view.jm, day);
  }

  const eventsByDay = new Map<string, EventItem[]>();
  for (const ev of events) {
    const list = eventsByDay.get(ev.event_date) ?? [];
    list.push(ev);
    eventsByDay.set(ev.event_date, list);
  }

  const todayJ = toJalaliDate(new Date());
  const isCurrentMonth = todayJ[0] === view.jy && todayJ[1] === view.jm;
  const selectedJ = isoToJalali(selectedDate);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
          <CalendarDays className="w-5 h-5 text-primary-600" />
          {JALALI_MONTHS[view.jm - 1]} {toPersianDigits(view.jy)}
        </h2>
        <div className="flex items-center gap-1.5">
          {!isCurrentMonth && (
            <button
              onClick={() => {
                onSelectDate(today);
                setView({ jy: todayJ[0], jm: todayJ[1] });
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
            >
              امروز
            </button>
          )}
          <button
            onClick={() => shiftMonth(-1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="ماه قبل"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
          <button
            onClick={() => shiftMonth(1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="ماه بعد"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-medium py-1 ${
              i === 6 ? "text-red-400" : "text-slate-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e${idx}`} />;
          const iso = dayIso(day);
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const dayEvents = eventsByDay.get(iso) ?? [];
          const isFriday = idx % 7 === 6;
          return (
            <button
              key={iso}
              onClick={() => onSelectDate(iso)}
              onDoubleClick={() => onNewEvent(iso)}
              className={`relative aspect-square rounded-lg text-sm flex flex-col items-center justify-center transition-colors
                ${isSelected ? "bg-primary-600 text-white font-bold shadow" : ""}
                ${!isSelected && isToday ? "bg-primary-50 text-primary-700 font-bold" : ""}
                ${!isSelected && !isToday ? "hover:bg-slate-100" : ""}
                ${!isSelected && isFriday ? "text-red-500" : ""}
              `}
            >
              <span>{toPersianDigits(day)}</span>
              {dayEvents.length > 0 && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {dayEvents.slice(0, 3).map((_, i) => (
                    <span
                      key={i}
                      className={`w-1 h-1 rounded-full ${
                        isSelected ? "bg-white" : "bg-primary-500"
                      }`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          روز انتخاب‌شده: {toPersianDigits(selectedJ[2])} {JALALI_MONTHS[selectedJ[1] - 1]}
        </p>
        <button
          onClick={() => onNewEvent(selectedDate)}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
        >
          <Plus className="w-3.5 h-3.5" />
          رویداد جدید در این روز
        </button>
      </div>
    </div>
  );
}
