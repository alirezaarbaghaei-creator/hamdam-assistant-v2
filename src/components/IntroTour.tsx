import { useEffect, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, ArrowRight, Check, Bell, Calendar, MessageCircle, PartyPopper, Sparkles } from 'lucide-react';

/**
 * First-run onboarding, shown exactly once before the login page on new
 * installs. The "seen" flag itself is written by the parent via safeStorage.
 */
export const INTRO_SEEN_KEY = 'hamdam_intro_v1_seen';

interface Slide {
  Icon: LucideIcon;
  grad: string;
  title: string;
  desc: string;
  points: [string, string];
}

const slides: Slide[] = [
  {
    Icon: Calendar,
    grad: 'from-indigo-500 to-cyan-500',
    title: 'به همدم خوش آمدید',
    desc: 'سلام! «همدم» همدمِ تقویم و برنامه‌اته؛ یه دستیار هوشمند که برنامه‌های زندگی روزمره‌ت رو با یک جمله مدیریت می‌کنه. دیگه لازم نیست با تقویم و ساعت کلنجار بری!',
    points: ['تقویم جلالی با تعطیلات و مناسبت‌های رسمی', 'شروع رایگان و بدون تنظیمات پیچیده'],
  },
  {
    Icon: MessageCircle,
    grad: 'from-violet-500 to-fuchsia-500',
    title: 'با یک جمله ثبت کن',
    desc: 'فقط به زبان خودت بگو «فردا ساعت ۱۰ کلاس زبان دارم» یا «چهارشنبه این هفته باید برم باشگاه»؛ همدم تاریخ رو خودش درمیاره و رویداد یا یادآوری رو سر جاش ثبت می‌کنه.',
    points: ['تشخیص هوشمند تاریخ و ساعت از گفتار عادی', 'ثبت کار تکرارشونده مثل «هر هفته شنبه ورزش»'],
  },
  {
    Icon: PartyPopper,
    grad: 'from-emerald-500 to-teal-500',
    title: 'مناسبت‌ها رو فراموش نکن',
    desc: 'همدم مناسبت‌های مهم مثل شب یلدا، چهارشنبه‌سوری، روز معلم و روز ولنتاین رو می‌شناسه و بهت اطلاع می‌ده. برای سفر هم بهترین روزها رو پیشنهاد می‌ده تا از تعطیلات و ترافیک جا نمونی.',
    points: ['اطلاع‌رسانی رویدادهای مهم سال', 'پیشنهاد بهترین روز و ساعت برای سفر'],
  },
  {
    Icon: Bell,
    grad: 'from-orange-500 to-rose-500',
    title: 'یادآوری و گزارش روزانه',
    desc: 'قبل از هر قرار، یادآوری می‌گیری؛ آخر روز و آخر هفته هم گزارش می‌گیری که چه کارهایی انجام دادی و برنامه روزهای پیش رو چیه. همه‌چیز روی دستگاه خودت می‌مونه و آفلاین هم کار می‌کنه.',
    points: ['یادآوری قبل از هر رویداد و کار', 'گزارش هوشمند روز، هفته و پیشنهاد زمان آزاد'],
  },
];

const slideVariants = {
  enter: (d: number) => ({ x: d > 0 ? -48 : 48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? 48 : -48, opacity: 0 }),
};

export function IntroTour({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const total = slides.length;
  const isLast = index === total - 1;
  const slide = slides[index];

  const goNext = () => { setDir(1); setIndex((i) => Math.min(i + 1, total - 1)); };
  const goPrev = () => { setDir(-1); setIndex((i) => Math.max(i - 1, 0)); };
  const jumpTo = (i: number) => { setDir(i > index ? 1 : -1); setIndex(i); };

  // Keyboard: in RTL the "forward" arrow is ArrowLeft. Esc skips the tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      else if (e.key === 'ArrowLeft') goNext();
      else if (e.key === 'ArrowRight') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RTL swipe: dragging to the right reveals the next slide (mirrored LTR).
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 70 && !isLast) goNext();
    else if (info.offset.x < -70 && index > 0) goPrev();
  };
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface" style={{ minHeight: '100dvh' }}>
      {/* Ambient blobs — same vibe as the auth page */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-sky-300/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-indigo-300/30 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 h-64 w-64 rounded-full bg-amber-200/30 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-lg flex-col px-5 py-6">
        <header className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button type="button" onClick={goPrev}
                className="focus-ring flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50">
                <ArrowRight className="h-3.5 w-3.5" />
                قبلی
              </button>
            )}
            <span className="text-xs font-medium text-slate-400">
              مرحله {(index + 1).toLocaleString('fa-IR')} از {total.toLocaleString('fa-IR')}
            </span>
          </div>
          <button type="button" onClick={onDone}
            className="focus-ring rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600">
            رد کردن
          </button>
        </header>

        <div className="flex flex-1 items-center py-6">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={index} custom={dir} variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.12} onDragEnd={handleDragEnd}
              className="w-full cursor-grab active:cursor-grabbing">
              <div className="rounded-3xl border border-white/70 bg-white/80 p-7 text-center shadow-xl shadow-slate-200/50 backdrop-blur">
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className={`mx-auto flex h-20 w-20 items-center justify-center rounded-[1.4rem] bg-gradient-to-br ${slide.grad} shadow-lg`}>
                  <slide.Icon className="h-9 w-9 text-white" />
                </motion.div>
                <h2 className="mt-6 text-xl font-bold text-slate-800">{slide.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-500">{slide.desc}</p>
                <ul className="mt-5 space-y-2.5 text-right">
                  {slide.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 py-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100">
                        <Check className="h-3 w-3 text-sky-600" />
                      </span>
                      <span className="text-[13px] text-slate-600">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="pb-2">
          <div className="mb-5 flex items-center justify-center gap-2">
            {slides.map((_, i) => (
              <button key={i} type="button" onClick={() => jumpTo(i)} aria-label={`مرحله ${i + 1}`}
                className={`h-2.5 rounded-full transition-all duration-300 ${i === index ? 'w-7 bg-sky-600' : 'w-2.5 bg-slate-300 hover:bg-slate-400'}`} />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={isLast ? onDone : goNext}
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition-colors hover:bg-sky-700">
              {isLast ? 'شروع کنید' : 'بعدی'}
              {isLast ? <Check className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}