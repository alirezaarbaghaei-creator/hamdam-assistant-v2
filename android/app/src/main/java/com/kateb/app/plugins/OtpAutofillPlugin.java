package com.kateb.app.plugins;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Exposes OTP autofill to JS by way of OtpNotificationListener.
 *
 * WHAT CHANGED, AND WHY
 * ────────────────────
 * This replaces the SMS_RECEIVED BroadcastReceiver version. That version needed
 * the RECEIVE_SMS runtime permission, and its dialog had to be dismissed before
 * the message landed. On device the SMS arrived while the dialog was still open,
 * so the receiver registered too late and the code was discarded — autofill
 * looked broken with no error anywhere. Moving the dialog earlier (v1.6.8) was
 * still only a mitigation: it hid the race instead of removing it, and it left a
 * sensitive permission in the manifest that Cafe Bazaar asks about.
 *
 * The listener approach has no permission to grant and no registration window,
 * so the race is gone rather than narrowed. See OtpNotificationListener for the
 * full rationale.
 *
 * Notification ACCESS is a Settings toggle rather than a runtime permission, so
 * it cannot be requested from a dialog: the user has to be sent to
 * ACTION_NOTIFICATION_LISTENER_SETTINGS and come back. isEnabled() lets JS poll
 * for the result, and openSettings() opens the page.
 */
@CapacitorPlugin(name = "SmsAutofill")
public class OtpAutofillPlugin extends Plugin {

    private static final String TAG = "KatebSmsAutofill";

    /** Event name the JS side subscribes to with addListener('code', ...). */
    private static final String EVENT_CODE = "code";

    private boolean active = false;

    // ── JS API ───────────────────────────────────────────────────────────

    /**
     * Whether notification access has been granted to this app.
     *
     * JS polls this on returning from Settings to know when to arm listening, so
     * it has to reflect the current system state and not a cached value.
     */
    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", isNotificationAccessGranted());
        call.resolve(ret);
    }

    /**
     * Opens the system page where notification access is toggled.
     *
     * There is no dialog to request this, so "asking" means handing the user off
     * to Settings. Falls back to the app's own settings page on the rare device
     * where the listener-specific screen does not resolve, so the tap never does
     * nothing.
     */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "notification listener settings unavailable, falling back", e);
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception e2) {
                call.reject("cannot open notification access settings", e2);
            }
        }
    }

    /**
     * Arms listening and resolves { listening, enabled }.
     *
     * Not an error to call this without notification access — it resolves with
     * listening=false and the caller simply keeps the field manual. Autofill is
     * an enhancement; a user who never granted access must still be able to log
     * in, so nothing here rejects.
     */

    /**
     * Arms listening and resolves { listening, enabled }.
     *
     * Not an error to call this without notification access — it resolves with
     * listening=false and the caller simply keeps the field manual. Autofill is
     * an enhancement; a user who never granted access must still be able to log
     * in, so nothing here rejects.
     */
    @PluginMethod
    public void start(PluginCall call) {
        JSObject ret = new JSObject();
        if (!isNotificationAccessGranted()) {
            active = false;
            ret.put("listening", false);
            ret.put("enabled", false);
            Log.d(TAG, "start: notification access not granted, staying manual");
            call.resolve(ret);
            return;
        }
        active = true;
        OtpNotificationListener.setBridge(this);
        Log.d(TAG, "receiver registered, waiting for SMS notification");
        ret.put("listening", true);
        ret.put("enabled", true);
        call.resolve(ret);
    }

    /**
     * Disarms listening. Safe to call twice and safe when never started.
     */
    @PluginMethod
    public void stop(PluginCall call) {
        active = false;
        OtpNotificationListener.setBridge(null);
        JSObject ret = new JSObject();
        ret.put("listening", false);
        call.resolve(ret);
    }

    /**
     * Pushes a captured code to JS.
     *
     * Called by OtpNotificationListener from the system's binder thread, but
     * notifyListeners() must run on the plugin's own thread or the event is lost
     * with no error on the JS side, so this hops to the activity thread first.
     *
     * Ignored entirely when !active: the service is bound by the system for as
     * long as access is granted, so it can fire while the OTP screen is closed
     * and the WebView would have no listener to receive it.
     */
    void emitCode(String code) {
        if (!active || code == null) return;
        getActivity().runOnUiThread(() -> {
            if (!active) return;
            JSObject payload = new JSObject();
            payload.put("code", code);
            Log.d(TAG, "emitting code to JS");
            notifyListeners(EVENT_CODE, payload, true);
        });
    }

    /**
     * Reads the enabled_notification_listeners setting.
     *
     * The setting stores colon-separated "pkg/cls" pairs of bound listeners, so a
     * substring test for our own flattened component name is what tells whether
     * the user has granted access. Compared against ComponentName.flattenToString()
     * rather than by hand-building the string, so it stays correct if the package
     * or class is ever renamed.
     */
    private boolean isNotificationAccessGranted() {
        String flat = new ComponentName(
            getContext().getPackageName(), OtpNotificationListener.class.getName()
        ).flattenToString();

        try {
            String enabled = Settings.Secure.getString(
                getContext().getContentResolver(), "enabled_notification_listeners"
            );
            if (TextUtils.isEmpty(enabled)) return false;
            for (String entry : enabled.split(":")) {
                if (flat.equalsIgnoreCase(entry.trim())) return true;
            }
            return false;
        } catch (Exception e) {
            // A malformed or unreadable setting must not crash the OTP screen;
            // treating it as "not granted" degrades to manual entry.
            Log.w(TAG, "could not read notification listener setting", e);
            return false;
        }
    }
}
