import { useState } from "react";
import { X, Save } from "lucide-react";
import { durationHours, toEnglishDigits } from "../jalali";

interface Props {
  event: {
    id: string;
    title: string;
    event_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
  } | null;
  defaultDate: string;
  onClose: () => void;
  onSave: (input: {
    title: string;
    event_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
  }) => Promise<boolean>;
}

export default function EventModal({ event, defaultDate, onClose, onSave }: Props) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.event_date ?? defaultDate);
  const [start, setStart] = useState((event?.start_time ?? "09:00").slice(0, 5));
  const [end, setEnd] = useState((event?.end_time ?? "10:00").slice(0, 5));
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) {
      setValidation("عنوان رویداد را وارد کنید.");
      return;
    }
    if (!date) {
      setValidation("روز رویداد را انتخاب کنید.");
      return;
    }
    if (durationHours(start, end) <= 0) {
      setValidation("مدت‌زمان باید بیشتر از صفر باشد.");
      return;
    }
    setValidation(null);
    setSaving(true);
    const ok = await onSave({
      title: title.trim(),
      event_date: date,
      start_time: start,
      end_time: end,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!ok) setValidation("ذخیره ناموفق بود. دوباره تلاش کنید.");
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800">
            {event ? "ویرایش رویداد" : "رویداد جدید"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            aria-label="بستن"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              عنوان رویداد <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: جلسه با تیم فروش"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              روز <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                ساعت شروع <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(toEnglishDigits(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                ساعت پایان <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(toEnglishDigits(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              />
            </div>
          </div>

          <p className="text-xs text-slate-400">
            مدت‌زمان انجام:{" "}
            <span className="font-medium text-slate-600">
              {durationHours(start, end) > 0
                ? `${durationHours(start, end)} ساعت`
                : "—"}
            </span>
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">یادداشت</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>

          {validation && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{validation}</p>
          )}

          <button
            onClick={submit}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary-600 text-white text-sm font-medium py-2.5 hover:bg-primary-700 disabled:opacity-60 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? "در حال ذخیره…" : "ذخیره رویداد"}
          </button>
        </div>
      </div>
    </div>
  );
}
