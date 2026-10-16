/**
 * Life Manager data layer — local-first port of life_manager's database.ts.
 *
 * Strategy:
 *  - All reads/writes go through localStorage first (offline-capable, works
 *    with Kateb's php-api custom auth which has no Supabase session).
 *  - If a Supabase session exists AND the manager tables/migrations are
 *    deployed, data is also synced to the cloud — best effort, failures
 *    never break the UI.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { apiCall } from '@/lib/api';
import type { Task, CalendarEvent, Holiday, UserPreferences } from '@/types/manager';
import { localGet, localSet } from './storage';

const KEYS = {
  tasks: 'tasks',
  events: 'events',
  holidays: 'holidays',
  preferences: 'preferences',
};

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? undefined,
    dueDate: row.due_date as string,
    dueTime: (row.due_time as string) ?? undefined,
    duration: row.duration as number | undefined,
    priority: row.priority as Task['priority'],
    category: row.category as Task['category'],
    status: row.status as Task['status'],
    recurrence: row.recurrence as Task['recurrence'],
    dayOfMonth: (row.day_of_month as number) ?? undefined,
    monthOfYear: (row.month_of_year as number) ?? undefined,
    reminder: row.reminder as number | undefined,
    completedAt: (row.completed_at as string) ?? undefined,
    createdAt: row.created_at as string,
    userId: row.user_id as string,
  };
}

function mapEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? undefined,
    date: row.event_date as string,
    startTime: row.start_time as string,
    endTime: (row.end_time as string) ?? undefined,
    location: (row.location as string) ?? undefined,
    category: row.category as CalendarEvent['category'],
    color: row.color as string,
    reminder: row.reminder as number | undefined,
    recurrence: (row.recurrence as CalendarEvent['recurrence']) ?? undefined,
    createdAt: row.created_at as string,
    userId: row.user_id as string,
  };
}

function mapHoliday(row: Record<string, unknown>): Holiday {
  return {
    id: row.id as string,
    title: row.title as string,
    jalaliDate: row.jalali_date as string,
    gregorianDate: row.gregorian_date as string,
    type: row.type as Holiday['type'],
    isOfficialHoliday: row.is_official_holiday as boolean,
    description: (row.description as string) ?? undefined,
  };
}

/** True only when Supabase is configured AND a session exists (RLS-safe) */
async function hasCloudSession(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

function sortByDate<T>(items: T[], get: (t: T) => string): T[] {
  return [...items].sort((a, b) => get(a).localeCompare(get(b)));
}

export const managerDb = {
  // ---------- tasks ----------

  loadTasks(): Task[] {
    return localGet<Task[]>(KEYS.tasks) ?? [];
  },

  saveTasks(tasks: Task[]): void {
    localSet(KEYS.tasks, sortByDate(tasks, (t) => t.dueDate));
  },

  createTask(input: Partial<Task>): Task {
    const task: Task = {
      id: newId(),
      title: input.title ?? 'کار جدید',
      description: input.description,
      dueDate: input.dueDate ?? new Date().toISOString().slice(0, 10),
      dueTime: input.dueTime,
      duration: input.duration ?? 60,
      priority: input.priority ?? 'medium',
      category: input.category ?? 'other',
      status: input.status ?? 'pending',
      recurrence: input.recurrence ?? 'none',
      dayOfMonth: input.dayOfMonth,
      monthOfYear: input.monthOfYear,
      reminder: input.reminder ?? 15,
      createdAt: new Date().toISOString(),
      userId: input.userId ?? 'local',
    };
    // Cloud push is best-effort and silent (RLS may deny without a session)
    void (async () => {
      if (!(await hasCloudSession())) return;
      try {
        await supabase.from('tasks').insert({
          id: task.id,
          title: task.title,
          description: task.description ?? null,
          due_date: task.dueDate,
          due_time: task.dueTime ?? null,
          duration: task.duration,
          priority: task.priority,
          category: task.category,
          status: task.status,
          recurrence: task.recurrence,
          day_of_month: task.dayOfMonth ?? null,
          month_of_year: task.monthOfYear ?? null,
          reminder: task.reminder,
        });
      } catch {
        /* offline / not deployed — local copy is authoritative */
      }
      // Best-effort durable copy on the php-api backend (manager_tasks table).
      try {
        void apiCall('manager_task_save', {
          id: task.id,
          title: task.title,
          description: task.description ?? '',
          due_date: task.dueDate,
          due_time: task.dueTime ?? '',
          duration_minutes: task.duration ?? 60,
          priority: task.priority,
          category: task.category,
          status: task.status,
          recurrence: task.recurrence,
          reminder_minutes: task.reminder ?? 15,
          source: 'manual',
        }).catch(() => {});
      } catch {
        /* ignore */
      }
    })();
    return task;
  },

  updateTask(id: string, updates: Partial<Task>, current: Task[]): Task | null {
    const existing = current.find((t) => t.id === id);
    if (!existing) return null;
    const next: Task = { ...existing, ...updates, id };
    void (async () => {
      if (await hasCloudSession()) {
        try {
          const patch: Record<string, unknown> = {};
          if (updates.title !== undefined) patch.title = updates.title;
          if (updates.description !== undefined) patch.description = updates.description;
          if (updates.dueDate !== undefined) patch.due_date = updates.dueDate;
          if (updates.dueTime !== undefined) patch.due_time = updates.dueTime;
          if (updates.duration !== undefined) patch.duration = updates.duration;
          if (updates.priority !== undefined) patch.priority = updates.priority;
          if (updates.category !== undefined) patch.category = updates.category;
          if (updates.status !== undefined) patch.status = updates.status;
          if (updates.recurrence !== undefined) patch.recurrence = updates.recurrence;
          if (updates.dayOfMonth !== undefined) patch.day_of_month = updates.dayOfMonth;
          if (updates.monthOfYear !== undefined) patch.month_of_year = updates.monthOfYear;
          if (updates.reminder !== undefined) patch.reminder = updates.reminder;
          if (updates.completedAt !== undefined) patch.completed_at = updates.completedAt;
          await supabase.from('tasks').update(patch).eq('id', id);
        } catch { /* ignore */ }
      }
      // Best-effort durable update on the php-api backend
      try {
        void apiCall('manager_task_save', {
          id: next.id,
          title: next.title,
          description: next.description ?? '',
          due_date: next.dueDate,
          due_time: next.dueTime ?? '',
          duration_minutes: next.duration ?? 60,
          priority: next.priority,
          category: next.category,
          status: next.status,
          recurrence: next.recurrence,
          reminder_minutes: next.reminder ?? 15,
          source: 'manual',
        }).catch(() => {});
      } catch { /* ignore */ }
    })();
    return next;
  },

  deleteTask(id: string): void {
    void (async () => {
      if (await hasCloudSession()) {
        try {
          await supabase.from('tasks').delete().eq('id', id);
        } catch { /* ignore */ }
      }
      // Best-effort durable delete on the php-api backend
      try {
        void apiCall('manager_task_delete', { id }).catch(() => {});
      } catch { /* ignore */ }
    })();
  },


  // ---------- events ----------

  loadEvents(): CalendarEvent[] {
    return localGet<CalendarEvent[]>(KEYS.events) ?? [];
  },

  saveEvents(events: CalendarEvent[]): void {
    localSet(KEYS.events, sortByDate(events, (e) => e.date));
  },

  createEvent(input: Partial<CalendarEvent>): CalendarEvent {
    const event: CalendarEvent = {
      id: newId(),
      title: input.title ?? 'رویداد جدید',
      description: input.description,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      startTime: input.startTime ?? '10:00',
      endTime: input.endTime,
      location: input.location,
      category: input.category ?? 'work',
      color: input.color ?? '#3157D5',
      reminder: input.reminder ?? 15,
      recurrence: input.recurrence,
      createdAt: new Date().toISOString(),
      userId: input.userId ?? 'local',
    };
    void (async () => {
      if (!(await hasCloudSession())) return;
      try {
        await supabase.from('events').insert({
          id: event.id,
          title: event.title,
          description: event.description ?? null,
          event_date: event.date,
          start_time: event.startTime,
          end_time: event.endTime ?? null,
          location: event.location ?? null,
          category: event.category,
          color: event.color,
          reminder: event.reminder,
          recurrence: event.recurrence ?? 'none',
        });
      } catch {
        /* ignore */
      }
      // Best-effort durable copy on the php-api backend (calendar_events table).
      try {
        void apiCall('manager_event_save', {
          id: event.id,
          title: event.title,
          description: event.description ?? '',
          date: event.date,
          start_time: event.startTime,
          end_time: event.endTime ?? '',
          location: event.location ?? '',
          category: event.category,
          color: event.color,
          reminder_minutes: event.reminder ?? 15,
          recurrence: event.recurrence ?? 'none',
          source: 'manual',
        }).catch(() => {});
      } catch {
        /* ignore */
      }
    })();
    return event;
  },

  updateEvent(id: string, updates: Partial<CalendarEvent>, current: CalendarEvent[]): CalendarEvent | null {
    const existing = current.find((e) => e.id === id);
    if (!existing) return null;
    const next: CalendarEvent = { ...existing, ...updates, id };
    void (async () => {
      if (await hasCloudSession()) {
        try {
          const patch: Record<string, unknown> = {};
          if (updates.title !== undefined) patch.title = updates.title;
          if (updates.description !== undefined) patch.description = updates.description;
          if (updates.date !== undefined) patch.event_date = updates.date;
          if (updates.startTime !== undefined) patch.start_time = updates.startTime;
          if (updates.endTime !== undefined) patch.end_time = updates.endTime;
          if (updates.location !== undefined) patch.location = updates.location;
          if (updates.category !== undefined) patch.category = updates.category;
          if (updates.color !== undefined) patch.color = updates.color;
          if (updates.reminder !== undefined) patch.reminder = updates.reminder;
          await supabase.from('events').update(patch).eq('id', id);
        } catch { /* ignore */ }
      }
      // Best-effort durable update on the php-api backend
      try {
        void apiCall('manager_event_save', {
          id: next.id,
          title: next.title,
          description: next.description ?? '',
          date: next.date,
          start_time: next.startTime,
          end_time: next.endTime ?? '',
          location: next.location ?? '',
          category: next.category,
          color: next.color,
          reminder_minutes: next.reminder ?? 15,
          recurrence: next.recurrence ?? 'none',
          source: 'manual',
        }).catch(() => {});
      } catch { /* ignore */ }
    })();
    return next;
  },

  deleteEvent(id: string): void {
    void (async () => {
      if (await hasCloudSession()) {
        try {
          await supabase.from('events').delete().eq('id', id);
        } catch { /* ignore */ }
      }
      // Best-effort durable delete on the php-api backend
      try {
        void apiCall('manager_event_delete', { id }).catch(() => {});
      } catch { /* ignore */ }
    })();
  },


  // ---------- holidays (shared reference data) ----------

  loadHolidays(): Holiday[] {
    return localGet<Holiday[]>(KEYS.holidays) ?? [];
  },

  saveHolidays(holidays: Holiday[]): void {
    localSet(KEYS.holidays, holidays);
  },

  /**
   * Pull holidays from Supabase when possible (public read). The local copy
   * is kept as fallback so the calendar still marks special days offline.
   */
  async refreshHolidaysFromCloud(): Promise<Holiday[]> {
    const local = managerDb.loadHolidays();
    if (!isSupabaseConfigured || !supabase) return local;
    try {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .order('gregorian_date', { ascending: true });
      if (error || !data || data.length === 0) return local;
      const holidays = data.map(mapHoliday);
      managerDb.saveHolidays(holidays);
      return holidays;
    } catch {
      return local;
    }
  },

  // ---------- preferences ----------

  loadPreferences(userId: string): UserPreferences {
    const saved = localGet<UserPreferences>(KEYS.preferences);
    return (
      saved ?? {
        userId,
        language: 'fa',
        darkMode: false,
        persianNumbers: true,
        workStart: '08:00',
        workEnd: '20:00',
        workDays: [0, 1, 2, 3, 4],
        defaultReminder: 15,
        notificationsEnabled: true,
      }
    );
  },

  savePreferences(prefs: UserPreferences): void {
    localSet(KEYS.preferences, prefs);
    void (async () => {
      if (!(await hasCloudSession())) return;
      try {
        await supabase.from('user_preferences').upsert(
          {
            dark_mode: prefs.darkMode,
            persian_numbers: prefs.persianNumbers,
            work_start: prefs.workStart,
            work_end: prefs.workEnd,
            work_days: prefs.workDays,
            default_reminder: prefs.defaultReminder,
            notifications_enabled: prefs.notificationsEnabled,
          },
          { onConflict: 'user_id' },
        );
      } catch {
        /* ignore */
      }
    })();
  },
};


/**
 * Pull tasks/events/holidays from Supabase when a session exists.
 * Returns null when cloud sync is unavailable (normal case with Kateb's
 * php-api auth) so callers keep the local copy.
 */
export async function pullFromCloud(): Promise<{
  tasks: Task[];
  events: CalendarEvent[];
  holidays: Holiday[];
} | null> {
  if (!(await hasCloudSession())) return null;
  try {
    const [t, e, h] = await Promise.all([
      supabase.from('tasks').select('*').order('due_date', { ascending: true }),
      supabase.from('events').select('*').order('event_date', { ascending: true }),
      supabase.from('holidays').select('*').order('gregorian_date', { ascending: true }),
    ]);
    if (t.error || e.error) return null;
    const tasks = (t.data ?? []).map(mapTask);
    const events = (e.data ?? []).map(mapEvent);
    const holidays = h.error ? managerDb.loadHolidays() : (h.data ?? []).map(mapHoliday);
    managerDb.saveTasks(tasks);
    managerDb.saveEvents(events);
    if (!h.error && holidays.length > 0) managerDb.saveHolidays(holidays);
    return { tasks, events, holidays };
  } catch {
    return null;
  }
}

