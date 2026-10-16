/**
 * Safe localStorage wrapper — guards against Android WebView environments
 * where localStorage may be disabled or throw on access.
 */

function isStorageAvailable(): boolean {
  try {
    const test = '__kateb_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

const available = typeof window !== 'undefined' && isStorageAvailable();

const memoryStore = new Map<string, string>();

export function getItem(key: string): string | null {
  if (available) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return memoryStore.get(key) ?? null;
}

export function setItem(key: string, value: string): void {
  if (available) {
    try {
      localStorage.setItem(key, value);
    } catch {
      memoryStore.set(key, value);
    }
  } else {
    memoryStore.set(key, value);
  }
}

export function removeItem(key: string): void {
  if (available) {
    try {
      localStorage.removeItem(key);
    } catch {
      memoryStore.delete(key);
    }
  } else {
    memoryStore.delete(key);
  }
}
