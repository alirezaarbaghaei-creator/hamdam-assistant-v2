/**
 * In-app diagnostics for the CafeBazaar purchase flow.
 *
 * WHY THIS EXISTS: the checkout can fail on a real device where neither
 * `adb logcat` nor Chrome remote debugging is available to the person testing.
 * This module records everything relevant inside the app itself, persists it in
 * localStorage so it survives a crash or a restart, and renders it in a panel
 * that can be copied with one tap.
 *
 * It captures three sources:
 *   1. console.* / window.onerror / unhandledrejection  (web layer)
 *   2. explicit diag.* calls placed on the billing code path
 *   3. the native plugin's own ring buffer + device/Bazaar state, read through
 *      the CafeBazaarBilling.getDiagnostics() method
 */

import { isNativeApp } from '@/lib/capacitor';
import { ensureBazaarPlugin, getBazaarPluginSync } from './bazaarPlugin';

export type DiagLevel = 'log' | 'info' | 'warn' | 'error';

export interface DiagEntry {
  t: number;
  level: DiagLevel;
  src: string;
  msg: string;
}

/** Bump this on every diagnostic build so the tester can confirm what is installed. */
export const DIAG_BUILD = '1.5.0 (release)';

const STORAGE_KEY = 'kateb_diag_logs';
const MAX_ENTRIES = 500;

let entries: DiagEntry[] = [];
let installed = false;
let writing = false;
const listeners = new Set<() => void>();

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function timeLabel(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Never throws: a diagnostics tool that crashes the app is worse than no tool. */
function stringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

function safeGet(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* storage full or blocked - the in-memory buffer still works */
  }
}

function restore(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as DiagEntry[];
    if (Array.isArray(parsed)) entries = parsed.slice(-MAX_ENTRIES);
  } catch {
    entries = [];
  }
}

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken subscriber must not break logging */
    }
  });
}

function push(level: DiagLevel, src: string, parts: unknown[]): void {
  if (writing) return; // re-entrancy guard: console wrapping calls console internally
  writing = true;
  try {
    const msg = parts.map(stringify).join(' ');
    entries.push({ t: Date.now(), level, src, msg });
    if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
    persist();
  } finally {
    writing = false;
  }
  notify();
}

export const diag = {
  log(src: string, ...parts: unknown[]): void {
    push('log', src, parts);
  },
  info(src: string, ...parts: unknown[]): void {
    push('info', src, parts);
  },
  warn(src: string, ...parts: unknown[]): void {
    push('warn', src, parts);
  },
  error(src: string, ...parts: unknown[]): void {
    push('error', src, parts);
  },
};

/**
 * Wraps the global error channels. Safe to call more than once.
 */
export function installDiagnostics(): void {
  if (installed) return;
  installed = true;

  restore();
  diag.info('diag', `installed ${DIAG_BUILD}`);

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args: unknown[]) => {
    push('log', 'console', args);
    original.log(...args);
  };
  console.info = (...args: unknown[]) => {
    push('info', 'console', args);
    original.info(...args);
  };
  console.warn = (...args: unknown[]) => {
    push('warn', 'console', args);
    original.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    push('error', 'console', args);
    original.error(...args);
  };

  window.addEventListener('error', (event) => {
    const where = event.filename ? ` @ ${event.filename}:${event.lineno}:${event.colno}` : '';
    push('error', 'window.onerror', [String(event.message) + where]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    push('error', 'unhandledrejection', [stringify(reason)]);
  });
}

/**
 * The in-app diagnostics panel was removed from the release build (its UI
 * component and the hidden version-tap unlock on the account page are gone).
 * Log capture itself stays always on, so `diag.*` entries remain available in
 * the console and in the persisted ring buffer for support investigations, and
 * `collectReport()` can still be pulled programmatically.
 */

export function subscribeDiagnostics(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getEntries(): DiagEntry[] {
  return entries.slice();
}

export function clearDiagnostics(): void {
  entries = [];
  persist();
  notify();
  diag.info('diag', 'log cleared by user');
}

/**
 * FIX (diag-3): registration is delegated to bazaarPlugin.ts. Calling
 * registerPlugin() here as well produced a second proxy and a
 * "already registered" warning, and — more importantly — the old version returned
 * the proxy from a promise, which is what made every native call fail with
 * "CafeBazaarBilling.then() is not implemented on android".
 */

/**
 * Synchronous part of the report: environment plus the JS log. Touches nothing
 * native, so it can never block.
 */
export function buildBaseReport(): string {
  const lines: string[] = [];
  const add = (s = '') => lines.push(s);

  add('=== KATEB DIAGNOSTICS REPORT ===');
  add(`build        : ${DIAG_BUILD}`);
  add(`time         : ${new Date().toISOString()}`);
  add(`isNativeApp  : ${isNativeApp()}`);
  add(`origin       : ${window.location.origin}`);
  add(`href         : ${window.location.href}`);
  add(`userAgent    : ${navigator.userAgent}`);
  add(`apiUrl       : ${safeGet('kateb_api_url') || '(default app.kateb.site)'}`);
  add(`hasToken     : ${safeGet('kateb_token') ? 'yes' : 'no'}`);

  const cap = (window as any).Capacitor;
  add(`capacitor    : ${cap ? `present, platform=${cap.getPlatform ? cap.getPlatform() : '?'}` : 'ABSENT'}`);
  add(`plugins      : ${cap && cap.Plugins ? Object.keys(cap.Plugins).join(', ') || '(none)' : 'n/a'}`);

  add('');
  add('=== JS LOG (oldest first) ===');
  if (entries.length === 0) {
    add('(empty)');
  } else {
    entries.forEach((e) => add(`${timeLabel(e.t)} ${e.level.toUpperCase().padEnd(5)} [${e.src}] ${e.msg}`));
  }

  return lines.join('\n');
}

/**
 * FIX (diag-2): a native call that never settles used to hang the whole report,
 * leaving the panel stuck on "در حال جمع‌آوری". Every native await is now
 * individually time-bounded and every failure is written into the report, so
 * the panel ALWAYS ends up showing something readable.
 */
const NATIVE_TIMEOUT_MS = 6000;

function withNativeTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`TIMEOUT: native "${label}" did not respond within ${NATIVE_TIMEOUT_MS}ms`)),
      NATIVE_TIMEOUT_MS,
    );
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

/**
 * Registers the plugin if needed. Resolves to a BOOLEAN and never to the plugin
 * itself: the raw Capacitor proxy is a thenable, so returning it from an async
 * function made the promise machinery call `proxy.then()` and fail with
 * "CafeBazaarBilling.then() is not implemented on android". The caller fetches the
 * wrapper synchronously with getBazaarPluginSync() instead.
 */
async function ensurePluginForReport(add: (s?: string) => void): Promise<boolean> {
  if (!isNativeApp()) {
    add('native plugin: not a native build - not applicable');
    return false;
  }
  try {
    const registered = await withNativeTimeout(ensureBazaarPlugin(), 'ensureBazaarPlugin');
    if (!registered) {
      add('native plugin: registration failed - see the JS log above');
      return false;
    }
    return true;
  } catch (e) {
    add(`native plugin: registration FAILED - ${stringify(e)}`);
    return false;
  }
}

async function callNative<T>(
  plugin: any,
  method: string,
  add: (s?: string) => void,
): Promise<T | null> {
  try {
    return (await withNativeTimeout(plugin[method](), method)) as T;
  } catch (e) {
    add(`${method}: FAILED - ${stringify(e)}`);
    return null;
  }
}

/**
 * Builds the full report. Never rejects and never hangs: the synchronous part is
 * handed to `onPartial` first so the panel shows content immediately, then each
 * native call is attempted under its own timeout.
 */
export async function collectReport(onPartial?: (text: string) => void): Promise<string> {
  const lines: string[] = buildBaseReport().split('\n');
  const add = (s = '') => lines.push(s);

  onPartial?.(lines.join('\n'));

  add('');
  add('=== NATIVE PLUGIN STATE ===');
  const ready = await ensurePluginForReport(add);
  const plugin = ready ? getBazaarPluginSync() : null;
  if (ready && !plugin) add('native plugin: wrapper missing after successful registration');

  let d: any = null;
  if (plugin) {
    d = await callNative<any>(plugin, 'getDiagnostics', add);
    if (d) {
      const put = (k: string, v: unknown) => add(`${k.padEnd(26)}: ${stringify(v)}`);
      put('pluginRegistered', d.pluginRegistered);
      put('appPackage', d.appPackage);
      put('androidSdk', d.androidSdk);
      put('androidRelease', d.androidRelease);
      put('deviceModel', d.deviceModel);
      put('bazaarInstalled', d.bazaarInstalled);
      put('bazaarVersionName', d.bazaarVersionName);
      put('bazaarVersionCode', d.bazaarVersionCode);
      put('billingServiceResolvable', d.billingServiceResolvable);
      put('payThroughBazaarGranted', d.payThroughBazaarGranted);
      put('isBound', d.isBound);
      put('isConnecting', d.isConnecting);
      put('subscriptionsSupported', d.subscriptionsSupported);
      put('apiVersion', d.apiVersion);
      put('itemType', d.itemType);
    } else {
      add('getDiagnostics returned nothing - see the error line above');
    }

    add('');
    add('--- live isAvailable() probe ---');
    const probe = await callNative<any>(plugin, 'isAvailable', add);
    add(`result: ${stringify(probe)}`);
  }

  add('');
  add('=== NATIVE LOG (plugin ring buffer) ===');
  if (d) {
    const raw = d.nativeLogs;
    const nativeLogs: string[] = Array.isArray(raw)
      ? raw
      : typeof raw === 'string' && raw
        ? raw.split('\n')
        : [];
    if (nativeLogs.length === 0) {
      add('(empty - no billing call has reached the native plugin yet)');
    } else {
      nativeLogs.forEach((l) => add(l));
    }
  } else {
    add('(unavailable - getDiagnostics did not return)');
  }

  add('');
  add('=== END OF REPORT ===');
  return lines.join('\n');
}
