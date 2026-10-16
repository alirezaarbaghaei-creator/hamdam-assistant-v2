/**
 * In-app cards for assistant tool results.
 *
 * The assistant never renders data it "talked about": every card here is drawn
 * from a structured tool result the PHP backend produced from the user's real
 * calendar. This is what makes the answers trustworthy — the model can only
 * refer to what the tools returned.
 */
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock,
  Hourglass,
  MapPin,
  PartyPopper,
  Search,
  X,
} from 'lucide-react';
import { toFaDigits } from '@/utils/jalaliDate';
import type { AssistantAction, AssistantBlock } from '@/types/assistant';

interface Props {
  block: AssistantBlock;
  actions: AssistantAction[];
  busy: boolean;
  onConfirm: (action: AssistantAction) => void;
  onCancel: () => void;
  /** Re-runs the request with a picked time ("... را ساعت ۱۶:۰۰ ثبت کن") */
  onPickTime: (block: AssistantBlock, time: string) => void;
}

const TIME_SUGGESTIONS = ['08:00', '09:00', '10:00', '11:00', '14:00', '16:00', '18:00', '20:00'];

const CARD = 'rounded-xl border px-3 py-2.5 text-right';

function timeLabel(time?: string): string {
  if (!time) return 'بدون ساعت';
  return `ساعت ${toFaDigits(time)}`;
}

/** روز + لیست کارها و رویدادها */
function DayScheduleCard({ block }: { block: AssistantBlock }) {
  const days = Array.isArray(block.days) ? block.days : [];
  return (
    <div className="space-y-2">
      {days.map((d) => (
        <div key={d.date} className={`${CARD} border-slate-200 bg-white/70`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[13px] font-bold text-slate-700">
              {d.jalali_pretty ?? d.jalali}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <CalendarDays className="h-3 w-3" />
              {d.weekday}
              {d.is_holiday ? ' • تعطیل رسمی' : ''}
            </span>
          </div>

          {d.items.length === 0 ? (
            <p className="text-[12px] text-slate-400">برنامه‌ای ثبت نشده — روز خالی است.</p>
          ) : (
            <ul className="space-y-1.5">
              {d.items.map((it) => (
                <li key={`${it.kind}-${it.id ?? it.title}`} className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      it.kind === 'event' ? 'bg-cyan-500' : 'bg-indigo-500'
                    }`}
                  />
                  <span className="flex-1 text-[12px] text-slate-700">{it.title}</span>
                  {it.location ? (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <MapPin className="h-3 w-3" />
                      {it.location}
                    </span>
                  ) : null}
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                    {it.all_day ? 'بدون ساعت' : timeLabel(it.time)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {d.occasions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
              {d.occasions.map((o) => (
                <span
                  key={o.title}
                  className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"
                >
                  📌 {o.title}
                  {o.is_official_holiday ? ' (تعطیل)' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** هشدار تداخل + پیشنهاد زمان‌های آزاد */
function ConflictCard({ block, busy, onPickTime, onCancel }: Props) {
  const req = block.requested;
  return (
    <div className={`${CARD} border-red-200 bg-red-50/80`}>
      <div className="mb-2 flex items-center gap-2 text-red-700">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-[13px] font-bold">تداخل زمانی</span>
      </div>

      <p className="text-[12px] leading-6 text-red-800">
        {block.pending_title ? `«${block.pending_title}» ` : ''}
        برای {block.jalali ?? block.date}
        {req ? ` از ${toFaDigits(req.start)} تا ${toFaDigits(req.end)}` : ''} با این موارد تداخل دارد:
      </p>

      <ul className="mt-2 space-y-1.5">
        {(block.conflicts ?? []).map((c) => (
          <li key={`${c.id ?? c.title}-${c.time}`} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            <span className="flex-1 text-[12px] text-red-900">{c.title}</span>
            <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-red-600">
              {c.all_day
                ? 'بدون ساعت مشخص'
                : `${toFaDigits(c.time ?? '')}${c.end_time ? `–${toFaDigits(c.end_time)}` : ''}`}
              {c.overlap_minutes ? ` (${toFaDigits(c.overlap_minutes)} دقیقه)` : ''}
            </span>
          </li>
        ))}
      </ul>

      {(block.suggestions ?? []).length > 0 && (
        <div className="mt-2.5 border-t border-red-100 pt-2">
          <p className="mb-1.5 text-[11px] text-red-700">زمان‌های آزاد آن روز:</p>
          <div className="flex flex-wrap justify-end gap-1.5">
            {(block.suggestions ?? []).map((s) => (
              <button
                key={s.start}
                disabled={busy}
                onClick={() => onPickTime(block, s.start)}
                className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-40"
              >
                {toFaDigits(s.start)} تا {toFaDigits(s.end ?? '')}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2.5 flex justify-end gap-2 border-t border-red-100 pt-2">
        {block.conflicts?.[0]?.id ? (
          <button
            disabled={busy}
            onClick={() => onCancel()}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            باشه، خودم درست می‌کنم
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** پیش‌نمایش اقدامی که تأیید لازم دارد */
function PendingCard({ block, actions, busy, onConfirm, onCancel, onPickTime }: Props) {
  const kindLabel: Record<string, string> = {
    task: 'ثبت کار',
    event: 'ثبت رویداد',
    reminder: 'ثبت یادآوری',
    task_update: 'تغییر کار',
    event_update: 'تغییر رویداد',
    task_cancel: 'کنسل کار',
    event_cancel: 'کنسل رویداد',
    task_done: 'علامت انجام‌شده',
  };
  const k = block.kind ?? 'task';

  return (
    <div className={`${CARD} border-indigo-200 bg-indigo-50/70`}>
      <div className="mb-1.5 flex items-center gap-2 text-indigo-700">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[12px] font-bold">{kindLabel[k] ?? 'ثبت'}</span>
      </div>

      <p className="text-[13px] font-semibold text-slate-800">{block.title}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {block.jalali ?? block.date}
        {block.weekday ? ` • ${block.weekday}` : ''}
        {block.needs_time ? ' • ساعت مشخص نشده' : ` • ${timeLabel(block.time)}`}
        {block.duration_minutes && !block.needs_time ? ` (${toFaDigits(block.duration_minutes)} دقیقه)` : ''}
        {block.location ? ` • ${block.location}` : ''}
      </p>

      {block.needs_time && (
        <div className="mt-2 border-t border-indigo-100 pt-2">
          <p className="mb-1.5 text-[11px] text-indigo-600">چه ساعتی مناسب است؟</p>
          <div className="flex flex-wrap justify-end gap-1.5">
            {TIME_SUGGESTIONS.map((t) => (
              <button
                key={t}
                disabled={busy}
                onClick={() => onPickTime(block, t)}
                className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-600 transition-colors hover:bg-indigo-100 disabled:opacity-40"
              >
                {toFaDigits(t)}
              </button>
            ))}
          </div>
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-2.5 flex justify-end gap-2 border-t border-indigo-100 pt-2">
          {actions.map((a) => (
            <button
              key={`${a.type}-${a.label}`}
              disabled={busy}
              onClick={() => onConfirm(a)}
              className="flex items-center gap-1 rounded-full bg-green-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              {a.label}
            </button>
          ))}
          <button
            disabled={busy}
            onClick={onCancel}
            className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
            انصراف
          </button>
        </div>
      )}
    </div>
  );
}

export function AssistantBlockCard(props: Props) {
  const { block } = props;

  switch (block.type) {
    case 'day_schedule':
      return <DayScheduleCard block={block} />;

    case 'conflict':
      return <ConflictCard {...props} />;

    case 'pending':
      return <PendingCard {...props} />;

    case 'free_slots':
      return (
        <div className={`${CARD} border-green-200 bg-green-50/70`}>
          <div className="mb-2 flex items-center gap-2 text-green-700">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[12px] font-bold">
              زمان‌های آزاد ({toFaDigits(block.duration_minutes ?? 0)} دقیقه)
            </span>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {(block.slots ?? []).map((s) => (
              <button
                key={`${s.date}-${s.start_time}`}
                disabled={props.busy}
                onClick={() => props.onPickTime(block, s.start_time)}
                className="rounded-lg border border-green-200 bg-white px-2.5 py-1 text-[11px] text-green-700 hover:bg-green-100 disabled:opacity-40"
              >
                <span className="font-medium">{s.weekday}</span> {s.jalali} • {toFaDigits(s.start_time)}–
                {toFaDigits(s.end_time)}
              </button>
            ))}
            {(block.slots ?? []).length === 0 && (
              <p className="text-[12px] text-slate-500">زمان آزادی با این مدت پیدا نشد.</p>
            )}
          </div>
        </div>
      );

    case 'countdown': {
      const days = typeof block.days === 'number' ? block.days : 0;
      return (
        <div className={`${CARD} border-amber-200 bg-amber-50/70`}>
          <div className="flex items-center gap-3">
            <Hourglass className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-[13px] font-bold text-amber-800">
                {toFaDigits(Math.abs(days))} روز {days < 0 ? 'از' : 'تا'} {block.label ?? block.jalali}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-700">
                {block.jalali} {block.weekday ? `• ${block.weekday}` : ''}
                {days < 0 ? ' (گذشته)' : ''}
              </p>
            </div>
          </div>
        </div>
      );
    }

    case 'occasions':
      return (
        <div className={`${CARD} border-amber-200 bg-white/70`}>
          <div className="mb-2 flex items-center gap-2 text-amber-700">
            <PartyPopper className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[12px] font-bold">مناسبت‌های پیش‌رو</span>
          </div>
          <ul className="space-y-1.5">
            {(block.items ?? []).map((o) => (
              <li key={`${o.title}-${o.date}`} className="flex items-center gap-2">
                <span className="flex-1 text-[12px] text-slate-700">
                  {o.title}
                  {o.is_official_holiday ? ' (تعطیل رسمی)' : ''}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {o.jalali}
                  {typeof o.days_remaining === 'number'
                    ? ` • ${toFaDigits(o.days_remaining)} روز`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'search':
      return (
        <div className={`${CARD} border-slate-200 bg-white/70`}>
          <div className="mb-2 flex items-center gap-2 text-slate-600">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[12px] font-bold">نتیجهٔ «{block.query}»</span>
          </div>
          <ul className="space-y-1.5">
            {(block.items ?? []).map((it) => (
              <li key={`${it.kind}-${it.id ?? it.title}`} className="flex items-center gap-2">
                <span className="flex-1 text-[12px] text-slate-700">{it.title}</span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {it.jalali}
                  {it.time ? ` • ${toFaDigits(it.time)}` : ''}
                </span>
              </li>
            ))}
            {(block.occasions ?? []).map((o) => (
              <li key={`occ-${o.title}`} className="flex items-center gap-2">
                <span className="flex-1 text-[12px] text-amber-700">📌 {o.title}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{o.jalali}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    default:
      return null;
  }
}
