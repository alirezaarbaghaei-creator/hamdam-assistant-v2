import { Browser } from '@capacitor/browser';

/**
 * Open an external URL in the appropriate browser:
 * - On Capacitor (Android): uses @capacitor/browser plugin (system browser)
 * - On web/PWA: uses window.open with _blank
 */
export async function openExternalUrl(url: string): Promise<void> {
  const isCapacitor =
    typeof (window as any).Capacitor !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.();

  if (isCapacitor) {
    await Browser.open({ url, windowName: '_self' });
  } else {
    window.location.href = url;
  }
}
