export interface EventItem {
  id: string;
  title: string;
  event_date: string; // ISO date: YYYY-MM-DD (Gregorian)
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  notes: string | null;
  created_at: string;
}
