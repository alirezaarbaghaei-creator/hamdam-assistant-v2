import { isNativeApp } from '@/lib/capacitor';

/**
 * Stage 1 — FCM Push Notification setup for Android (Capacitor).
 *
 * This module handles:
 *  - Requesting notification permission (Android 13+)
 *  - Registering the device with FCM
 *  - Capturing the FCM registration token (logged to console only)
 *  - Listening for foreground notifications
 *  - Listening for notification taps (action opens)
 *
 * No token is sent to any backend yet — that will come in Stage 2.
 */

export interface PushNotificationSetupResult {
  granted: boolean;
}

type NotificationListenerHandle = { remove: () => Promise<void> };

const listeners: NotificationListenerHandle[] = [];

/** Request permission, register for push, and attach listeners. Safe on web (no-op). */
export async function initPushNotifications(): Promise<PushNotificationSetupResult> {
  if (!isNativeApp()) {
    console.log('[Push] Web platform — push notifications disabled');
    return { granted: false };
  }

  const { PushNotifications } = await import(
    /* @vite-ignore */ '@capacitor/push-notifications'
  );

  // ─── Permission (Android 13+ requires explicit POST_NOTIFICATIONS grant) ──
  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }

  if (permStatus.receive !== 'granted') {
    console.warn('[Push] Notification permission not granted');
    return { granted: false };
  }

  console.log('[Push] Permission granted');

  // ─── Listeners (attach before register so we don't miss the token event) ──

  // FCM token — Google refreshes it periodically, so listen for updates
  const tokenListener = await PushNotifications.addListener(
    'registration',
    (token: { value: string }) => {
      // Stage 1: log only. Stage 2 will send this to the backend.
      // The FCM token is a credential-like identifier; never print it in a release build.
      if (import.meta.env.DEV) console.log('[Push] FCM Token:', token.value);
    },
  );
  listeners.push(tokenListener);

  // Token registration errors
  const errorListener = await PushNotifications.addListener(
    'registrationError',
    (err: unknown) => {
      console.error('[Push] Registration error:', err);
    },
  );
  listeners.push(errorListener);

  // Foreground notification received while app is open
  const fgListener = await PushNotifications.addListener(
    'pushNotificationReceived',
    (notification: { title?: string; body?: string; data?: Record<string, unknown> }) => {
      console.log('[Push] Foreground notification:', notification.title, notification.body, notification.data);
    },
  );
  listeners.push(fgListener);

  // User tapped a notification (app was backgrounded or killed)
  const tapListener = await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: {
      notification: { title?: string; body?: string; data?: Record<string, unknown> };
      actionId?: string;
      inputId?: string;
    }) => {
      console.log('[Push] Notification tapped:', action.notification?.data ?? action.notification);
    },
  );
  listeners.push(tapListener);

  // ─── Register with FCM ────────────────────────────────────────
  // This triggers the 'registration' event above with the FCM token.
  await PushNotifications.register();

  return { granted: true };
}

/** Remove all push-notification listeners (call on app teardown). */
export async function cleanupPushNotifications(): Promise<void> {
  for (const l of listeners) {
    try {
      await l.remove();
    } catch {
      // ignore
    }
  }
  listeners.length = 0;
}
