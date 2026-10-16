import { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Plus, PartyPopper } from 'lucide-react';
import { useManagerStore } from '@/store/managerStore';
import { MiniCalendar, toISO } from '@/components/manager/MiniCalendar';
import { TaskCard } from '@/components/manager/TaskCard';
import { EventCard } from '@/components/manager/EventCard';
import { TaskModal } from '@/components/manager/TaskModal';
import type { MJalaliDate } from '@/types/manager';
import {
  getTodayJalali,
  formatJalali,
  toGregorian,
  gregorianToISO,
  getGregorianForJalali,
  formatGregorian,
  getHijriForDate,
  formatHijri,
} from '@/utils/jalaliDate';

export function CalendarTab() {
  const tasks = useManagerStore((s) => s.tasks);
  const events = useManagerStore((s) => s.events);
  const holidays = useManagerStore((s) => s.holidays);
  const addTask = useManagerStore((s) => s.addTask);
  const toggleTask = useManagerStore((s) => s.toggleTask);
  const deleteTask = useManagerStore((s) => s.deleteTask);
  const deleteEvent = useManagerStore((s) => s.deleteEvent);

  const today = getTodayJalali();
  const [view, setView] = useState<MJalaliDate>({ year: today.year, month: today.month, day: 1 });
  const [selected, setSelected] = useState<MJalaliDate>(today);
  const [modalOpen, setModalOpen] = useState(false);

  const selectedISO = toISO(selected);

  const hasItems = useCallback(
    (iso: string) =>
      events.some((e) => e.date === iso) || tasks.some((t) => t.dueDate === iso),
    [events, tasks],
  );

  const selectedHolidays = useMemo(
    () => holidays.filter((h) => h.gregorianDate === selectedISO),
    [holidays, selectedISO],
  );
  const dayEvents = useMemo(() => events.filter((e) => e.date === selectedISO), [events, selectedISO]);
  const dayTasks = useMemo(() => tasks.filter((t) => t.dueDate === selectedISO), [tasks, selectedISO]);

  const selectedGregorian = useMemo(() => formatGregorian(getGregorianForJalali(selected)), [selected]);
  const selectedHijri = useMemo(() => {
    const g = getGregorianForJalali(selected);
    return formatHijri(getHijriForDate(g.gy, g.gm, g.gd));
  }, [selected]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">تقویم</h2>

      <MiniCalendar
        view={view}
        selected={selected}
        onSelect={(d) => {
          setSelected(d);
          setView({ year: d.year, month: d.month, day: 1 });
        }}
        onNavigate={(dir) => {
          setView((prev) => {
            let month = prev.month + dir;
            let year = prev.year;
            if (month < 1) {
              month = 12;
              year -= 1;
            } else if (month > 12) {
              month = 1;
              year += 1;
            }
            return { year, month, day: 1 };
          });
        }}
        hasItems={hasItems}
        isHoliday={(iso) => holidays.some((h) => h.gregorianDate === iso && h.isOfficialHoliday)}
        occasionTitles={(iso) => holidays.filter((h) => h.gregorianDate === iso).map((h) => h.title)}
      />

      {/* Selected day header */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-bold text-slate-700">{formatJalali(selected, 'long')}</p>
            <p className="text-[11px] text-slate-400" dir="ltr" style={{ textAlign: 'right' }}>
              {selectedGregorian} • {selectedHijri}
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-500/30 hover:bg-indigo-700"
            aria-label="افزودن کار در این روز"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {selectedHolidays.length > 0 && (
          <div className="mt-3 space-y-2">
            {selectedHolidays.map((h) => (
              <div key={h.id} className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                <PartyPopper className="h-4 w-4 shrink-0" />
                <span>
                  {h.title}
                  {h.isOfficialHoliday ? ' (تعطیل رسمی)' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Day items */}
      <motion.div
        key={selectedISO}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        {dayEvents.length === 0 && dayTasks.length === 0 ? (
          <div className="rounded-2xl bg-white/60 p-6 text-center">
            <CalendarIcon className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">برای این روز رویداد یا کاری ثبت نشده</p>
          </div>
        ) : (
          <>
            {dayEvents.map((event) => (
              <EventCard key={event.id} event={event} onDelete={deleteEvent} />
            ))}
            {dayTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={(t) => toggleTask(t.id)}
                onDelete={deleteTask}
              />
            ))}
          </>
        )}
      </motion.div>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={addTask}
        defaultDate={selectedISO}
      />
    </div>
  );
}
