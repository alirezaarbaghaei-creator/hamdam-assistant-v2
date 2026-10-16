import { Clock, MapPin, Trash2 } from 'lucide-react';
import type { CalendarEvent } from '@/types/manager';
import { toFaDigits } from '@/utils/jalaliDate';

const CATEGORY_COLORS: Record<string, string> = {
  work: '#3157D5',
  personal: '#13A89E',
  health: '#22C55E',
  finance: '#F59E0B',
  education: '#8B5CF6',
  social: '#EC4899',
  other: '#7B8496',
};

interface EventCardProps {
  event: CalendarEvent;
  compact?: boolean;
  onDelete?: (id: string) => void;
}

export function EventCard({ event, compact, onDelete }: EventCardProps) {
  const eventColor = event.color || CATEGORY_COLORS[event.category] || '#3157D5';

  return (
    <div
      className={`glass flex overflow-hidden rounded-2xl border border-white/60 ${
        compact ? 'py-2' : ''
      }`}
    >
      <div className="w-1 shrink-0" style={{ backgroundColor: eventColor }} />
      <div className={`flex flex-1 items-center gap-2 ${compact ? 'px-3 py-1.5' : 'p-3'}`}>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-right text-sm font-medium text-slate-700">{event.title}</p>
          <div className="flex flex-wrap items-center justify-end gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {toFaDigits(event.startTime)}
              {event.endTime ? ` - ${toFaDigits(event.endTime)}` : ''}
            </span>
            {event.location && (
              <span className="flex max-w-[140px] items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
          </div>
        </div>
        {onDelete && !compact && (
          <button
            onClick={() => onDelete(event.id)}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
            aria-label="حذف رویداد"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
