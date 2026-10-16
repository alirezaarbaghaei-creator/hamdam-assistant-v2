/**
 * Centralized network connectivity utility.
 * Uses navigator.onLine plus a lightweight fetch probe to detect
 * real connectivity (not just browser "online" state).
 */

let lastProbeResult: boolean | null = null;
let lastProbeTime = 0;
const PROBE_CACHE_MS = 4000;

/**
 * Quick check: returns navigator.onLine (with safe fallback).
 */
export function isOnline(): boolean {
  try {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  } catch {
    return true;
  }
}

/**
 * Deeper connectivity check: navigator.onLine + a lightweight HEAD request
 * to the API endpoint. Results are cached briefly to avoid spamming.
 */
export async function checkNetworkConnection(): Promise<boolean> {
  if (!isOnline()) return false;

  const now = Date.now();
  if (lastProbeResult !== null && now - lastProbeTime < PROBE_CACHE_MS) {
    return lastProbeResult;
  }

  lastProbeTime = now;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://app.kateb.site/api/index.php', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    lastProbeResult = res.ok || res.status === 405 || res.status === 400;
  } catch {
    lastProbeResult = false;
  }
  return lastProbeResult;
}

/** Reset the probe cache (e.g. after the user manually retries). */
export function resetNetworkCache(): void {
  lastProbeResult = null;
  lastProbeTime = 0;
}
