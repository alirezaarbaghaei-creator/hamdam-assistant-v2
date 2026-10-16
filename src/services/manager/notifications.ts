/**
 * Reminder notifications for the Life Manager — web port of
 * life_manager's expo-notifications service.
 *
 * Uses the Notification API + in-process timers (works in browsers and in
 * Capacitor WebViews while the app is open). Reminders for future tasks are
 * re-scheduled on app start via rescheduleAll().
 */
import type { Task, CalendarEvent } from '@/types/manager';

const timers = new Map<string, number>();
const MAX_DELAY = 2_147_483_647;

function notificationsAvailable(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!notificationsAvailable()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (e) {
    console.warn('requestNotificationPermissions error', e);
    return false;
  }
}

function showNotification(title: string, body: string): void {
  if (!notificationsAvailable() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/icon.png' });
  } catch (e) {
    console.warn('showNotification error', e);
  }
}

export function cancelReminder(notificationId: string): void {
  const t = timers.get(notificationId);
  if (t !== undefined) {
    window.clearTimeout(t);
    timers.delete(notificationId);
  }
}

export function cancelAllReminders(): void {
  for (const t of timers.values()) window.clearTimeout(t);
  timers.clear();
}

/**
 * Schedule a local reminder. Returns an id (or null when the trigger is in
 * the past / notifications unavailable).
 */
export async function scheduleReminder(
  title: string,
  body: string,
  triggerDate: string,
  triggerTime: string,
): Promise<string | null> {
  if (!notificationsAvailable()) return null;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  const [year, month, day] = triggerDate.split('-').map(Number);
  const [hour, minute] = triggerTime.split(':').map(Number);
  const trigger = new Date(year, month - 1, day, hour, minute, 0);

  if (trigger.getTime() <= Date.now()) return null;

  const id = `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const delay = trigger.getTime() - Date.now();
  // setTimeout max is ~24.8 days — for longer delays we schedule a re-arm
  // timer that re-schedules closer to the target time.
  if (delay > MAX_DELAY) {
    const handle = window.setTimeout(
      () => {
        timers.delete(id);
        // Re-schedule with the remaining delay
        const remaining = trigger.getTime() - Date.now();
        if (remaining > 0) {
          const h2 = window.setTimeout(() => {
            timers.delete(id);
            showNotification(title, body);
          }, Math.min(remaining, MAX_DELAY));
          timers.set(id, h2);
        } else {
          showNotification(title, body);
        }
      },
      MAX_DELAY,
    );
    timers.set(id, handle);
    return id;
  }
  const handle = window.setTimeout(
    () => {
      timers.delete(id);
      showNotification(title, body);
    },
    delay,
  );
  timers.set(id, handle);
  return id;
}

export async function scheduleTaskReminder(
  taskTitle: string,
  dueDate: string,
  dueTime: string,
  minutesBefore = 15,
): Promise<string | null> {
  if (!dueDate || !dueTime) return null;

  const [year, month, day] = dueDate.split('-').map(Number);
  const [hour, minute] = dueTime.split(':').map(Number);
  const taskTime = new Date(year, month - 1, day, hour, minute, 0);
  taskTime.setMinutes(taskTime.getMinutes() - minutesBefore);

  if (taskTime.getTime() <= Date.now()) return null;

  const triggerDate = `${taskTime.getFullYear()}-${String(taskTime.getMonth() + 1).padStart(2, '0')}-${String(taskTime.getDate()).padStart(2, '0')}`;
  const triggerTime = `${String(taskTime.getHours()).padStart(2, '0')}:${String(taskTime.getMinutes()).padStart(2, '0')}`;

  const body =
    minutesBefore > 0
      ? `${minutesBefore} دقیقه تا «${taskTitle}» باقی مانده.`
      : `وقت «${taskTitle}» رسید.`;

  return scheduleReminder('یادآوری همدم', body, triggerDate, triggerTime);
}

export const scheduleEventReminder = scheduleTaskReminder;

/**
 * Re-schedules reminders for all pending timed tasks and upcoming events.
 * Call this on app start to restore timers after a page refresh / app restart.
 */
export async function rescheduleAll(
  tasks: Task[],
  events: CalendarEvent[],
  defaultReminderMinutes: number = 15,
): Promise<void> {
  cancelAllReminders();
  const now = Date.now();

  for (const task of tasks) {
    if (task.status !== 'pending' || !task.dueDate || !task.dueTime) continue;
    const [y, m, d] = task.dueDate.split('-').map(Number);
    const [h, min] = task.dueTime.split(':').map(Number);
    const triggerTime = new Date(y, m - 1, d, h, min, 0);
    triggerTime.setMinutes(triggerTime.getMinutes() - (task.reminder ?? defaultReminderMinutes));
    if (triggerTime.getTime() <= now) continue;
    await scheduleTaskReminder(task.title, task.dueDate, task.dueTime, task.reminder ?? defaultReminderMinutes);
  }

  for (const event of events) {
    if (!event.date || !event.startTime) continue;
    const [y, m, d] = event.date.split('-').map(Number);
    const [h, min] = event.startTime.split(':').map(Number);
    const triggerTime = new Date(y, m - 1, d, h, min, 0);
    triggerTime.setMinutes(triggerTime.getMinutes() - (event.reminder ?? defaultReminderMinutes));
    if (triggerTime.getTime() <= now) continue;
    await scheduleEventReminder(event.title, event.date, event.startTime, event.reminder ?? defaultReminderMinutes);
  }
}
