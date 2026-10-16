import { Check, Clock, Trash2, SkipForward, Repeat } from 'lucide-react';
import type { Task } from '@/types/manager';
import { toFaDigits } from '@/utils/jalaliDate';

const PRIORITY_STYLES: Record<Task['priority'], { dot: string; chip: string; label: string }> = {
  high: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-600', label: 'مهم' },
  medium: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600', label: 'متوسط' },
  low: { dot: 'bg-green-500', chip: 'bg-green-50 text-green-600', label: 'کم' },
};

const RECURRENCE_LABELS: Record<string, string> = {
  daily: 'روزانه',
  weekly: 'هفتگی',
  monthly: 'ماهانه',
  yearly: 'سالانه',
};

interface TaskCardProps {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (id: string) => void;
  onSkip?: (id: string) => void;
}

export function TaskCard({ task, onToggle, onDelete, onSkip }: TaskCardProps) {
  const isCompleted = task.status === 'completed';
  const priority = PRIORITY_STYLES[task.priority];

  return (
    <div className="glass flex items-center gap-3 rounded-2xl border border-white/60 p-3">
      <button
        onClick={() => onToggle(task)}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
          isCompleted
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-slate-300 hover:border-indigo-400'
        }`}
        aria-label={isCompleted ? 'انجام نشده' : 'انجام شد'}
      >
        {isCompleted && <Check className="h-4 w-4" strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={`truncate text-right text-sm font-medium ${
            isCompleted ? 'text-slate-400 line-through' : 'text-slate-700'
          }`}
        >
          {task.title}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {task.dueTime && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="h-3 w-3" />
              {toFaDigits(task.dueTime)}
            </span>
          )}
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${priority.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
            {priority.label}
          </span>
          {task.recurrence !== 'none' && (
            <span className="flex items-center gap-1 text-[10px] text-teal-600">
              <Repeat className="h-3 w-3" />
              {RECURRENCE_LABELS[task.recurrence]}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onSkip && task.status === 'pending' && (
          <button
            onClick={() => onSkip(task.id)}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="پرش از کار"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => onDelete(task.id)}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
          aria-label="حذف"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
