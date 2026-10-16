import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';

/**
 * Handles deep links delivered to the Capacitor Android app.
 *
 * Two cases:
 *  1. App launched from a deep link while closed — the URL is available
 *     immediately via CapacitorApp.getLaunchUrl().
 *  2. App already running and receives a new deep link — the appUrlOpen
 *     event fires.
 *
 * Supported deep-link paths:
 *   https://app.kateb.site/payment/result?order_id=...
 *   kateb://payment/result?order_id=...
 *
 * When a matching URL arrives, the callback is invoked with the full URL.
 */
export function useDeepLinks(onDeepLink: (url: string) => void) {
  const callbackRef = useRef(onDeepLink);
  callbackRef.current = onDeepLink;

  useEffect(() => {
    let cancelled = false;

    // Case 1: cold launch from a deep link
    let listenerPromise: Promise<{ remove: () => Promise<void> }> | null = null;

    try {
      CapacitorApp.getLaunchUrl()
        .then((res) => {
          if (cancelled || !res?.url) return;
          callbackRef.current(res.url);
        })
        .catch((error: unknown) => {
          console.error('[Kateb] launch URL unavailable', error);
        });

      // Case 2: app already running, new intent
      listenerPromise = CapacitorApp.addListener('appUrlOpen', (event) => {
        if (cancelled || !event?.url) return;
        callbackRef.current(event.url);
      });
    } catch (error) {
      console.error('[Kateb] deep-link initialization failed', error);
    }

    return () => {
      cancelled = true;
      listenerPromise?.then((l) => l.remove()).catch((error: unknown) => {
        console.error('[Kateb] deep-link cleanup failed', error);
      });
    };
  }, []);
}

/**
 * Parses a deep-link URL and returns the pathname + search params,
 * normalizing both https://app.kateb.site/... and kateb://... forms.
 */
export function parseDeepLink(url: string): { pathname: string; search: URLSearchParams } | null {
  try {
    const parsed = new URL(url);
    return { pathname: parsed.pathname, search: new URLSearchParams(parsed.search) };
  } catch {
    return null;
  }
}
