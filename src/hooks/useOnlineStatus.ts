import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    let cancelled = false;
    let nativeHandler: { remove: () => Promise<void> } | null = null;

    try {
      // Capacitor Network listener (native) — fires on Android
      Network.addListener('networkStatusChange', (status) => {
        if (!cancelled) setOnline(status.connected);
      })
        .then((h) => { nativeHandler = h; })
        .catch((error: unknown) => {
          console.error('[Kateb] network listener unavailable', error);
        });

      Network.getStatus()
        .then((status) => {
          if (!cancelled) setOnline(status.connected);
        })
        .catch((error: unknown) => {
          console.error('[Kateb] network status unavailable', error);
        });
    } catch (error) {
      console.error('[Kateb] network initialization failed', error);
    }

    // Web fallback — navigator events
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      cancelled = true;
      if (nativeHandler) nativeHandler.remove().catch(() => {});
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
