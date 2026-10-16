import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  ArrowLeft,
  Sparkles,
  ChevronLeft,
  Zap,
  Crown,
  CalendarClock,
  Calendar,
  CheckSquare,
  PartyPopper,
  Layers,
  Clock,
  Bell,
} from 'lucide-react';
import { PLANS } from '@/data/plans';
import { useAppStore } from '@/store/appStore';
import { useManagerStore } from '@/store/managerStore';
import { useAuthStore } from '@/store/authStore';
import { usePlanStore } from '@/store/planStore';
import { requestNotificationPermissions } from '@/services/manager/notifications';
import { occasionsForDate, nextOccasion } from '@/services/manager/occasionsService';
import {
  getTodayJalali,
  getTodayISO,
  formatJalali,
  toFaDigits,
  addJalaliDays,
  toGregorian,
  gregorianToISO,
  formatGregorian,
  getGregorianForJalali,
} from '@/utils/jalaliDate';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const quickExamples = [
  'فردا ساعت ۱۰ کلاس زبان دارم',
  'چهارشنبه این هفته باید برم باشگاه',
  'برنامه امروزم چیه؟',
];

export function Dashboard() {
  const setPage = useAppStore((s) => s.setPage);
  const tasks = useManagerStore((s) => s.tasks);
  const events = useManagerStore((s) => s.events);
  const holidays = useManagerStore((s) => s.holidays);
  const refresh = useManagerStore((s) => s.refresh);
  const loaded = useManagerStore((s) => s.loaded);
  const user = useAuthStore((s) => s.user);
  const planType = usePlanStore((s) => s.planType);
  const expiresAt = usePlanStore((s) => s.expiresAt);
  const aiAssistantUsage = usePlanStore((s) => s.aiAssistantUsage);
  const templateUsage = usePlanStore((s) => s.templateUsage);
  const getAiAssistantLimit = usePlanStore((s) => s.getAiAssistantLimit);
  const getTemplateLimit = usePlanStore((s) => s.getTemplateLimit);
  const currentPlan = PLANS.find((p) => p.id === planType);
  const aiRemaining = getAiAssistantLimit() - aiAssistantUsage;
  const templateRemaining = getTemplateLimit() - templateUsage;

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  const today = getTodayJalali();
  const todayISO = getTodayISO();
  const greetingName = user?.full_name ? user.full_name.split(' ')[0] : '';

  const todayTasks = useMemo(
    () => tasks.filter((t) => t.dueDate === todayISO && t.status === 'pending'),
    [tasks, todayISO],
  );
  const todayEvents = useMemo(() => events.filter((e) => e.date === todayISO), [events, todayISO]);

  const upcoming = useMemo(() => {
    const horizon = gregorianToISO(toGregorian(addJalaliDays(today, 7).year, addJalaliDays(today, 7).month, addJalaliDays(today, 7).day));
    const evts = events
      .filter((e) => e.date > todayISO && e.date <= horizon)
      .map((e) => ({ kind: 'event' as const, date: e.date, time: e.startTime, title: e.title }));
    const tsks = tasks
      .filter((t) => t.dueDate > todayISO && t.dueDate <= horizon && t.status === 'pending')
      .map((t) => ({ kind: 'task' as const, date: t.dueDate, time: t.dueTime ?? '', title: t.title }));
    return [...evts, ...tsks].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 5);
  }, [events, tasks, todayISO, today]);

  const todayOccasions = useMemo(() => occasionsForDate(holidays, todayISO), [holidays, todayISO]);
  const upcomingOccasion = useMemo(() => {
    const next = nextOccasion(holidays, todayISO);
    if (!next) return null;
    const days = Math.round(
      (new Date(next.gregorianDate + 'T00:00:00').getTime() - new Date(todayISO + 'T00:00:00').getTime()) / 86400000,
    );
    return { ...next, days };
  }, [holidays, todayISO]);

  const [notifHint, setNotifHint] = useState(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    return Notification.permission === 'default';
  });

  const handleEnableReminders = async () => {
    const granted = await requestNotificationPermissions();
    setNotifHint(!granted && 'Notification' in window && Notification.permission === 'default');
  };

  const stats = [
    { label: 'کارهای امروز', value: todayTasks.length, icon: CheckSquare, bg: 'bg-indigo-50', text: 'text-indigo-600' },
    { label: 'رویدادهای امروز', value: todayEvents.length, icon: Calendar, bg: 'bg-sky-50', text: 'text-sky-600' },
    { label: 'اعتبار دستیار', value: Math.max(0, aiRemaining), icon: Zap, bg: 'bg-cyan-50', text: 'text-cyan-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Hero greeting */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="hero-workflow relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 sm:p-8 text-white shadow-xl shadow-slate-950/20"
      >
        <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-16 bottom-0 h-32 w-32 rounded-full bg-indigo-400/20 blur-2xl" />
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-cyan-300 text-sm mb-2">
            <Sparkles className="h-4 w-4" />
            {formatJalali(today, 'full')}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">
            {greetingName ? `سلام، ${greetingName}` : 'همدمِ تو'}
          </h2>
          <p className="text-indigo-100 text-sm sm:text-base max-w-md leading-relaxed">
            با یک جمله بگو چه داری؛ همدم خودش تاریخ را پیدا می‌کند، ثبت می‌کند و به‌یادت می‌آورد.
          </p>

          <button
            onClick={() => setPage('assistant')}
            className="group mt-5 flex w-full items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-sm transition-all hover:bg-white/20"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-lg shadow-indigo-500/30 transition-transform group-hover:scale-110">
              <MessageCircle className="h-7 w-7" />
            </div>
            <div className="flex-1 text-right">
              <p className="text-sm font-bold text-white">گفتگو با دستیار</p>
              <p className="text-xs text-indigo-200 mt-0.5">
                مثلاً «فردا ساعت ۱۰ کلاس زبان دارم» — بقیه‌اش با همدم
              </p>
            </div>
            <ArrowLeft className="h-5 w-5 text-indigo-300 transition-transform group-hover:-translate-x-1 shrink-0" />
          </button>
        </div>
      </motion.div>

      {/* Occasion strip */}
      {(todayOccasions.length > 0 || upcomingOccasion) && (
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show" className="space-y-2">
          {todayOccasions.map((o) => (
            <div key={o.title} className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <PartyPopper className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-rose-700">{o.title}</p>
                <p className="text-[11px] text-rose-400">{o.isOfficialHoliday ? 'امروز تعطیل رسمی است — وقت خوبی برای استراحت است' : 'مناسبت امروز'}</p>
              </div>
            </div>
          ))}
          {todayOccasions.length === 0 && upcomingOccasion && (
            <button
              onClick={() => setPage('calendar')}
              className="flex w-full items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-right transition-colors hover:bg-amber-100/80"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-amber-700">{upcomingOccasion.title}</p>
                <p className="text-[11px] text-amber-500">
                  {upcomingOccasion.days === 0
                    ? 'امروز است!'
                    : upcomingOccasion.days === 1
                      ? 'فرداست — فراموش نکن'
                      : `${toFaDigits(upcomingOccasion.days)} روز دیگر`}
                  {' · '}
                  {formatJalali(
                    (() => {
                      const g = getGregorianForJalali({
                        year: parseInt(upcomingOccasion.jalaliDate.slice(0, 4), 10),
                        month: parseInt(upcomingOccasion.jalaliDate.slice(5, 7), 10),
                        day: parseInt(upcomingOccasion.jalaliDate.slice(8, 10), 10),
                      });
                      const j = (['gy', 'gm', 'gd'] as const).reduce((o, k) => ({ ...o, [k]: g[k] }), {} as { gy: number; gm: number; gd: number });
                      return {
                        year: j.gy,
                        month: j.gm,
                        day: j.gd,
                      };
                    })(),
                    'long',
                  )}
                  {upcomingOccasion.isOfficialHoliday ? ' · تعطیل رسمی' : ''}
                </p>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-amber-400" />
            </button>
          )}
        </motion.div>
      )}

      {/* Reminder permission nudge */}
      {notifHint && (
        <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-700">یادآوری‌ها را فعال کن</p>
            <p className="text-[11px] text-slate-400">تا همدم قبل از هر قرار خبرت کند</p>
          </div>
          <button
            onClick={handleEnableReminders}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700"
          >
            فعال‌سازی
          </button>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              custom={i + 3}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="glass rounded-2xl p-4 sm:p-5 shadow-glass"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg} ${stat.text} mb-3`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {toFaDigits(stat.value)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Plan + usage */}
      <motion.div
        custom={5}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="relative overflow-hidden glass rounded-2xl p-5 shadow-glass"
      >
        <div className="absolute -left-8 -top-8 h-28 w-28 rounded-full bg-indigo-200/30 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${currentPlan?.gradient ?? 'from-slate-400 to-slate-600'} text-white shadow-lg`}>
            {planType === 'pro' ? <Crown className="h-7 w-7" /> : planType === 'basic' ? <Zap className="h-7 w-7" /> : <Layers className="h-7 w-7" />}
          </div>
          <div className="flex-1">
            <p className="text-xs text-slate-500">طرح اشتراک شما</p>
            <p className="text-lg font-bold text-slate-900">طرح {currentPlan?.name ?? 'آزمایشی'}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-[11px] text-cyan-600 font-medium">
                {Math.max(0, aiRemaining).toLocaleString('fa-IR')} گفتگو با دستیار
              </span>
              <span className="text-[11px] text-indigo-500 font-medium">
                {Math.max(0, templateRemaining).toLocaleString('fa-IR')} ثبت هوشمند
              </span>
              {expiresAt ? (
                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  انقضا: {new Date(expiresAt).toLocaleDateString('fa-IR')}
                </span>
              ) : planType === 'free' && (
                <span className="text-[11px] text-slate-400 font-medium">بدون انقضا</span>
              )}
            </div>
          </div>
          {planType !== 'pro' && (
            <button
              onClick={() => setPage('pricing')}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20"
            >
              <Crown className="h-4 w-4" />
              ارتقای طرح
            </button>
          )}
        </div>
      </motion.div>

      {/* Upcoming schedule */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">برنامه روزهای پیش‌رو</h3>
          <button
            onClick={() => setPage('calendar')}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            تقویم کامل
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {upcoming.length === 0 ? (
          <motion.div
            custom={6}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="glass rounded-2xl p-8 text-center shadow-glass"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-400 mb-4">
              <Calendar className="h-8 w-8" />
            </div>
            <p className="text-sm font-semibold text-slate-700">هنوز برنامه‌ای برای این هفته ثبت نشده</p>
            <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
              به دستیار بگو «فردا ساعت ۱۰ کلاس زبان دارم» یا «چهارشنبه باشگاه» تا خودش ثبت کند
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {quickExamples.map((q) => (
                <span key={q} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500">
                  {q}
                </span>
              ))}
            </div>
            <button
              onClick={() => setPage('assistant')}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20"
            >
              <MessageCircle className="h-4 w-4" />
              شروع گفتگو با دستیار
            </button>
          </motion.div>
        ) : (
          <div className="space-y-2.5">
            {upcoming.map((item, i) => {
              const [gy2, gm2, gd2] = item.date.split('-').map(Number);
              const jDate = formatGregorian({ gy: gy2, gm: gm2, gd: gd2 });
              return (
                <motion.button
                  key={`${item.kind}-${item.title}-${item.date}-${i}`}
                  custom={i + 7}
                  variants={fadeUp}
                  initial="hidden"
                  animate="show"
                  onClick={() => setPage('calendar')}
                  className="w-full glass rounded-2xl p-4 shadow-glass hover:shadow-glass-lg transition-shadow text-right flex items-center gap-4 group"
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white group-hover:scale-105 transition-transform ${
                    item.kind === 'event' ? 'bg-gradient-to-br from-indigo-500 to-indigo-700' : 'bg-gradient-to-br from-teal-500 to-teal-700'
                  }`}>
                    {item.kind === 'event' ? <Calendar className="h-5 w-5" /> : <CheckSquare className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span className="truncate">{jDate}</span>
                      {item.time && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <Clock className="h-3 w-3" />
                            {toFaDigits(item.time)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <ArrowLeft className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0" />
                </motion.button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
