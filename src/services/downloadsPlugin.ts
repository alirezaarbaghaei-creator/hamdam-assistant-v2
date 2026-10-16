/**
 * Single owner of the Downloads (native MediaStore) plugin proxy.
 *
 * WHY THIS MODULE EXISTS — the same Capacitor footgun documented in
 * bazaarPlugin.ts. `registerPlugin()` returns a Proxy whose every property
 * access is routed to the native bridge, so `plugin.then` is itself a function
 * and the proxy LOOKS LIKE A THENABLE. If the raw proxy ever travels through
 * promise resolution, the JS engine calls `proxy.then(...)`, Capacitor forwards
 * that to native, there is no `then` method, and the call dies with
 * "Downloads.then() is not implemented on android".
 *
 * So the raw proxy NEVER leaves this file. It is wrapped once in a plain object
 * exposing only this plugin's own methods; a plain object has no `then`, so it
 * is not a thenable and cannot be unwrapped by the promise machinery.
 */

import { isNativeApp } from '@/lib/capacitor';

/** Methods the JS layer is allowed to call on the native plugin. */
const WRAPPED_METHODS = ['saveToDownloads', 'openFile'] as const;

type WrappedPlugin = Record<
  (typeof WRAPPED_METHODS)[number],
  (...args: any[]) => Promise<any>
>;

export interface SaveToDownloadsResult {
  /** content:// uri of the saved file (MediaStore, or FileProvider on legacy). */
  uri: string;
  /** Name that actually landed on disk — may differ from the requested name
   *  because MediaStore de-duplicates collisions with a " (1)" suffix. */
  displayName: string;
  /** e.g. "Download/مکتوب.pdf" */
  relativePath: string;
  /** 'mediastore' on API 29+, 'legacy' on API 24-28. */
  strategy: 'mediastore' | 'legacy';
  sdkInt: number;
}

export interface OpenFileResult {
  opened: boolean;
  uri: string;
  /** 'no_viewer' when no installed app can display the file. */
  error?: string;
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
export function getDownloadsPluginSync(): WrappedPlugin | null {
  return wrapped;
}

/**
 * Loads `@capacitor/core` and registers the plugin exactly once.
 * Resolves to a BOOLEAN — the raw proxy stays inside this module.
 */
export async function ensureDownloadsPlugin(): Promise<boolean> {
  if (wrapped) return true;
  // Off native (plain browser) there is no MediaStore, so there is nothing to
  // register. Report false rather than throwing; the caller uses a normal
  // browser download in that case.
  if (!isNativeApp()) return false;

  if (!loadPromise) {
    loadPromise = import(/* @vite-ignore */ '@capacitor/core')
      .then(({ registerPlugin }) => {
        wrapped = buildWrapper(registerPlugin('Downloads'));
        return true;
      })
      .catch((err) => {
        console.warn('[downloads] plugin registration failed', err);
        loadPromise = null; // allow a later retry
        return false;
      });
  }

  return loadPromise;
}
