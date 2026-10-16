/**
 * Local cache helpers for the Life Manager module — built on Kateb's
 * safeStorage wrapper (memory fallback for Android WebViews).
 */
import { getItem, setItem, removeItem } from '@/lib/safeStorage';

const PREFIX = 'modir:';

export function localSet<T>(key: string, value: T): void {
  try {
    setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('manager localSet failed', key, e);
  }
}

export function localGet<T>(key: string): T | null {
  try {
    const raw = getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    console.warn('manager localGet failed', key, e);
    return null;
  }
}

export function localRemove(key: string): void {
  try {
    removeItem(PREFIX + key);
  } catch (e) {
    console.warn('manager localRemove failed', key, e);
  }
}
