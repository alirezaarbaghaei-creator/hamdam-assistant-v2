/**
 * Single owner of the SmsAutofill (notification-listener) plugin proxy.
 *
 * WHY THIS MODULE EXISTS — the same Capacitor footgun documented in
 * bazaarPlugin.ts and downloadsPlugin.ts. `registerPlugin()` returns a Proxy
 * whose every property access is routed to the native bridge, so `plugin.then`
 * is itself a function and the proxy LOOKS LIKE A THENABLE. If the raw proxy
 * ever travels through promise resolution, the JS engine calls
 * `proxy.then(...)`, Capacitor forwards that to native, there is no `then`
 * method, and the call dies with "SmsAutofill.then() is not implemented on
 * android".
 *
 * So the raw proxy NEVER leaves this file. It is wrapped once in a plain object
 * exposing only this plugin's own methods; a plain object has no `then`, so it
 * is not a thenable and cannot be unwrapped by the promise machinery.
 */

import { isNativeApp } from '@/lib/capacitor';

/**
 * Methods the JS layer is allowed to call on the native plugin.
 *
 * requestPermission is gone with the SMS_RECEIVED implementation: notification
 * access is a Settings toggle, not a runtime permission, so there is nothing to
 * ask for in a dialog. isEnabled() and openSettings() replaced it.
 */
const WRAPPED_METHODS = [
  'start',
  'stop',
  'isEnabled',
  'openSettings',
  'addListener',
  'removeAllListeners',
] as const;

type WrappedPlugin = Record<
  (typeof WRAPPED_METHODS)[number],
  (...args: any[]) => Promise<any>
>;

/** Payload of the 'code' event emitted when an OTP is read out of an SMS. */
export interface SmsCodeEvent {
  /** The extracted code, always ASCII digits. */
  code: string;
}

/** Result of isEnabled(). */
export interface SmsAutofillAccess {
  /** true when the user has granted notification access in Settings. */
  enabled: boolean;
}

/** Result of start()/stop(). */
export interface SmsAutofillStatus {
  /** true when codes are being forwarded to JS. */
  listening: boolean;
  /** Notification access state, echoed so one call can decide the whole flow. */
  enabled?: boolean;
}

let wrapped: WrappedPlugin | null = null;
let loadPromise: Promise<boolean> | null = null;

/**
 * Builds the thenable-proof wrapper around the raw Capacitor proxy.
 * Every call keeps the proxy as the receiver so routing still works.
 */
function buildWrapper(proxy: any): WrappedPlugin {
  const out = {} as WrappedPlugin;
  for (const name of WRAPPED_METHODS) {
    out[name] = (...args: any[]) => proxy[name](...args);
  }
  return out;
}

/**
 * The plugin wrapper, or null before it has been loaded.
 *
 * Synchronous on purpose, and safe to return from an async function because the
 * wrapper is a plain object with no `then` property.
 */
export function getSmsAutofillPluginSync(): WrappedPlugin | null {
  return wrapped;
}

/**
 * Loads `@capacitor/core` and registers the plugin exactly once.
 * Resolves to a BOOLEAN — the raw proxy stays inside this module.
 */
export async function ensureSmsAutofillPlugin(): Promise<boolean> {
  if (wrapped) return true;
  // Off native (plain browser) there is no notification listener and no access
  // toggle, so there is nothing to register. Report false rather than throwing;
  // the caller keeps manual code entry, which is the browser behaviour anyway.
  if (!isNativeApp()) return false;

  if (!loadPromise) {
    loadPromise = import(/* @vite-ignore */ '@capacitor/core')
      .then(({ registerPlugin }) => {
        wrapped = buildWrapper(registerPlugin('SmsAutofill'));
        return true;
      })
      .catch((err) => {
        console.warn('[sms-autofill] plugin registration failed', err);
        loadPromise = null; // allow a later retry
        return false;
      });
  }

  return loadPromise;
}

