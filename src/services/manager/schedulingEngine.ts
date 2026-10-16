/**
 * Scheduling engine — finds free time slots and builds today's schedule.
 * Port of life_manager/src/services/schedulingEngine.ts (pure functions).
 */
import type { Task, CalendarEvent, Holiday, TimeSlot, FreeTimeResult, MJalaliDate } from '@/types/manager';
import {
  toGregorian,
  getDayOfWeek,
  isFriday,
  getJalaliWeekdayName,
  formatJalali,
  toFaDigits,
  addJalaliDays,
  getTodayJalali,
  gregorianToISO,
} from '@/utils/jalaliDate';

interface SchedulingParams {
  events: CalendarEvent[];
  tasks: Task[];
  holidays: Holiday[];
  workStart: string;
  workEnd: string;
  workDays: number[];
  durationMinutes: number;
  startDate?: MJalaliDate;
  daysAhead?: number;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getEventsForDate(events: CalendarEvent[], gregorianDate: string): CalendarEvent[] {
  return events
    .filter((e) => e.date === gregorianDate)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

function getPendingTasksForDate(tasks: Task[], gregorianDate: string): Task[] {
  return tasks
    .filter((t) => t.dueDate === gregorianDate && t.status === 'pending' && t.dueTime)
    .sort((a, b) => timeToMinutes(a.dueTime!) - timeToMinutes(b.dueTime!));
}

function dateToGregorianISO(jalali: MJalaliDate): string {
  return gregorianToISO(toGregorian(jalali.year, jalali.month, jalali.day));
}

function isHolidayForDate(holidays: Holiday[], gregorianDate: string): Holiday | null {
  return holidays.find((h) => h.gregorianDate === gregorianDate && h.isOfficialHoliday) || null;
}

export function findFreeSlots(params: SchedulingParams): FreeTimeResult {
  const {
    events,
    tasks,
    holidays,
    workStart,
    workEnd,
    workDays,
    durationMinutes,
    startDate = getTodayJalali(),
    daysAhead = 7,
  } = params;

  const slots: TimeSlot[] = [];
  const workStartMin = timeToMinutes(workStart);
  const workEndMin = timeToMinutes(workEnd);
  let totalFreeMinutes = 0;

  for (let i = 0; i < daysAhead; i++) {
    const date = addJalaliDays(startDate, i);
    const dow = getDayOfWeek(date.year, date.month, date.day);
    const gregorianDate = dateToGregorianISO(date);
    const holiday = isHolidayForDate(holidays, gregorianDate);

    if (isFriday(date) || !workDays.includes(dow) || holiday) continue;

    const busySlots: { start: number; end: number }[] = [];
    for (const event of getEventsForDate(events, gregorianDate)) {
      const start = timeToMinutes(event.startTime);
      const end = event.endTime ? timeToMinutes(event.endTime) : start + 60;
      busySlots.push({ start, end });
    }

    for (const task of getPendingTasksForDate(tasks, gregorianDate)) {
      const start = timeToMinutes(task.dueTime!);
      const end = start + (task.duration || 60);
      busySlots.push({ start, end });
    }

    busySlots.sort((a, b) => a.start - b.start);

    const merged: { start: number; end: number }[] = [];
    for (const slot of busySlots) {
      if (merged.length > 0 && slot.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, slot.end);
      } else {
        merged.push({ ...slot });
      }
    }

    let currentTime = workStartMin;
    for (const busy of merged) {
      if (busy.start - currentTime >= durationMinutes) {
        const slotDuration = busy.start - currentTime;
        slots.push({
          date: gregorianDate,
          startTime: minutesToTime(currentTime),
          endTime: minutesToTime(busy.start),
          duration: slotDuration,
          jalaliDate: formatJalali(date, 'long'),
          weekdayName: getJalaliWeekdayName(date),
        });
        totalFreeMinutes += slotDuration;
      }
      currentTime = Math.max(currentTime, busy.end);
    }

    if (workEndMin - currentTime >= durationMinutes) {
      const slotDuration = workEndMin - currentTime;
      slots.push({
        date: gregorianDate,
        startTime: minutesToTime(currentTime),
        endTime: minutesToTime(workEndMin),
        duration: slotDuration,
        jalaliDate: formatJalali(date, 'long'),
        weekdayName: getJalaliWeekdayName(date),
      });
      totalFreeMinutes += slotDuration;
    }
  }

  const bestSlot = slots.length > 0 ? slots.reduce((best, s) => (s.duration > best.duration ? s : best)) : undefined;

  return { slots, totalFreeMinutes, bestSlot };
}

export interface ScheduleItem {
  id: string;
  type: 'event' | 'task';
  title: string;
  time: string;
  endTime?: string;
  color: string;
}

export function getTodaySchedule(
  events: CalendarEvent[],
  tasks: Task[],
  workStart: string,
  workEnd: string,
): { items: ScheduleItem[]; freeMinutes: number } {
  const today = getTodayJalali();
  const gregorianDate = dateToGregorianISO(today);
  const items: ScheduleItem[] = [];

  for (const event of getEventsForDate(events, gregorianDate)) {
    items.push({
      id: event.id,
      type: 'event',
      title: event.title,
      time: event.startTime,
      endTime: event.endTime,
      color: event.color,
    });
  }

  for (const task of getPendingTasksForDate(tasks, gregorianDate)) {
    items.push({
      id: task.id,
      type: 'task',
      title: task.title,
      time: task.dueTime!,
      color: '#13A89E',
    });
  }

  items.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  const workStartMin = timeToMinutes(workStart);
  const workEndMin = timeToMinutes(workEnd);
  let freeMinutes = workEndMin - workStartMin;

  for (const item of items) {
    const start = timeToMinutes(item.time);
    const end = item.endTime ? timeToMinutes(item.endTime) : start + 60;
    const overlap = Math.min(end, workEndMin) - Math.max(start, workStartMin);
    if (overlap > 0) freeMinutes -= overlap;
  }

  return { items, freeMinutes: Math.max(0, freeMinutes) };
}

export function formatFreeTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${toFaDigits(hours)} ساعت و ${toFaDigits(mins)} دقیقه`;
  if (hours > 0) return `${toFaDigits(hours)} ساعت`;
  return `${toFaDigits(mins)} دقیقه`;
}

