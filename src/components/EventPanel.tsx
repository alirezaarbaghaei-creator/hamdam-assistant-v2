import { Clock, Pencil, Plus, CalendarClock, Trash } from "lucide-react";
import type { EventItem } from "../types";
import { formatJalaliWithWeekday, formatTime, formatDuration, toPersianDigits } from "../jalali";

interface Props {
  selectedDate: string;
  dayEvents: EventItem[];
  loading: boolean;
  onEdit: (ev: EventItem) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export default function EventPanel({
  selectedDate,
  dayEvents,
  loading,
  onEdit,
  onDelete,
  onNew,
}: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary-600" />
            رویدادهای روز
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{formatJalaliWithWeekday(selectedDate)}</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          افزودن
        </button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto">
        {loading && <p className="text-sm text-slate-400 py-8 text-center">در حال بارگذاری…</p>}

        {!loading && dayEvents.length === 0 && (
          <div className="text-center py-10">
            <p className="text-sm text-slate-400">رویدادی برای این روز ثبت نشده است.</p>
            <p className="text-xs text-slate-300 mt-1">
              از دکمه «افزودن» یا دستیار هوشمند استفاده کنید.
            </p>
          </div>
        )}

        {dayEvents.map((ev) => (
          <div
            key={ev.id}
            className="group rounded-xl border border-slate-150 bg-slate-50 px-3.5 py-3 hover:border-primary-200 hover:bg-primary-50/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{ev.title}</p>
                <p className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatTime(ev.start_time)} تا {formatTime(ev.end_time)}
                  <span className="text-slate-300">|</span>
                  <span>{formatDuration(ev.start_time, ev.end_time)}</span>
                </p>
                {ev.notes && <p className="text-xs text-slate-400 mt-1">{ev.notes}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(ev)}
                  className="p-1.5 rounded-lg hover:bg-white text-slate-500 hover:text-primary-600"
                  aria-label="ویرایش"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(ev.id)}
                  className="p-1.5 rounded-lg hover:bg-white text-slate-500 hover:text-red-500"
                  aria-label="حذف"
                >
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && (
        <p className="pt-3 mt-3 border-t border-slate-100 text-xs text-slate-400 text-center">
          {dayEvents.length > 0
            ? `${toPersianDigits(dayEvents.length)} رویداد در این روز`
            : ""}
        </p>
      )}
    </div>
  );
}
