import { useState } from "react";
import { X, Send, Sparkles, Loader2 } from "lucide-react";
import { parseEventRequest } from "../aiAssistant";
import { formatJalaliWithWeekday, formatDuration } from "../jalali";

interface Props {
  onClose: () => void;
  onSave: (input: {
    title: string;
    event_date: string;
    start_time: string;
    end_time: string;
    notes?: string | null;
  }) => Promise<boolean>;
}

interface Field {
  day: string | null;
  startTime: string | null;
  endTime: string | null;
  title: string | null;
  notes: string | null;
}

export default function AssistantPanel({ onClose, onSave }: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<Field | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  async function ask() {
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const parsed = await parseEventRequest(input.trim());
      if (!parsed.understood && !parsed.day && !parsed.start_time && !parsed.end_time) {
        setError("متوجه درخواست نشدم. لطفاً واضح‌تر بگویید چه رویدادی را ثبت کنم.");
        setField(null);
        setReady(false);
      } else {
        const next: Field = {
          day: parsed.day,
          startTime: parsed.start_time,
          endTime: parsed.end_time,
          title: parsed.title,
          notes: parsed.notes,
        };
        setField(next);
        setReady(Boolean(next.day && next.startTime && next.endTime));
        setMessage(parsed.reply);
      }
    } catch {
      setError("ارتباط با دستیار هوشمند برقرار نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  function update<K extends keyof Field>(key: K, value: Field[K]) {
    setField((f) => (f ? { ...f, [key]: value } : f));
    if (field) {
      setReady(Boolean(field.day && field.startTime && field.endTime && (key !== "day" || value)));
    }
  }

  async function save() {
    if (!field?.day || !field.startTime || !field.endTime || !field.title) return;
    setSaving(true);
    const ok = await onSave({
      title: field.title,
      event_date: field.day,
      start_time: field.startTime,
      end_time: field.endTime,
      notes: field.notes,
    });
    setSaving(false);
    if (ok) {
      onClose();
    } else {
      setError("ثبت رویداد ناموفق بود.");
    }
  }

  const canShowFields = field !== null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
            <Sparkles className="w-5 h-5 text-primary-600" />
            دستیار ثبت رویداد
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-3">
          رویدادی که می‌خواهید ثبت شود را بنویسید؛ مثلاً: «فردا از ساعت ۹ تا ۱۱ جلسه با تیم دارم»
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && ask()}
            placeholder="درخواست شما…"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
          />
          <button
            onClick={ask}
            disabled={busy || !input.trim()}
            className="p-2.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            aria-label="ارسال"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        {message && (
          <div className="mt-3 rounded-xl bg-primary-50 border border-primary-100 px-3.5 py-2.5 text-sm text-primary-800">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5 text-sm text-red-600">
            {error}
          </div>
        )}

        {canShowFields && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <p className="text-xs font-medium text-slate-500">
              پارامترهای رویداد (می‌توانید اصلاح کنید):
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                عنوان رویداد
              </label>
              <input
                type="text"
                value={field.title ?? ""}
                onChange={(e) => update("title", e.target.value)}
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
                value={field.day ?? ""}
                onChange={(e) => update("day", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              />
              {field.day && (
                <p className="text-xs text-slate-400 mt-1">{formatJalaliWithWeekday(field.day)}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  ساعت شروع <span className="text-red-400">*</span>
                </label>
                <input
                  type="time"
                  value={field.startTime ?? ""}
                  onChange={(e) => update("startTime", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  ساعت پایان <span className="text-red-400">*</span>
                </label>
                <input
                  type="time"
                  value={field.endTime ?? ""}
                  onChange={(e) => update("endTime", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                />
              </div>
            </div>

            {field.day && field.startTime && field.endTime && (
              <p className="text-xs text-slate-500">
                مدت‌زمان انجام:{" "}
                <span className="font-medium text-slate-700">
                  {formatDuration(field.startTime, field.endTime)}
                </span>
              </p>
            )}

            <button
              onClick={save}
              disabled={!ready || saving}
              className="w-full rounded-lg bg-primary-600 text-white text-sm font-medium py-2.5 hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "در حال ثبت…" : "ثبت رویداد در تقویم"}
            </button>
            {!ready && (
              <p className="text-xs text-slate-400 text-center">
                برای ثبت، هر سه پارامتر (روز / ساعت / مدت‌زمان) لازم است.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
