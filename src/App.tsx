import { useEffect, useState } from "react";
import { supabase } from "./eventsApi";
import type { EventItem } from "./types";
import CalendarView from "./components/CalendarView";
import EventModal from "./components/EventModal";
import AssistantPanel from "./components/AssistantPanel";
import EventPanel from "./components/EventPanel";
import { todayIso } from "./jalali";

export default function App() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  async function load() {
    try {
      setError(null);
      const data = await loadEvents();
      setEvents(data);
    } catch {
      setError("خطا در بارگذاری رویدادها. اتصال اینترنت را بررسی کنید.");
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents() {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw error;
    return (data ?? []) as EventItem[];
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEdit(ev: EventItem) {
    setEditingEvent(ev);
    setModalOpen(true);
  }

  function handleNew(dateIso?: string) {
    setEditingEvent(null);
    if (dateIso) setSelectedDate(dateIso);
    setModalOpen(true);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) {
      setError("حذف رویداد ناموفق بود.");
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setModalOpen(false);
  }

  async function handleSave(input: {
    title: string;
    event_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
  }) {
    if (editingEvent) {
      const { error } = await supabase.from("events").update(input).eq("id", editingEvent.id);
      if (error) {
        setError("ذخیره تغییرات ناموفق بود.");
        return false;
      }
      setEvents((prev) =>
        prev
          .map((e) => (e.id === editingEvent.id ? { ...e, ...input } : e))
          .sort((a, b) =>
            a.event_date === b.event_date
              ? a.start_time.localeCompare(b.start_time)
              : a.event_date.localeCompare(b.event_date)
          )
      );
    } else {
      const { data, error } = await supabase.from("events").insert(input).select().single();
      if (error || !data) {
        setError("ثبت رویداد ناموفق بود.");
        return false;
      }
      setEvents((prev) =>
        [...prev, data as EventItem].sort((a, b) =>
          a.event_date === b.event_date
            ? a.start_time.localeCompare(b.start_time)
            : a.event_date.localeCompare(b.event_date)
        )
      );
      setSelectedDate(input.event_date);
    }
    setModalOpen(false);
    return true;
  }

  async function handleAssistantSave(input: {
    title: string;
    event_date: string;
    start_time: string;
    end_time: string;
    notes?: string | null;
  }): Promise<boolean> {
    const { data, error } = await supabase
      .from("events")
      .insert({ ...input, notes: input.notes ?? null })
      .select()
      .single();
    if (error || !data) return false;
    setEvents((prev) =>
      [...prev, data as EventItem].sort((a, b) =>
        a.event_date === b.event_date
          ? a.start_time.localeCompare(b.start_time)
          : a.event_date.localeCompare(b.event_date)
      )
    );
    setSelectedDate(input.event_date);
    return true;
  }

  const dayEvents = events
    .filter((e) => e.event_date === selectedDate)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" dir="rtl">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">تقویم رویدادها</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAssistantOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <span className="text-base">✨</span>
              ثبت با دستیار هوشمند
            </button>
            <button
              onClick={() => handleNew()}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              + رویداد دستی
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <CalendarView
            events={events}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onNewEvent={handleNew}
          />
        </div>
        <div className="lg:col-span-2">
          <EventPanel
            selectedDate={selectedDate}
            dayEvents={dayEvents}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onNew={() => handleNew()}
          />
        </div>
      </main>

      {modalOpen && (
        <EventModal
          event={editingEvent}
          defaultDate={selectedDate}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {assistantOpen && (
        <AssistantPanel
          onClose={() => setAssistantOpen(false)}
          onSave={handleAssistantSave}
        />
      )}
    </div>
  );
}
