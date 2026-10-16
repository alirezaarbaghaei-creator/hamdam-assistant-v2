/**
 * Types for the «مدیر من» (Life Manager) module — ported from the
 * life_manager Expo app into Kateb's web stack.
 */

export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'completed' | 'skipped' | 'cancelled';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type TaskCategory =
  | 'work'
  | 'personal'
  | 'health'
  | 'finance'
  | 'education'
  | 'social'
  | 'other';

export interface Task {
  id: string;
  title: string;
  description?: string;
  /** Gregorian ISO date (YYYY-MM-DD) */
  dueDate: string;
  /** 24h HH:mm */
  dueTime?: string;
  /** minutes */
  duration?: number;
  priority: Priority;
  category: TaskCategory;
  status: TaskStatus;
  recurrence: RecurrenceType;
  dayOfMonth?: number;
  monthOfYear?: number;
  /** minutes before due time */
  reminder?: number;
  completedAt?: string;
  createdAt: string;
  userId: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  /** Gregorian ISO date (YYYY-MM-DD) */
  date: string;
  startTime: string;
  endTime?: string;
  location?: string;
  category: TaskCategory;
  color: string;
  reminder?: number;
  recurrence?: RecurrenceType;
  createdAt: string;
  userId: string;
}

export type HolidayType = 'official' | 'religious' | 'national' | 'cultural' | 'occasional';

export interface Holiday {
  id: string;
  title: string;
  /** Jalali date as YYYY/MM/DD (digits) */
  jalaliDate: string;
  /** Gregorian date as YYYY-MM-DD */
  gregorianDate: string;
  type: HolidayType;
  isOfficialHoliday: boolean;
  description?: string;
}

export interface UserPreferences {
  id?: string;
  userId: string;
  language: 'fa';
  darkMode: boolean;
  persianNumbers: boolean;
  workStart: string;
  workEnd: string;
  workDays: number[];
  defaultReminder: number;
  notificationsEnabled: boolean;
}

export interface AISettings {
  id?: string;
  userId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TimeSlot {
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  jalaliDate: string;
  weekdayName: string;
}

export interface FreeTimeResult {
  slots: TimeSlot[];
  totalFreeMinutes: number;
  bestSlot?: TimeSlot;
}

/** Jalali date value object used by the manager module ({ year, month, day }) */
export interface MJalaliDate {
  year: number;
  month: number;
  day: number;
}

export type AIIntentType =
  | 'create_task'
  | 'create_event'
  | 'create_recurring_task'
  | 'complete_task'
  | 'reschedule_task'
  | 'delete_task'
  | 'find_free_time'
  | 'summarize_day'
  | 'summarize_week'
  | 'show_today'
  | 'show_upcoming'
  | 'show_day'
  | 'create_reminder';

export interface AIIntent {
  action: AIIntentType;
  [key: string]: unknown;
}

export interface AIIntentResult {
  intent: AIIntent;
  confidence: number;
  needsConfirmation: boolean;
  confirmationMessage?: string;
  /** If true, the assistant should ask the user to pick a time before confirming */
  needsTime?: boolean;
}