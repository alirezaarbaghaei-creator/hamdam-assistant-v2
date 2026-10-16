import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar as CalendarIcon, Clock, CalendarPlus } from 'lucide-react';
import type { Task, Priority, TaskCategory, RecurrenceType, MJalaliDate } from '@/types/manager';
import { MiniCalendar, toISO } from './MiniCalendar';
import { getTodayJalali, isoDateToJalali, formatJalali } from '@/utils/jalaliDate';

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
  task?: Task | null;
  defaultDate?: string;
}

const PRIORITIES: { value: Priority; label: string; active: string }[] = [
  { value: 'low', label: 'کم', active: 'bg-green-100 border-green-400 text-green-700' },
  { value: 'medium', label: 'متوسط', active: 'bg-amber-100 border-amber-400 text-amber-700' },
  { value: 'high', label: 'مهم', active: 'bg-red-100 border-red-400 text-red-700' },
];

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'work', label: 'کاری' },
  { value: 'personal', label: 'شخصی' },
  { value: 'health', label: 'سلامتی' },
  { value: 'finance', label: 'مالی' },
  { value: 'education', label: 'تحصیلی' },
  { value: 'social', label: 'اجتماعی' },
  { value: 'other', label: 'سایر' },
];

const RECURRENCES: { value: RecurrenceType; label: string }[] = [
  { value: 'none', label: 'بدون تکرار' },
  { value: 'daily', label: 'روزانه' },
  { value: 'weekly', label: 'هفتگی' },
  { value: 'monthly', label: 'ماهانه' },
  { value: 'yearly', label: 'سالانه' },
];


export function TaskModal({ open, onClose, onSave, task, defaultDate }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [selectedJalali, setSelectedJalali] = useState<MJalaliDate>(getTodayJalali());
  const [hasTime, setHasTime] = useState(false);
  const [time, setTime] = useState('10:00');
  const [priority, setPriority] = useState<Priority>('medium');
  const [category, setCategory] = useState<TaskCategory>('other');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('none');
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title || '');
    const dateStr = task?.dueDate || defaultDate || '';
    setSelectedJalali(dateStr ? isoDateToJalali(dateStr) : getTodayJalali());
    if (task?.dueTime) {
      setTime(task.dueTime);
      setHasTime(true);
    } else {
      setTime('10:00');
      setHasTime(false);
    }
    setPriority(task?.priority || 'medium');
    setCategory(task?.category || 'other');
    setRecurrence(task?.recurrence || 'none');
    setShowCalendar(false);
  }, [open, task, defaultDate]);

  if (!open) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      dueDate: toISO(selectedJalali),
      dueTime: hasTime ? time : undefined,
      priority,
      category,
      recurrence,
      reminder: 15,
    });
    onClose();
  };

  const chip = (active: boolean, activeCls: string) =>
    `rounded-full border px-3 py-1.5 text-xs transition-all ${
      active ? activeCls : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-glass-lg sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">
            {task ? 'ویرایش کار' : 'کار جدید'}
          </h3>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">عنوان کار</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً پرداخت قبض برق"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus-ring"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-500">تاریخ سررسید</label>
            <button
              onClick={() => setShowCalendar((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 hover:border-indigo-300"
            >
              <span className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-indigo-500" />
                {formatJalali(selectedJalali, 'long')}
              </span>
              <span className="text-xs text-indigo-500">تغییر</span>
            </button>
            {showCalendar && (
              <div className="mt-2">
                <MiniCalendar
                  view={{ year: selectedJalali.year, month: selectedJalali.month, day: 1 }}
                  selected={selectedJalali}
                  onSelect={(d) => {
                    setSelectedJalali(d);
                    setShowCalendar(false);
                  }}
                  onNavigate={(dir) => {
                    setSelectedJalali((prev) => {
                      let month = prev.month + dir;
                      let year = prev.year;
                      if (month < 1) {
                        month = 12;
                        year -= 1;
                      } else if (month > 12) {
                        month = 1;
                        year += 1;
                      }
                      return { year, month, day: 1 };
                    });
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-slate-500">ساعت (اختیاری)</label>
              <button
                onClick={() => setHasTime((v) => !v)}
                className={`rounded-full border px-3 py-1 text-[11px] transition-all ${
                  hasTime
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
                    : 'border-slate-200 text-slate-400'
                }`}
              >
                {hasTime ? 'فعال' : 'بدون ساعت'}
              </button>
            </div>
            {hasTime && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                <Clock className="h-4 w-4 text-indigo-500" />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-slate-700 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-500">اولویت</label>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={chip(priority === p.value, p.active)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>


          <div>
            <label className="mb-1 block text-xs text-slate-500">دسته‌بندی</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={chip(category === c.value, 'border-indigo-400 bg-indigo-50 text-indigo-600')}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-500">تکرار</label>
            <div className="flex flex-wrap gap-2">
              {RECURRENCES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRecurrence(r.value)}
                  className={chip(recurrence === r.value, 'border-teal-400 bg-teal-50 text-teal-600')}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!title.trim()}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          <CalendarPlus className="h-4 w-4" />
          ذخیره
        </button>
      </motion.div>
    </div>
  );
}

