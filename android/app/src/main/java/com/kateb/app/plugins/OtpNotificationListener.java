package com.kateb.app.plugins;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;
import android.util.Log;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Picks the OTP out of the SMS notification that the messaging app posts.
 *
 * WHY THIS INSTEAD OF RECEIVE_SMS
 * ───────────────────────────────
 * The broadcast route (SMS_RECEIVED) needs the RECEIVE_SMS runtime permission,
 * and that dialog has to be answered before the message arrives. On device the
 * dialog was still up while the SMS was delivered, so nothing was listening and
 * the code was dropped — and on Cafe Bazaar RECEIVE_SMS is a sensitive
 * permission that needs a declaration form on top of it.
 *
 * Reading the notification sidesteps both problems:
 *
 *   - No permission is declared at all. Notification access is granted by the
 *     user in Settings (one toggle, one time), not through a runtime dialog, and
 *     it is not in the sensitive-permission family that triggers store review
 *     questions. The APK asks the user for nothing at install time.
 *   - No Google Play Services. SMS Retriever and User Consent both live there
 *     and neither is usable here (Retriever needs an 11-char app hash that a
 *     pre-approved IranPayamak pattern template cannot carry; Consent simply is
 *     not installed on a large share of these devices).
 *   - No race. The system binds this service for as long as access is granted,
 *     so there is no window in which it starts listening too late. That was the
 *     entire failure of the receiver approach.
 *
 * It only READS notification text and never cancels anything, so the SMS still
 * reaches the messaging app and its notification displays as normal.
 */
public class OtpNotificationListener extends NotificationListenerService {

    private static final String TAG = "KatebSmsAutofill";

    /**
     * A run of 4-6 digits not glued to other digits.
     *
     * The guards are load-bearing: an Iranian mobile number (09123456789) and an
     * operator line number (3000xxxx) are both long digit runs, so without
     * (?<!\d) / (?!\d) the matcher would "find a code" inside them. With the
     * guards no run inside a 10+ digit number can match.
     */
    private static final Pattern CODE_RUN = Pattern.compile("(?<!\\d)\\d{4,6}(?!\\d)");

    /**
     * Live bridge to the plugin instance currently registered.
     *
     * The system binds this service in its own lifetime, independent of whether
     * the WebView is up, so it cannot reach JS on its own. OtpAutofillPlugin sets
     * this on start() and clears it on stop(), which gives the "only while the
     * OTP screen is open" window for free: with the bridge null the service
     * observes and discards.
     *
     * Volatile because it is written from the plugin (main thread) and read from
     * the system's binder thread here.
     */
    private static volatile OtpAutofillPlugin bridge;

    /** Called by OtpAutofillPlugin from start()/stop(). */
    static void setBridge(OtpAutofillPlugin plugin) {
        bridge = plugin;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;

        OtpAutofillPlugin target = bridge;
        if (target == null) return;

        String text = extractText(sbn.getNotification());
        if (TextUtils.isEmpty(text)) return;

        Matcher m = CODE_RUN.matcher(text);
        if (!m.find()) {
            Log.d(TAG, "notification seen, no code pattern. length=" + text.length());
            return;
        }

        String code = m.group();
        Log.d(TAG, "onReceive fired, body length=" + text.length() + ", captured OTP=" + code);
        target.emitCode(code);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Nothing to do: the OTP is taken from the posted notification, and a
        // removed one is never a code we still need. Declared only so this reads
        // as a deliberate NotificationListenerService, not a partial override.
    }

    /**
     * Flattens every text carrier a notification can use into one string.
     *
     * Messaging apps disagree about which one they fill in: stock AOSP puts the
     * body in EXTRA_TEXT, Samsung and Huawei often use EXTRA_BIG_TEXT or an
     * EXTRA_TEXT_LINES array for the collapsed/expanded forms, and the title can
     * carry the sender or part of the body. Trying all of them is what makes the
     * matcher work across ROMs instead of only on the developer's phone.
     */
    private String extractText(Notification n) {
        if (n == null || n.extras == null) return "";

        StringBuilder sb = new StringBuilder();

        CharSequence title = n.extras.getCharSequence(Notification.EXTRA_TITLE);
        if (title != null) sb.append(title).append(' ');

        CharSequence big = n.extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (big != null) sb.append(big).append(' ');

        CharSequence text = n.extras.getCharSequence(Notification.EXTRA_TEXT);
        if (text != null) sb.append(text).append(' ');

        CharSequence sub = n.extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
        if (sub != null) sb.append(sub).append(' ');

        // MessagingStyle notifications store the individual messages here rather
        // than in EXTRA_TEXT, so a plain read sees an empty body on the devices
        // that use it.
        CharSequence[] lines = n.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) {
            for (CharSequence line : lines) {
                if (line != null) sb.append(line).append(' ');
            }
        }

        // EXTRA_MESSAGES also holds the structured MessagingStyle history as
        // Bundles of "text" keys. It is deliberately not walked: the flattened
        // fields above already cover the cases that matter, and parsing it would
        // mean guessing per-ROM Bundle shapes.

        return sb.toString();
    }
}
