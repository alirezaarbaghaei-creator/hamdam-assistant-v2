/**
 * Types shared by the Hamdam assistant v2 (server tools → in-app cards).
 *
 * The backend never lets the model invent data: every number shown to the user
 * comes from a tool result, and the tool result travels to the client as a
 * structured "block" that the UI renders itself.
 */

export interface AssistantDayItem {
  id?: string;
  kind?: 'task' | 'event';
  title: string;
  /** HH:MM, empty when the item has no time */
  time?: string;
  end_time?: string;
  all_day?: boolean;
  location?: string;
  /** search results carry these too */
  date?: string;
  jalali?: string;
  weekday?: string;
  status?: string;
  days_remaining?: number;
  is_official_holiday?: boolean;
}

export interface AssistantOccasion {
  title: string;
  date?: string;
  jalali?: string;
  weekday?: string;
  days_remaining?: number;
  is_official_holiday?: boolean;
}

export interface AssistantDayEntry {
  date: string;
  jalali: string;
  jalali_pretty?: string;
  weekday: string;
  items: AssistantDayItem[];
  occasions: AssistantOccasion[];
  is_holiday?: boolean;
}

export interface AssistantConflict {
  title: string;
  kind?: string;
  id?: string;
  time?: string;
  end_time?: string;
  overlap_minutes?: number;
  all_day?: boolean;
}

export interface AssistantSlot {
  date: string;
  jalali: string;
  weekday: string;
  start_time: string;
  end_time: string;
  minutes: number;
}

/**
 * One tool result rendered as a card.
 *
 * `days` is deliberately a union: `day_schedule` carries an array of day
 * entries while `countdown` carries a day count. Narrow with Array.isArray()
 * at the use site.
 */
export interface AssistantBlock {
  type:
    | 'day_schedule'
    | 'conflict'
    | 'pending'
    | 'free_slots'
    | 'countdown'
    | 'occasions'
    | 'search';

  days?: AssistantDayEntry[] | number;
  from?: string;
  to?: string;

  date?: string;
  jalali?: string;
  weekday?: string;
  is_past?: boolean;
  is_holiday?: boolean;

  requested?: { start: string; end: string; minutes: number };
  conflicts?: AssistantConflict[];
  suggestions?: { start: string; end?: string; minutes?: number }[];
  pending_title?: string;

  kind?: string;
  title?: string;
  time?: string;
  end_time?: string;
  location?: string;
  needs_time?: boolean;
  duration_minutes?: number;

  slots?: AssistantSlot[];

  label?: string;

  items?: AssistantDayItem[];
  occasions?: AssistantOccasion[];
  query?: string;
}

export type AssistantActionType =
  | 'create_task'
  | 'create_event'
  | 'update_item'
  | 'cancel_item'
  | 'complete_task';

/** A write the assistant proposes; the UI shows a confirm button for it. */
export interface AssistantAction {
  type: AssistantActionType;
  label: string;
  payload: Record<string, unknown>;
  kind?: 'task' | 'event';
  title?: string;
  date?: string;
  jalali?: string;
  weekday?: string;
}

export interface AssistantClarify {
  quickReplies: string[];
}

export interface AssistantResponse {
  reply: string;
  blocks: AssistantBlock[];
  actions: AssistantAction[];
  clarify: AssistantClarify | null;
  needsTime: boolean;
  today: { iso: string; jalali: string; weekday: string };
  usage: { plan_type?: string; remaining?: number } | null;
}
