import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Sparkles, RefreshCw, WifiOff, MapPin, CalendarClock } from 'lucide-react';
import { useManagerStore } from '@/store/managerStore';
import { requestAssistant, buildCalendar, type ChatTurn } from '@/services/manager/assistantLlm';
import { applyAssistantAction } from '@/services/manager/assistantActions';
import { AssistantBlockCard } from '@/components/manager/AssistantBlocks';
import { managerAi } from '@/services/manager/managerAi';
import { occasionsForDate } from '@/services/manager/occasionsService';
import type { AssistantAction, AssistantBlock } from '@/types/assistant';
import type { Holiday } from '@/types/manager';
import {
  getTodayJalali,
  getTodayISO,
  formatJalali,
  getJalaliWeekdayName,
  toFaDigits,
} from '@/utils/jalaliDate';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  blocks?: AssistantBlock[];
  actions?: AssistantAction[];
  quickReplies?: string[];
  /** true when the answer came from the offline rule-based parser */
  offline?: boolean;
}

let counter = 0;
const nextId = () => `m${++counter}`;

function greeting(holidays: Holiday[]): string {
  const today = getTodayJalali();
  const weekday = getJalaliWeekdayName(today);
  let text = `سلام! من دستیار همدم هستم — امروز ${weekday} ${toFaDigits(today.day)} ${formatJalali(
    today,
    'long',
  ).split(' ').slice(1).join(' ')} است.`;

  const occ = occasionsForDate(holidays, getTodayISO());
  if (occ.length > 0) {
    text += `\n\n📌 امروز ${occ.map((h) => h.title).join('، ')} است.`;
    if (occ.some((h) => h.isOfficialHoliday)) text += ' تعطیل رسمی است.';
  }

  text +=
    '\n\nمیتوانی سؤال بپرسی («چهارشنبه این هفته چیکارم؟»، «تا سال تحویل چند روز مونده؟») یا بگویی چه کاری داری تا ثبتش کنم. تداخل زمانی را هم خودم چک میکنم.';
  return text;
}

const QUICK_PROMPTS = [
  'برنامه امروزم چیه؟',
  'چهارشنبه این هفته چیکارم؟',
  'تا سال تحویل چند روز مونده؟',
  'چه ساعتی این هفته وقت آزاد دارم؟',
];

export function AssistantTab() {
  const tasks = useManagerStore((s) => s.tasks);
  const events = useManagerStore((s) => s.events);
  const holidays = useManagerStore((s) => s.holidays);
  const preferences = useManagerStore((s) => s.preferences);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'm0', role: 'assistant', content: greeting(holidays) },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const calendar = useMemo(
    () => buildCalendar(tasks, events, holidays, preferences),
    [tasks, events, holidays, preferences],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const push = useCallback((m: Omit<ChatMessage, 'id'>) => {
    setMessages((prev) => [...prev, { ...m, id: nextId() }]);
  }, []);

  /** Retires the buttons on earlier messages so only the latest is actionable. */
  const closeActions = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.actions?.length || m.quickReplies?.length
          ? { ...m, actions: undefined, quickReplies: undefined }
          : m,
      ),
    );
  }, []);

  /** Offline fallback: the local rule-based parser still answers basic requests. */
  const offlineAnswer = useCallback(
    (text: string): Omit<ChatMessage, 'id'> => {
      try {
        const result = managerAi.parseUserIntent(text);
        const intent = result.intent;
        if (!result.needsConfirmation) {
          switch (intent.action) {
            case 'show_today':
            case 'show_day': {
              const iso = getTodayISO();
              const dayTasks = tasks.filter((t) => t.dueDate === iso && t.status === 'pending');
              const dayEvents = events.filter((e) => e.date === iso);
              const lines = [
                ...dayEvents.map((e) => `• رویداد: ${e.title} — ${toFaDigits(e.startTime)}`),
                ...dayTasks.map(
                  (t) => `• کار: ${t.title}${t.dueTime ? ` — ${toFaDigits(t.dueTime)}` : ''}`,
                ),
              ];
              return {
                role: 'assistant',
                offline: true,
                content:
                  lines.length > 0
                    ? `برنامه امروز:\n${lines.join('\n')}`
                    : 'امروز برنامهای ثبت نشده.',
              };
            }
            case 'summarize_week': {
              const start = getTodayISO();
              const weekTasks = tasks.filter((t) => t.dueDate >= start);
              return {
                role: 'assistant',
                offline: true,
                content: managerAi.generateWeeklyInsight(
                  weekTasks.filter((t) => t.status === 'completed').length,
                  weekTasks.filter((t) => t.status === 'pending').length,
                ),
              };
            }
            default:
              break;
          }
        }
        return {
          role: 'assistant',
          offline: true,
          content:
            result.confirmationMessage ??
            'برای ثبت و پاسخهای دقیق به اینترنت نیاز دارم. میتوانی از تب تقویم یا کارها هم استفاده کنی.',
        };
      } catch {
        return {
          role: 'assistant',
          offline: true,
          content: 'در حالت آفلاین نمیتوانم این درخواست را پردازش کنم.',
        };
      }
    },
    [tasks, events],
  );

  const submit = useCallback(
    async (text: string, showUserBubble = true) => {
      const clean = text.trim();
      if (!clean || thinking) return;
      if (showUserBubble) push({ role: 'user', content: clean });
      setInput('');
      setThinking(true);

      const history: ChatTurn[] = messages
        .filter((m) => m.content)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await requestAssistant(history, clean, calendar);
      setThinking(false);

      if (!res) {
        push(offlineAnswer(clean));
        return;
      }

      push({
        role: 'assistant',
        content: res.reply,
        blocks: res.blocks,
        actions: res.actions,
        quickReplies: res.clarify?.quickReplies,
      });
    },
    [messages, calendar, thinking, push, offlineAnswer],
  );

  /** Applies a confirmed write and reports the outcome. */
  const confirm = useCallback(
    async (action: AssistantAction) => {
      if (busy) return;
      setBusy(true);
      closeActions();
      const result = await applyAssistantAction(action);
      setBusy(false);
      push({ role: 'assistant', content: result.message });
    },
    [busy, closeActions, push],
  );

  const cancel = useCallback(() => {
    closeActions();
    push({ role: 'assistant', content: 'باشه، انجام ندادم.' });
  }, [closeActions, push]);

  /**
   * The user picked a time from a card (conflict suggestion, free slot, or a
   * pending task with no time). Re-ask the assistant with that time spelled out
   * so the same conflict engine validates it.
   */
  const pickTime = useCallback(
    (block: AssistantBlock, time: string) => {
      const title = block.pending_title ?? block.title ?? 'کار';
      const jalali = block.jalali ?? block.date ?? '';
      const text = `«${title}» را برای ${jalali} ساعت ${time} ثبت کن`;
      push({ role: 'user', content: text });
      setInput('');
      setThinking(true);
      const history: ChatTurn[] = messages
        .filter((m) => m.content)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));
      void (async () => {
        const res = await requestAssistant(history, text, calendar);
        setThinking(false);
        if (!res) {
          push(offlineAnswer(text));
          return;
        }
        push({
          role: 'assistant',
          content: res.reply,
          blocks: res.blocks,
          actions: res.actions,
          quickReplies: res.clarify?.quickReplies,
        });
      })();
    },
    [messages, calendar, push, offlineAnswer],
  );

  return (
    <div className="flex h-[calc(100vh-14rem)] flex-col lg:h-[calc(100vh-12rem)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">دستیار همدم</h2>
            <p className="text-[11px] text-slate-400">
              مدیر برنامهٔ تو — سؤال بپرس، کار و رویداد ثبت کن
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setMessages([{ id: nextId(), role: 'assistant', content: greeting(holidays) }]);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-colors hover:text-indigo-600"
          aria-label="گفتگوی جدید"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-1 py-2">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[92%] space-y-2 rounded-2xl px-4 py-2.5 text-sm leading-6 sm:max-w-[85%] ${
                m.role === 'user'
                  ? 'rounded-bl-md bg-indigo-600 text-white'
                  : 'glass rounded-br-md text-slate-700'
              }`}
            >
              {m.content ? <p className="whitespace-pre-line text-right">{m.content}</p> : null}

              {m.offline ? (
                <p className="flex items-center justify-end gap-1 text-[10px] text-slate-400">
                  <WifiOff className="h-3 w-3" />
                  پاسخ آفلاین
                </p>
              ) : null}

              {m.blocks?.map((b, i) => (
                <AssistantBlockCard
                  key={`${m.id}-b${i}`}
                  block={b}
                  actions={m.actions ?? []}
                  busy={busy || thinking}
                  onConfirm={confirm}
                  onCancel={cancel}
                  onPickTime={pickTime}
                />
              ))}

              {m.quickReplies && m.quickReplies.length > 0 && (
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  {m.quickReplies.map((qr) => (
                    <button
                      key={qr}
                      disabled={thinking}
                      onClick={() => void submit(qr)}
                      className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
                    >
                      {qr}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-end">
            <div className="glass flex items-center gap-2 rounded-2xl rounded-br-md px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:0.3s]" />
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap justify-end gap-2 pb-2">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              onClick={() => void submit(q)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="glass flex items-center gap-2 rounded-2xl p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit(input);
            }
          }}
          placeholder="مثلاً: فردا ساعت ۱۰ باید برم بانک"
          className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          onClick={() => void submit(input)}
          disabled={!input.trim() || thinking}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
          aria-label="ارسال"
        >
          <Send className="h-4 w-4 -scale-x-100" />
        </button>
      </div>

      <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-slate-400">
        <MapPin className="h-3 w-3" />
        داده‌ها روی دستگاه خودت ذخیره می‌شود
        <CalendarClock className="h-3 w-3" />
        تداخل زمانی پیش از ثبت بررسی می‌شود
      </p>
    </div>
  );
}
