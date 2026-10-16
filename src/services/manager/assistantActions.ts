/**
 * Executor for the writes the assistant proposes.
 *
 * Nothing is written until the user taps confirm: the server only ever returns
 * a *proposal* (an AssistantAction) plus the card that explains it. This module
 * turns that proposal into a real change through the manager store, so the
 * local-first data layer stays the single source of truth (and the existing
 * best-effort cloud sync in managerDb keeps working).
 */
import { useManagerStore } from '@/store/managerStore';
import { scheduleTaskReminder } from './notifications';
import type { Task, CalendarEvent, Priority, RecurrenceType, TaskCategory } from '@/types/manager';
import type { AssistantAction } from '@/types/assistant';
import { formatJalali, getTodayISO, isoToJalali, toFaDigits } from '@/utils/jalaliDate';

export interface ApplyResult {
  ok: boolean;
  message: string;
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

function jalaliPretty(iso: string): string {
  try {
    return formatJalali(isoToJalali(iso), 'long');
  } catch {
    return iso;
  }
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback;
}

/** Applies one confirmed assistant action and returns the text to show back. */
export async function applyAssistantAction(action: AssistantAction): Promise<ApplyResult> {
  const store = useManagerStore.getState();
  const p = action.payload ?? {};
  const reminder = store.preferences?.defaultReminder ?? 15;

  try {
    switch (action.type) {
      case 'create_task': {
        const title = str(p.title, 'کار');
        const dueDate = str(p.dueDate, str(p.date, getTodayISO()));
        const dueTime = str(p.dueTime) || undefined;
        const duration = Number(p.duration ?? 60) || 60;
        const priority = PRIORITIES.includes(p.priority as Priority)
          ? (p.priority as Priority)
          : 'medium';

        const task = store.addTask({
          title,
          dueDate,
          dueTime,
          duration,
          priority,
          category: (str(p.category, 'other') as TaskCategory),
          recurrence: (str(p.recurrence, 'none') as RecurrenceType),
          status: 'pending',
        });
        if (!task) return { ok: false, message: 'ثبت کار انجام نشد. دوباره تلاش کن.' };

        if (task.dueTime) {
          await scheduleTaskReminder(task.title, task.dueDate, task.dueTime, reminder);
        }
        return {
          ok: true,
          message: `✓ «${title}» برای ${jalaliPretty(dueDate)}${
            dueTime ? ` ساعت ${toFaDigits(dueTime)}` : ''
          } ثبت شد.${task.dueTime ? ` ${toFaDigits(reminder)} دقیقه قبل یادآوری می‌کنم.` : ''}`,
        };
      }

      case 'create_event': {
        const title = str(p.title, 'رویداد');
        const date = str(p.date, getTodayISO());
        const startTime = str(p.startTime, '10:00');
        const endTime = str(p.endTime) || undefined;
        const event = store.addEvent({
          title,
          date,
          startTime,
          endTime,
          location: str(p.location) || undefined,
          category: (str(p.category, 'work') as TaskCategory),
          color: '#4f46e5',
        });
        if (!event) return { ok: false, message: 'ثبت رویداد انجام نشد. دوباره تلاش کن.' };
        await scheduleTaskReminder(event.title, event.date, event.startTime, reminder);
        return {
          ok: true,
          message: `✓ رویداد «${title}» برای ${jalaliPretty(date)} ساعت ${toFaDigits(
            startTime,
          )}${endTime ? ` تا ${toFaDigits(endTime)}` : ''} ثبت شد.`,
        };
      }

      case 'update_item': {
        const id = str(p.id);
        if (!id) return { ok: false, message: 'شناسهٔ مورد پیدا نشد.' };
        const kind: 'task' | 'event' = action.kind ?? (store.tasks.some((t) => t.id === id) ? 'task' : 'event');

        if (kind === 'task') {
          const existing = store.tasks.find((t) => t.id === id);
          if (!existing) return { ok: false, message: 'این کار دیگر وجود ندارد.' };
          const updates: Partial<Task> = {};
          if (p.date !== undefined) updates.dueDate = str(p.date, existing.dueDate);
          if (p.dueTime !== undefined) updates.dueTime = str(p.dueTime) || undefined;
          if (p.duration !== undefined) updates.duration = Number(p.duration) || existing.duration;
          if (p.title !== undefined) updates.title = str(p.title, existing.title);
          store.updateTask(id, updates);
          const next = { ...existing, ...updates };
          if (next.dueTime) await scheduleTaskReminder(next.title, next.dueDate, next.dueTime, reminder);
          return {
            ok: true,
            message: `✓ «${next.title}» به ${jalaliPretty(next.dueDate)}${
              next.dueTime ? ` ساعت ${toFaDigits(next.dueTime)}` : ''
            } منتقل شد.`,
          };
        }

        const existing = store.events.find((e) => e.id === id);
        if (!existing) return { ok: false, message: 'این رویداد دیگر وجود ندارد.' };
        const updates: Partial<CalendarEvent> = {};
        if (p.date !== undefined) updates.date = str(p.date, existing.date);
        if (p.startTime !== undefined) updates.startTime = str(p.startTime, existing.startTime);
        if (p.title !== undefined) updates.title = str(p.title, existing.title);
        store.updateEvent(id, updates);
        const next = { ...existing, ...updates };
        await scheduleTaskReminder(next.title, next.date, next.startTime, reminder);
        return {
          ok: true,
          message: `✓ رویداد «${next.title}» به ${jalaliPretty(next.date)} ساعت ${toFaDigits(
            next.startTime,
          )} منتقل شد.`,
        };
      }

      case 'cancel_item': {
        const id = str(p.id);
        if (!id) return { ok: false, message: 'شناسهٔ مورد پیدا نشد.' };
        const kind: 'task' | 'event' = action.kind ?? (store.tasks.some((t) => t.id === id) ? 'task' : 'event');
        const title = str(action.title, kind === 'task' ? 'کار' : 'رویداد');
        if (kind === 'task') store.deleteTask(id);
        else store.deleteEvent(id);
        return { ok: true, message: `✓ «${title}» کنسل شد.` };
      }

      case 'complete_task': {
        const id = str(p.id);
        if (!id) return { ok: false, message: 'شناسهٔ کار پیدا نشد.' };
        const task = store.tasks.find((t) => t.id === id);
        if (!task) return { ok: false, message: 'این کار دیگر وجود ندارد.' };
        store.updateTask(id, { status: 'completed', completedAt: new Date().toISOString() });
        return { ok: true, message: `✓ «${task.title}» انجام‌شده علامت خورد.` };
      }

      default:
        return { ok: false, message: 'این عملیات پشتیبانی نمی‌شود.' };
    }
  } catch (err) {
    return { ok: false, message: `ثبت انجام نشد: ${(err as Error)?.message ?? 'خطای نامشخص'}` };
  }
}
