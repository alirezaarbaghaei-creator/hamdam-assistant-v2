/**
 * Occasions service — merges the offline seed (src/data/occasions.ts) with the
 * server `occasions` table served by php-api (`holidays_all`, no auth needed —
 * reference data only). Cloud rows win on conflicts; failures fall back to the
 * local seed so the calendar stays useful offline.
 */
import { OCCASIONS_SEED } from '@/data/occasions';
import { apiCall } from '@/lib/api';
import type { Holiday } from '@/types/manager';

let cached: Holiday[] | null = null;

function mergeHolidays(base: Holiday[], extra: Holiday[]): Holiday[] {
  const map = new Map<string, Holiday>();
  for (const h of base) map.set(h.gregorianDate, h);
  for (const h of extra) map.set(h.gregorianDate, h);
  return [...map.values()].sort((a, b) => a.gregorianDate.localeCompare(b.gregorianDate));
}

function mapRow(r: Record<string, unknown>): Holiday {
  return {
    id: (r.id as string) ?? '',
    title: (r.title as string) ?? '',
    jalaliDate: ((r.jalali_date as string) ?? '').replace(/-/g, '/'),
    gregorianDate: (r.gregorian_date as string) ?? '',
    type: ((r.type as Holiday['type']) ?? 'cultural'),
    isOfficialHoliday: !!(r.is_official_holiday ?? 0),
    description: (r.description as string) ?? undefined,
  };
}

export async function getOccasions(): Promise<Holiday[]> {
  if (cached) return cached;
  let cloud: Holiday[] = [];
  try {
    const d = await apiCall('holidays_all');
    if (Array.isArray(d.data) && d.data.length > 0) {
      cloud = d.data.map(mapRow);
    }
  } catch {
    /* offline / api not deployed — seed stays authoritative */
  }
  cached = mergeHolidays(OCCASIONS_SEED, cloud);
  return cached;
}

/** Today's occasions (may be more than one) */
export function occasionsForDate(holidays: Holiday[], iso: string): Holiday[] {
  return holidays.filter((h) => h.gregorianDate === iso);
}

/** First upcoming occasion on/after `iso` */
export function nextOccasion(holidays: Holiday[], iso: string): Holiday | null {
  return holidays.find((h) => h.gregorianDate >= iso) ?? null;
}

export function clearOccasionsCache(): void {
  cached = null;
}
