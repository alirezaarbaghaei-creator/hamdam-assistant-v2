/**
 * Hamdam assistant bridge (v2) — talks to the `ai_assist` action of php-api.
 *
 * The server is the only place that:
 *   • knows the real current date (Asia/Tehran) and resolves Jalali dates,
 *   • holds the AI credentials configured in the admin panel,
 *   • runs the tools (schedule, conflicts, free time, occasions, writes),
 *   • returns structured cards so the model can never invent data.
 *
 * When the server is unreachable the caller shows a connection error
 * instead of an answer (no offline assistant).
 */
import { apiCall } from '@/lib/api';
import type { Task, CalendarEvent, Holiday, UserPreferences } from '@/types/manager';
import type { AssistantBlock, AssistantAction, AssistantResponse } from '@/types/assistant';
import {
  getTodayJalali,
  formatJalali,
  getJalaliWeekdayName,
  toGregorian,
  gregorianToISO,
  getTodayISO,
} from '@/utils/jalaliDate';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantCalendar {
  today_iso: string;
  today_jalali: string;
  today_weekday: string;
  tasks: unknown[];
  events: unknown[];
  holidays: unknown[];
  preferences: Record<string, unknown>;
}

/** Compact snapshot of the user's calendar, sent with every request. */
export function buildCalendar(
  tasks: Task[],
  events: CalendarEvent[],
  holidays: Holiday[],
  preferences: UserPreferences | null,
): AssistantCalendar {
  const today = getTodayJalali();
  const todayISO = getTodayISO();

  const mapTask = (t: Task) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    dueTime: t.dueTime ?? '',
    duration: t.duration ?? 60,
    status: t.status,
    priority: t.priority,
    category: t.category,
    recurrence: t.recurrence,
  });

  const mapEvent = (e: CalendarEvent) => ({
    id: e.id,
    title: e.title,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime ?? '',
    location: e.location ?? '',
    category: e.category,
    recurrence: e.recurrence ?? 'none',
  });

  // All pending tasks are sent (the conflict engine must see every one of them),
  // capped so the payload stays reasonable.
  const pending = tasks
    .filter((t) => t.status === 'pending')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 200)
    .map(mapTask);

  const recent = events
    .filter((e) => e.date >= todayISO)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 200)
    .map(mapEvent);

  return {
    today_iso: todayISO,
    today_jalali: formatJalali(today, 'short'),
    today_weekday: getJalaliWeekdayName(today),
    tasks: pending,
    events: recent,
    holidays: holidays.slice(0, 400).map((h) => ({
      id: h.id,
      title: h.title,
      jalaliDate: h.jalaliDate,
      gregorianDate: h.gregorianDate,
      isOfficialHoliday: h.isOfficialHoliday,
    })),
    preferences: {
      workStart: preferences?.workStart ?? '08:00',
      workEnd: preferences?.workEnd ?? '20:00',
      workDays: preferences?.workDays ?? [0, 1, 2, 3, 4],
      defaultReminder: preferences?.defaultReminder ?? 15,
    },
  };
}

/** ISO date of "today" as the manager module computes it (used for sanity checks). */
export function todayISO(): string {
  const t = getTodayJalali();
  return gregorianToISO(toGregorian(t.year, t.month, t.day));
}

function asBlocks(raw: unknown): AssistantBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((b): b is AssistantBlock => !!b && typeof b === 'object' && 'type' in b);
}

function asActions(raw: unknown): AssistantAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is AssistantAction =>
      !!a && typeof a === 'object' && typeof (a as AssistantAction).type === 'string',
  );
}

/**
 * Sends the conversation to the assistant.
 * Resolves to null when the smart path is unavailable (offline / server down /
 * not configured) so the caller can use the local parser instead.
 */
export async function requestAssistant(
  history: ChatTurn[],
  userText: string,
  calendar: AssistantCalendar,
): Promise<AssistantResponse | null> {
  try {
    const data = await apiCall('ai_assist', {
      messages: [...history.slice(-8), { role: 'user', content: userText }],
      calendar,
      temperature: 0.2,
      max_tokens: 1200,
    });

    const reply = typeof data?.reply === 'string' ? data.reply : '';
    const blocks = asBlocks(data?.blocks);
    const actions = asActions(data?.actions);
    const clarifyRaw = data?.clarify as { quick_replies?: unknown } | undefined;
    const quickReplies = Array.isArray(clarifyRaw?.quick_replies)
      ? (clarifyRaw!.quick_replies as unknown[]).map(String).slice(0, 4)
      : [];

    if (reply.trim() === '' && blocks.length === 0 && actions.length === 0) return null;

    return {
      reply,
      blocks,
      actions,
      clarify: quickReplies.length > 0 ? { quickReplies } : null,
      needsTime: data?.needs_time === true,
      today: {
        iso: typeof data?.today?.iso === 'string' ? data.today.iso : calendar.today_iso,
        jalali: typeof data?.today?.jalali === 'string' ? data.today.jalali : calendar.today_jalali,
        weekday: typeof data?.today?.weekday === 'string' ? data.today.weekday : calendar.today_weekday,
      },
      usage: data?.usage_summary ?? null,
    };
  } catch {
    return null;
  }
}
