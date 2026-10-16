/**
 * Single owner of the CafeBazaarBilling plugin proxy.
 *
 * WHY THIS MODULE EXISTS — a Capacitor footgun that broke the entire billing flow.
 *
 * `registerPlugin()` returns a Proxy whose every property access is routed to the
 * native bridge. That means `plugin.then` is itself a function, so the proxy LOOKS
 * LIKE A THENABLE. The moment the proxy travels through promise resolution —
 * returning it from an `async` function, returning it from a `.then()` callback, or
 * calling `resolve(proxy)` — the JS engine tries to unwrap it by calling
 * `proxy.then(res, rej)`. Capacitor forwards that to the native side, which has no
 * `then` method, and the whole thing fails with:
 *
 *     Error: "CafeBazaarBilling.then()" is not implemented on android
 *
 * The first round of this fix removed one such return site, and the on-device report
 * immediately showed two more. So this module now makes the trap structurally
 * impossible instead of relying on every call site remembering the rule:
 *
 *   The raw proxy NEVER leaves this file. It is wrapped once in a plain object that
 *   exposes only the plugin's own methods. A plain object has no `then` property, so
 *   it is not a thenable and cannot be unwrapped by the promise machinery — no
 *   matter how it is passed around, returned, or resolved with.
 *
 * If a new native method is needed, add it to WRAPPED_METHODS below.
 */

import { isNativeApp } from '@/lib/capacitor';

/** Methods the JS layer is allowed to call on the native plugin. */
const WRAPPED_METHODS = [
  'isAvailable',
  'launchPurchase',
  'queryPurchases',
  'consumePurchase',
  'getDiagnostics',
] as const;

type WrappedPlugin = Record<(typeof WRAPPED_METHODS)[number], (...args: any[]) => Promise<any>>;

let wrapped: WrappedPlugin | null = null;
let loadPromise: Promise<boolean> | null = null;

/**
 * Builds the thenable-proof wrapper around the raw Capacitor proxy.
 * Every call keeps the proxy as the receiver so Capacitor's routing still works.
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
export function getBazaarPluginSync(): WrappedPlugin | null {
  return wrapped;
}

/**
 * Loads `@capacitor/core` and registers the plugin exactly once.
 * Resolves to a BOOLEAN — the raw proxy stays inside this module.
 */
export async function ensureBazaarPlugin(): Promise<boolean> {
  if (wrapped) return true;
  if (!isNativeApp()) return false;

  if (!loadPromise) {
    loadPromise = import(/* @vite-ignore */ '@capacitor/core')
      .then(({ registerPlugin }) => {
        wrapped = buildWrapper(registerPlugin('CafeBazaarBilling'));
        return true;
      })
      .catch(() => {
        loadPromise = null; // allow a later retry
        return false;
      });
  }

  return loadPromise;
}
