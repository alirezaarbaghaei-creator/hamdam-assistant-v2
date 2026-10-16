import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Sparkles, Plus, Clock, ListTodo, CalendarDays, Coffee, PartyPopper, CalendarClock } from 'lucide-react';
import { useManagerStore } from '@/store/managerStore';
import { getTodaySchedule, formatFreeTime } from '@/services/manager/schedulingEngine';
import { managerAi } from '@/services/manager/managerAi';
import { occasionsForDate, nextOccasion } from '@/services/manager/occasionsService';
import { TaskCard } from '@/components/manager/TaskCard';
import { TaskModal } from '@/components/manager/TaskModal';
import {
  getTodayJalali,
  getTodayISO,
  formatJalali,
  toFaDigits,
  addJalaliDays,
  toGregorian,
  gregorianToISO,
} from '@/utils/jalaliDate';

export function HomeTab() {
  const tasks = useManagerStore((s) => s.tasks);
  const events = useManagerStore((s) => s.events);
  const holidays = useManagerStore((s) => s.holidays);
  const preferences = useManagerStore((s) => s.preferences);
  const addTask = useManagerStore((s) => s.addTask);
  const toggleTask = useManagerStore((s) => s.toggleTask);
  const deleteTask = useManagerStore((s) => s.deleteTask);
  const skipTask = useManagerStore((s) => s.skipTask);
  const [modalOpen, setModalOpen] = useState(false);

  const today = getTodayJalali();
  const todayISO = getTodayISO();
  const prefs = preferences;

  // Warm up the reference calendar (offline seed + server refresh)
  useEffect(() => {
    if (holidays.length === 0) {
      void import('@/services/manager/occasionsService').then((m) => {
        void m.getOccasions().then(() => {
          // store refresh happens via CalendarTab/managerStore — light-touch here
        });
      });
    }
  }, [holidays.length]);

  const schedule = useMemo(
    () => getTodaySchedule(events, tasks, prefs?.workStart ?? '08:00', prefs?.workEnd ?? '20:00'),
    [events, tasks, prefs],
  );

  const todayTasks = useMemo(
    () => tasks.filter((t) => t.dueDate === todayISO && t.status === 'pending'),
    [tasks, todayISO],
  );

  const todayEvents = useMemo(() => events.filter((e) => e.date === todayISO), [events, todayISO]);

  const todayOccasions = useMemo(() => occasionsForDate(holidays, todayISO), [holidays, todayISO]);
  const nextOcc = useMemo(() => {
    const n = nextOccasion(holidays, todayISO);
    if (!n) return null;
    const days = Math.round(
      (new Date(n.gregorianDate + 'T00:00:00').getTime() - new Date(todayISO + 'T00:00:00').getTime()) / 86400000,
    );
    return { ...n, days };
  }, [holidays, todayISO]);

  const aiSummary = useMemo(
    () => managerAi.generateDailySummary(todayTasks.length, todayEvents.length, schedule.freeMinutes),
    [todayTasks.length, todayEvents.length, schedule.freeMinutes],
  );

  const stats = [
    { label: 'کارهای امروز', value: String(todayTasks.length), icon: ListTodo, cls: 'bg-indigo-50 text-indigo-600' },
    { label: 'رویدادهای امروز', value: String(todayEvents.length), icon: CalendarDays, cls: 'bg-sky-50 text-sky-600' },
    { label: 'زمان آزاد', value: formatFreeTime(schedule.freeMinutes), icon: Coffee, cls: 'bg-teal-50 text-teal-600' },
  ];

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-800">سلام 👋</h2>
        <p className="text-sm text-slate-500">{formatJalali(today, 'full')}</p>
      </motion.div>

      {/* Occasion strips */}
      {(todayOccasions.length > 0 || nextOcc) && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          {todayOccasions.map((o) => (
            <div key={o.title} className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <PartyPopper className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-rose-700">{o.title}</p>
                <p className="text-[11px] text-rose-400">
                  {o.isOfficialHoliday ? 'امروز تعطیل رسمی است' : 'مناسبت امروز'}
                </p>
              </div>
            </div>
          ))}
          {todayOccasions.length === 0 && nextOcc && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-amber-700">{nextOcc.title}</p>
                <p className="text-[11px] text-amber-500">
                  {nextOcc.days === 0 ? 'امروز است!' : nextOcc.days === 1 ? 'فرداست — فراموش نکن' : `${toFaDigits(nextOcc.days)} روز دیگر`}
                  {nextOcc.isOfficialHoliday ? ' · تعطیل رسمی' : ''}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass grid grid-cols-3 gap-2 rounded-3xl p-4"
      >
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex flex-col items-center gap-1 text-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.cls}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-sm font-bold text-slate-700">
                {/^\d+$/.test(s.value) ? toFaDigits(s.value) : s.value}
              </p>
              <p className="text-[10px] text-slate-400">{s.label}</p>
            </div>
          );
        })}
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onClick={() => setModalOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-right text-sm text-slate-400 transition-colors hover:border-indigo-400 hover:text-indigo-500"
      >
        <Plus className="h-4 w-4" />
        کار جدید ثبت کن...
      </motion.button>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-700">
          <Clock className="h-4 w-4 text-indigo-500" />
          برنامه امروز
        </h3>
        {schedule.items.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center">
            <Calendar className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">امروز برنامه‌ای ثبت نشده — روزت خالیه!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {schedule.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <span className="w-12 text-center text-[11px] font-medium text-slate-500">
                  {toFaDigits(item.time)}
                </span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <div className="glass flex-1 rounded-xl px-3 py-2.5">
                  <p className="truncate text-right text-sm text-slate-700">{item.title}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-3xl bg-gradient-to-br from-indigo-600 to-cyan-700 p-5 text-white shadow-lg shadow-indigo-500/20"
      >
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" />
          خلاصه هوشمند امروز
        </div>
        <p className="whitespace-pre-line text-sm leading-6 text-indigo-100">{aiSummary}</p>
        <p className="mt-3 text-xs text-indigo-200">
          {schedule.freeMinutes > 120
            ? 'امروز زمان خوبی داری؛ یکی از کارهای عقب‌افتاده‌ات رو انجام بده.'
            : 'امروز برنامه‌ات پُره؛ مراقب وقت استراحتت باش.'}
        </p>
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-700">
          <ListTodo className="h-4 w-4 text-teal-600" />
          کارهای امروز
        </h3>
        {todayTasks.length === 0 ? (
          <p className="rounded-2xl bg-white/60 p-4 text-center text-sm text-slate-400">
            کاری برای امروز ثبت نشده
          </p>
        ) : (
          <div className="space-y-2">
            {todayTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={(t) => toggleTask(t.id)}
                onDelete={deleteTask}
                onSkip={skipTask}
              />
            ))}
          </div>
        )}
      </motion.section>

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={addTask} defaultDate={todayISO} />
    </div>
  );
}
