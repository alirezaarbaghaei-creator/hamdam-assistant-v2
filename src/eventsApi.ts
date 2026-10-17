import type { EventItem } from "./types";
import { supabase } from "./supabaseClient";

export { supabase };

export async function fetchEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createEvent(input: {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  notes?: string | null;
}): Promise<EventItem> {
  const { data, error } = await supabase.from("events").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateEvent(
  id: string,
  input: Partial<Pick<EventItem, "title" | "event_date" | "start_time" | "end_time" | "notes">>
): Promise<void> {
  const { error } = await supabase.from("events").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}
