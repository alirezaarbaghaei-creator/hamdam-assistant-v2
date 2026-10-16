package com.kateb.app.plugins;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentSender;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.RemoteException;
import android.util.Base64;
import android.util.Log;

import com.android.vending.billing.IInAppBillingService;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;

import java.util.ArrayList;
import java.util.List;

// FIX (pay): Capacitor only routes a legacy activity result to a plugin whose
// @CapacitorPlugin annotation declares that request code. With the default
// requestCodes = {} , Bridge.getPluginWithRequestCode(10001) returns null,
// Bridge.onActivityResult() falls through to the Cordova path and
// handleOnActivityResult() is NEVER called -> the purchase promise never
// settles and the checkout spins forever on "در حال اتصال به کافه‌بازار...".
// The literal 10001 must stay equal to REQUEST_CODE_PURCHASE below.
@CapacitorPlugin(name = "CafeBazaarBilling", requestCodes = { 10001 })
public class CafeBazaarBillingPlugin extends Plugin {

    private static final String TAG = "CafeBazaarBilling";
    private static final String BAZAAR_PACKAGE = "com.farsitel.bazaar";
    // ── Diagnostic log buffer ────────────────────────────────────
    // FIX (diag): every step of the billing handshake is recorded in a bounded
    // in-memory ring buffer and exposed to JS via getDiagnostics(), so the
    // in-app diagnostics panel can show the real failure point on a device
    // where adb / Chrome remote debugging are not available.
    private static final int NATIVE_LOG_LIMIT = 400;
    private final List<String> nativeLogs = new ArrayList<>();

    private void appendNativeLog(String level, String msg) {
        String line = new java.text.SimpleDateFormat("HH:mm:ss.SSS", java.util.Locale.US)
            .format(new java.util.Date()) + " " + level + " " + msg;
        synchronized (nativeLogs) {
            nativeLogs.add(line);
            while (nativeLogs.size() > NATIVE_LOG_LIMIT) {
                nativeLogs.remove(0);
            }
        }
    }

    private void log(String msg) { appendNativeLog("D", msg); Log.d(TAG, msg); }
    private void log(String msg, Throwable t) { appendNativeLog("E", msg + " :: " + t); Log.e(TAG, msg, t); }
    private void logE(String msg) { appendNativeLog("E", msg); Log.e(TAG, msg); }
    private void logE(String msg, Throwable t) { appendNativeLog("E", msg + " :: " + t); Log.e(TAG, msg, t); }
    private void logW(String msg) { appendNativeLog("W", msg); Log.w(TAG, msg); }
    private void logW(String msg, Throwable t) { appendNativeLog("W", msg + " :: " + t); Log.w(TAG, msg, t); }

    private static final String BILLING_SERVICE_ACTION = "ir.cafebazaar.pardakht.InAppBillingService.BIND";

    /**
     * FIX (pay): CafeBazaar RSA public key for this app (com.kateb.app), taken from the
     * CafeBazaar developer panel. Bazaar signs INAPP_PURCHASE_DATA with the matching
     * private key; verifying that signature here is the only local proof that the
     * purchase payload really came from Bazaar instead of a tampered response.
     *
     * This is a PUBLIC key - it is meant to ship inside the APK and is not a secret.
     * If the key is ever rotated in the panel, replace it here and rebuild.
     */
    private static final String BAZAAR_RSA_PUBLIC_KEY =
        "MIHNMA0GCSqGSIb3DQEBAQUAA4G7ADCBtwKBrwC4w0OoUPB5su8EKUEAqEubJ05GnvTw2mOBO2cxNYozZ3CMud4l58hAwbPssJLyXOHHtfuNgtbt3NE+cLbXWC/7/L4mc9sNXPswbHjo5yXS7U4kYj2YymumRwwpVy0NC4NDgaX1CfLCWjAIRzzKCjm3U/a+rqHJzJp9HUAWMYDl2+WX3NvzhAHPuA/4nGwyx9CC6IFwmTvR/+vm5CSO9tmOPmiWpxUszGgqaFwIhysCAwEAAQ==";

    /** Bazaar/Play legacy billing signs purchase data with SHA1withRSA over the raw JSON. */
    private static final String SIGNATURE_ALGORITHM = "SHA1withRSA";

    private static final int API_VERSION = 3;
    private static final String ITEM_TYPE_SUBS = "subs";
    private static final int REQUEST_CODE_PURCHASE = 10001;

    private static final String RESPONSE_CODE = "RESPONSE_CODE";
    private static final String BUY_INTENT = "BUY_INTENT";
    private static final String INAPP_PURCHASE_DATA = "INAPP_PURCHASE_DATA";
    private static final String INAPP_DATA_SIGNATURE = "INAPP_DATA_SIGNATURE";
    private static final String INAPP_PURCHASE_DATA_LIST = "INAPP_PURCHASE_DATA_LIST";
    private static final String INAPP_DATA_SIGNATURE_LIST = "INAPP_DATA_SIGNATURE_LIST";
    private static final String INTENT_V2_SUPPORT = "INTENT_V2_SUPPORT";

    private static final int BILLING_RESPONSE_RESULT_OK = 0;
    private static final int BILLING_RESPONSE_RESULT_USER_CANCELED = 1;
    private static final int BILLING_RESPONSE_RESULT_BILLING_UNAVAILABLE = 3;
    private static final int BILLING_RESPONSE_RESULT_ITEM_UNAVAILABLE = 4;
    private static final int BILLING_RESPONSE_RESULT_ITEM_ALREADY_OWNED = 7;

    private static final long SERVICE_TIMEOUT_MS = 10_000L;

    private IInAppBillingService billingService;
    private boolean isBound = false;
    private boolean isConnecting = false;
    private boolean subscriptionsSupported = false;

    private PluginCall pendingPurchaseCall;
    private String pendingProductId;
    private String pendingPayload;

    private PluginCall pendingQueryCall;

    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private Runnable purchaseTimeoutRunnable;
    private Runnable queryTimeoutRunnable;

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            log("billing service connected");
            billingService = IInAppBillingService.Stub.asInterface(service);
            isBound = true;
            isConnecting = false;

            // Check subscription support
            try {
                int response = billingService.isBillingSupported(API_VERSION, getContext().getPackageName(), ITEM_TYPE_SUBS);
                subscriptionsSupported = (response == BILLING_RESPONSE_RESULT_OK);
                log("subscriptions supported = " + subscriptionsSupported + " (response=" + response + ")");
            } catch (RemoteException e) {
                logE("Failed to check billing support", e);
                subscriptionsSupported = false;
            }

            cancelPurchaseTimeout();
            cancelQueryTimeout();

            if (pendingPurchaseCall != null) {
                log("billing service ready, proceeding with pending purchase");
                executePurchase(pendingPurchaseCall, pendingProductId, pendingPayload);
            }
            if (pendingQueryCall != null) {
                log("billing service ready, proceeding with pending query");
                executeQueryPurchases(pendingQueryCall);
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            log("billing service disconnected");
            billingService = null;
            isBound = false;
            isConnecting = false;
            subscriptionsSupported = false;
        }
    };

    private boolean bindBazaarService() {
        if (isBound && billingService != null) return true;
        if (isConnecting) return true;

        log("connecting to billing service");
        Intent intent = new Intent(BILLING_SERVICE_ACTION);
        intent.setPackage(BAZAAR_PACKAGE);

        // Check if the billing service is actually available before binding
        PackageManager pm = getContext().getPackageManager();
        List<ResolveInfo> intentServices = pm.queryIntentServices(intent, 0);
        if (intentServices == null || intentServices.isEmpty()) {
            logE("CafeBazaar billing service not found on device");
            return false;
        }

        isConnecting = true;
        boolean started = getContext().bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
        if (!started) {
            isConnecting = false;
            logE("bindService returned false — CafeBazaar not installed or service unavailable");
        }
        return started;
    }

    private void unbindBazaarService() {
        if (isBound) {
            try {
                getContext().unbindService(serviceConnection);
            } catch (Exception e) {
                logW("Error unbinding service", e);
            }
        }
        isBound = false;
        isConnecting = false;
        billingService = null;
    }

    @Override
    public void handleOnDestroy() {
        cancelPurchaseTimeout();
        cancelQueryTimeout();
        unbindBazaarService();
    }

    private boolean isBazaarInstalled() {
        try {
            PackageManager pm = getContext().getPackageManager();
            pm.getPackageInfo(BAZAAR_PACKAGE, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    // Workaround: CafeBazaar sometimes returns response code as Long instead of Integer
    private int getResponseCodeFromBundle(Bundle b) {
        if (b == null) return -1;
        Object o = b.get(RESPONSE_CODE);
        if (o == null) {
            log("Bundle with null response code, assuming OK (known issue)");
            return BILLING_RESPONSE_RESULT_OK;
        } else if (o instanceof Integer) {
            return (Integer) o;
        } else if (o instanceof Long) {
            return ((Long) o).intValue();
        } else {
            logE("Unexpected type for bundle response code: " + o.getClass().getName());
            return -1;
        }
    }

    // Workaround: CafeBazaar sometimes returns response code as Long instead of Integer
    private int getResponseCodeFromIntent(Intent i) {
        if (i == null || i.getExtras() == null) return -1;
        Object o = i.getExtras().get(RESPONSE_CODE);
        if (o == null) {
            log("Intent with no response code, assuming OK (known issue)");
            return BILLING_RESPONSE_RESULT_OK;
        } else if (o instanceof Integer) {
            return (Integer) o;
        } else if (o instanceof Long) {
            return ((Long) o).intValue();
        } else {
            logE("Unexpected type for intent response code: " + o.getClass().getName());
            return -1;
        }
    }

    // ── Purchase signature verification ──────────────────────────

    /**
     * Verifies INAPP_DATA_SIGNATURE against INAPP_PURCHASE_DATA using the app's
     * CafeBazaar RSA public key. Returns false on any parse/verify failure.
     */
    private boolean verifyPurchaseSignature(String signedData, String signature) {
        if (signedData == null || signedData.isEmpty()) return false;
        if (signature == null || signature.isEmpty()) {
            logE("signature verification failed: INAPP_DATA_SIGNATURE missing");
            return false;
        }
        try {
            byte[] keyBytes = Base64.decode(BAZAAR_RSA_PUBLIC_KEY, Base64.DEFAULT);
            PublicKey publicKey = KeyFactory.getInstance("RSA")
                .generatePublic(new X509EncodedKeySpec(keyBytes));
            Signature sig = Signature.getInstance(SIGNATURE_ALGORITHM);
            sig.initVerify(publicKey);
            sig.update(signedData.getBytes("UTF-8"));
            boolean ok = sig.verify(Base64.decode(signature, Base64.DEFAULT));
            if (!ok) {
                logE("signature verification failed: signature does not match the "
                    + "CafeBazaar RSA public key embedded in this build. Check that the key "
                    + "in the CafeBazaar panel matches BAZAAR_RSA_PUBLIC_KEY.");
            }
            return ok;
        } catch (Exception e) {
            logE("signature verification error", e);
            return false;
        }
    }

    // ── isAvailable ──────────────────────────────────────────────

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        boolean installed = isBazaarInstalled();
        ret.put("available", installed);
        if (installed) {
            boolean bound = bindBazaarService();
            ret.put("bound", bound);
        }
        // FIX (diag-2): isAvailable is the one method the web layer always calls, so
        // it doubles as a second, independent channel for the diagnostic snapshot in
        // case a direct getDiagnostics() call does not come back.
        try {
            fillDiagnostics(ret);
        } catch (Throwable t) {
            appendNativeLog("E", "fillDiagnostics from isAvailable failed :: " + t);
        }
        call.resolve(ret);
    }

    // ── launchPurchase ──────────────────────────────────────────

    @PluginMethod
    public void launchPurchase(final PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("productId is required");
            return;
        }

        String payload = call.getString("payload", "");

        if (!isBazaarInstalled()) {
            call.reject("کافه‌بازار روی دستگاه نصب نیست. لطفاً ابتدا کافه‌بازار را نصب کنید.");
            return;
        }

        if (billingService != null && isBound) {
            log("billing service already connected, requesting buy intent");
            executePurchase(call, productId, payload);
            return;
        }

        // Service not ready — store pending and start async bind with timeout
        log("billing service not ready, storing pending purchase and connecting");
        pendingPurchaseCall = call;
        pendingProductId = productId;
        pendingPayload = payload;

        boolean started = bindBazaarService();
        if (!started) {
            pendingPurchaseCall = null;
            pendingProductId = null;
            pendingPayload = null;
            call.reject("کافه‌بازار روی دستگاه در دسترس نیست. لطفاً از نصب و فعال بودن کافه‌بازار اطمینان حاصل کنید.");
            return;
        }

        startPurchaseTimeout();
    }

    private void startPurchaseTimeout() {
        cancelPurchaseTimeout();
        purchaseTimeoutRunnable = () -> {
            if (pendingPurchaseCall != null) {
                logE("billing service connection timed out (10s)");
                PluginCall timedOut = pendingPurchaseCall;
                pendingPurchaseCall = null;
                pendingProductId = null;
                pendingPayload = null;
                isConnecting = false;
                timedOut.reject("اتصال به کافه‌بازار برقرار نشد. لطفاً از نصب و فعال بودن کافه‌بازار اطمینان حاصل کنید.");
            }
        };
        timeoutHandler.postDelayed(purchaseTimeoutRunnable, SERVICE_TIMEOUT_MS);
    }

    private void cancelPurchaseTimeout() {
        if (purchaseTimeoutRunnable != null) {
            timeoutHandler.removeCallbacks(purchaseTimeoutRunnable);
            purchaseTimeoutRunnable = null;
        }
    }

    private void executePurchase(PluginCall call, String productId, String payload) {
        if (billingService == null) {
            call.reject("سرویس کافه‌بازار آماده نیست");
            return;
        }

        if (!subscriptionsSupported) {
            logE("subscriptions not supported on this device/bazaar version");
            call.reject("اشتراک‌ها در این نسخه کافه‌بازار پشتیبانی نمی‌شوند");
            return;
        }

        try {
            // Check if getBuyIntentV2 is supported via getPurchaseConfig
            boolean useV2 = false;
            try {
                Bundle configBundle = billingService.getPurchaseConfig(API_VERSION);
                if (configBundle != null && configBundle.getBoolean(INTENT_V2_SUPPORT, false)) {
                    useV2 = true;
                    log("getBuyIntentV2 is supported");
                }
            } catch (Exception e) {
                logW("getPurchaseConfig failed, falling back to getBuyIntent", e);
            }

            Bundle buyIntentBundle = null;
            if (useV2) {
                log("requesting buy intent V2 for productId=" + productId);
                try {
                    buyIntentBundle = billingService.getBuyIntentV2(
                        API_VERSION,
                        getContext().getPackageName(),
                        productId,
                        ITEM_TYPE_SUBS,
                        payload
                    );
                } catch (Throwable t) {
                    // FIX (pay): getBuyIntentV2 is missing on some Bazaar builds that
                    // still report INTENT_V2_SUPPORT. The AIDL stub then throws
                    // NoSuchMethodError, which is an Error (not an Exception) and would
                    // escape the outer catch and crash the app. Fall back to V1.
                    logW("getBuyIntentV2 unavailable, falling back to getBuyIntent", t);
                    useV2 = false;
                    buyIntentBundle = null;
                }
            }
            if (buyIntentBundle == null) {
                log("requesting buy intent for productId=" + productId);
                buyIntentBundle = billingService.getBuyIntent(
                    API_VERSION,
                    getContext().getPackageName(),
                    productId,
                    ITEM_TYPE_SUBS,
                    payload
                );
            }

            if (buyIntentBundle == null) {
                logE("buy intent bundle is null");
                call.reject("پاسخ خرید از کافه‌بازار دریافت نشد");
                return;
            }

            int responseCode = getResponseCodeFromBundle(buyIntentBundle);
            log("getBuyIntent response code = " + responseCode);
            if (responseCode != BILLING_RESPONSE_RESULT_OK) {
                logE("getBuyIntent failed with code " + responseCode);
                if (responseCode == BILLING_RESPONSE_RESULT_USER_CANCELED) {
                    call.reject("خرید لغو شد");
                } else if (responseCode == BILLING_RESPONSE_RESULT_ITEM_ALREADY_OWNED) {
                    call.reject("این اشتراک قبلاً خریداری شده است");
                } else {
                    call.reject("خطا در خرید: کد " + responseCode);
                }
                return;
            }

            // For V2, the BUY_INTENT is an Intent (startActivityForResult)
            // For V1, the BUY_INTENT is a PendingIntent (startIntentSenderForResult)
            if (useV2) {
                Object buyIntentObj = buyIntentBundle.get(BUY_INTENT);
                if (buyIntentObj == null || !(buyIntentObj instanceof Intent)) {
                    logE("BUY_INTENT (V2) missing or wrong type: " + (buyIntentObj != null ? buyIntentObj.getClass().getName() : "null"));
                    call.reject("خطا در دریافت intent خرید از کافه‌بازار");
                    return;
                }

                pendingPurchaseCall = call;
                pendingProductId = productId;

                Intent buyIntent = (Intent) buyIntentObj;
                log("launching buy intent V2");
                try {
                    Activity activity = getActivity();
                    if (activity == null) {
                        call.reject("Activity در دسترس نیست");
                        pendingPurchaseCall = null;
                        pendingProductId = null;
                        return;
                    }
                    activity.startActivityForResult(buyIntent, REQUEST_CODE_PURCHASE);
                } catch (Exception e) {
                    logE("startActivityForResult exception", e);
                    call.reject("خطا در شروع فرآیند خرید");
                    pendingPurchaseCall = null;
                    pendingProductId = null;
                }
            } else {
                // V1: BUY_INTENT is a PendingIntent — use untyped getParcelable for API compatibility
                @SuppressLint("DeprecatedCall")
                PendingIntent pendingIntent = buyIntentBundle.getParcelable(BUY_INTENT);
                if (pendingIntent == null) {
                    logE("BUY_INTENT (V1) is null");
                    call.reject("خطا در دریافت intent خرید از کافه‌بازار");
                    return;
                }

                pendingPurchaseCall = call;
                pendingProductId = productId;

                log("launching buy intent V1");
                try {
                    Activity activity = getActivity();
                    if (activity == null) {
                        call.reject("Activity در دسترس نیست");
                        pendingPurchaseCall = null;
                        pendingProductId = null;
                        return;
                    }
                    activity.startIntentSenderForResult(pendingIntent.getIntentSender(), REQUEST_CODE_PURCHASE, new Intent(), 0, 0, 0);
                } catch (IntentSender.SendIntentException e) {
                    logE("SendIntentException during purchase", e);
                    call.reject("خطا در شروع فرآیند خرید");
                    pendingPurchaseCall = null;
                    pendingProductId = null;
                }
            }
        } catch (RemoteException e) {
            logE("Purchase RemoteException", e);
            call.reject("خطا در ارتباط با سرویس کافه‌بازار");
            pendingPurchaseCall = null;
            pendingProductId = null;
        } catch (Exception e) {
            logE("Purchase error", e);
            String msg = e.getMessage();
            if (msg != null && (msg.contains("cancel") || msg.contains("Cancel"))) {
                call.reject("خرید لغو شد");
            } else {
                call.reject(msg != null ? msg : "خطا در خرید");
            }
            pendingPurchaseCall = null;
            pendingProductId = null;
        }
    }

    @Override
    public void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_CODE_PURCHASE) {
            return;
        }

        PluginCall call = pendingPurchaseCall;
        if (call == null) {
            logW("onActivityResult: no pending purchase call");
            return;
        }

        log("purchase activity result = " + resultCode);

        if (resultCode == Activity.RESULT_OK && data != null) {
            // FIX (pay): evaluate the billing response code BEFORE reading the payload.
            // Bazaar can return Activity.RESULT_OK together with a non-OK response code
            // and an empty payload, in which case the old order reported the misleading
            // "داده خرید دریافت نشد" instead of the real reason (already owned / canceled).
            int responseCode = getResponseCodeFromIntent(data);
            log("intent response code = " + responseCode);

            if (responseCode != BILLING_RESPONSE_RESULT_OK) {
                logE("intent response code not OK: " + responseCode);
                if (responseCode == BILLING_RESPONSE_RESULT_USER_CANCELED) {
                    call.reject("خرید لغو شد");
                } else if (responseCode == BILLING_RESPONSE_RESULT_ITEM_ALREADY_OWNED) {
                    call.reject("این اشتراک قبلاً خریداری شده است");
                } else {
                    call.reject("خطا در خرید: کد " + responseCode);
                }
                pendingPurchaseCall = null;
                pendingProductId = null;
                return;
            }

            String purchaseData = data.getStringExtra(INAPP_PURCHASE_DATA);
            String dataSignature = data.getStringExtra(INAPP_DATA_SIGNATURE);

            if (purchaseData == null || purchaseData.isEmpty()) {
                logE("purchase data missing in result");
                call.reject("داده خرید دریافت نشد");
                pendingPurchaseCall = null;
                pendingProductId = null;
                return;
            }

            // FIX (pay): reject a purchase payload that is not signed by CafeBazaar
            // before it can be treated as a successful purchase. Server-side verification
            // through the Developer API stays the authoritative check; this is the local
            // integrity gate.
            if (!verifyPurchaseSignature(purchaseData, dataSignature)) {
                logE("rejecting purchase: invalid signature");
                call.reject("امضای خرید نامعتبر است. لطفاً با پشتیبانی تماس بگیرید.");
                pendingPurchaseCall = null;
                pendingProductId = null;
                return;
            }

            try {
                JSONObject purchaseJson = new JSONObject(purchaseData);
                JSObject ret = new JSObject();
                ret.put("productId", purchaseJson.optString("productId", pendingProductId != null ? pendingProductId : ""));
                ret.put("purchaseToken", purchaseJson.optString("purchaseToken", ""));
                ret.put("orderId", purchaseJson.optString("orderId", ""));
                ret.put("payload", purchaseJson.optString("developerPayload", ""));
                ret.put("purchaseTime", purchaseJson.optLong("purchaseTime", 0));
                ret.put("purchaseState", purchaseJson.optInt("purchaseState", 0));
                ret.put("dataSignature", dataSignature != null ? dataSignature : "");
                log("purchase successful, resolving with purchase data");
                call.resolve(ret);
            } catch (Exception e) {
                logE("Error parsing purchase data", e);
                call.reject("خطا در پردازش داده خرید");
            }
        } else if (resultCode == Activity.RESULT_CANCELED) {
            log("purchase canceled by user");
            call.reject("خرید لغو شد");
        } else {
            logE("purchase failed with result code " + resultCode);
            call.reject("خرید ناموفق بود");
        }

        pendingPurchaseCall = null;
        pendingProductId = null;
    }

    // ── queryPurchases ─────────────────────────────────────────

    @PluginMethod
    public void queryPurchases(PluginCall call) {
        if (!isBazaarInstalled()) {
            call.reject("کافه‌بازار روی دستگاه نصب نیست");
            return;
        }

        if (billingService != null && isBound) {
            executeQueryPurchases(call);
            return;
        }

        log("queryPurchases: service not ready, storing pending and connecting");
        pendingQueryCall = call;

        boolean started = bindBazaarService();
        if (!started) {
            pendingQueryCall = null;
            call.reject("کافه‌بازار روی دستگاه در دسترس نیست");
            return;
        }

        startQueryTimeout();
    }

    private void startQueryTimeout() {
        cancelQueryTimeout();
        queryTimeoutRunnable = () -> {
            if (pendingQueryCall != null) {
                logE("queryPurchases connection timed out (10s)");
                PluginCall timedOut = pendingQueryCall;
                pendingQueryCall = null;
                isConnecting = false;
                timedOut.reject("اتصال به کافه‌بازار برقرار نشد");
            }
        };
        timeoutHandler.postDelayed(queryTimeoutRunnable, SERVICE_TIMEOUT_MS);
    }

    private void cancelQueryTimeout() {
        if (queryTimeoutRunnable != null) {
            timeoutHandler.removeCallbacks(queryTimeoutRunnable);
            queryTimeoutRunnable = null;
        }
    }

    private void executeQueryPurchases(PluginCall call) {
        if (billingService == null) {
            call.reject("سرویس کافه‌بازار آماده نیست");
            return;
        }

        try {
            Bundle purchasesBundle = billingService.getPurchases(
                API_VERSION,
                getContext().getPackageName(),
                ITEM_TYPE_SUBS,
                null
            );

            if (purchasesBundle == null) {
                call.reject("خطا در دریافت خریدها از کافه‌بازار");
                return;
            }

            int responseCode = getResponseCodeFromBundle(purchasesBundle);
            if (responseCode != BILLING_RESPONSE_RESULT_OK) {
                logE("getPurchases response code: " + responseCode);
                call.reject("خطا در دریافت خریدها: کد " + responseCode);
                return;
            }

            ArrayList<String> purchaseDataList = purchasesBundle.getStringArrayList(INAPP_PURCHASE_DATA_LIST);
            ArrayList<String> signatureList = purchasesBundle.getStringArrayList(INAPP_DATA_SIGNATURE_LIST);

            JSObject ret = new JSObject();
            JSONArray purchases = new JSONArray();

            if (purchaseDataList != null) {
                for (int i = 0; i < purchaseDataList.size(); i++) {
                    try {
                        JSONObject p = new JSONObject(purchaseDataList.get(i));
                        JSObject item = new JSObject();
                        item.put("productId", p.optString("productId", ""));
                        item.put("purchaseToken", p.optString("purchaseToken", ""));
                        item.put("orderId", p.optString("orderId", ""));
                        item.put("purchaseTime", p.optLong("purchaseTime", 0));
                        item.put("purchaseState", p.optInt("purchaseState", 0));
                        String itemSignature = (signatureList != null && i < signatureList.size())
                            ? signatureList.get(i) : null;
                        item.put("dataSignature", itemSignature != null ? itemSignature : "");

                        // FIX (pay): never hand an unsigned/unverified purchase to the
                        // restore flow - skip it and keep going so one bad entry cannot
                        // block the rest of the user's purchases.
                        if (!verifyPurchaseSignature(purchaseDataList.get(i), itemSignature)) {
                            logW("skipping purchase item " + i + ": invalid signature");
                            continue;
                        }
                        purchases.put(item);
                    } catch (Exception e) {
                        logW("Error parsing purchase item " + i, e);
                    }
                }
            }

            ret.put("purchases", purchases);
            call.resolve(ret);
        } catch (RemoteException e) {
            logE("queryPurchases RemoteException", e);
            call.reject("خطا در دریافت خریدها از کافه‌بازار");
        } catch (Exception e) {
            logE("queryPurchases error", e);
            call.reject("خطا در دریافت خریدها");
        }
    }

    // ── consumePurchase ─────────────────────────────────────────

    @PluginMethod
    public void consumePurchase(PluginCall call) {
        String purchaseToken = call.getString("purchaseToken");
        if (purchaseToken == null || purchaseToken.isEmpty()) {
            call.reject("purchaseToken is required");
            return;
        }

        if (billingService == null || !isBound) {
            call.reject("کافه‌بازار در دسترس نیست");
            return;
        }

        try {
            int result = billingService.consumePurchase(
                API_VERSION,
                getContext().getPackageName(),
                purchaseToken
            );
            if (result == 0) {
                call.resolve(new JSObject());
            } else {
                call.reject("خطا در consume: کد " + result);
            }
        } catch (RemoteException e) {
            logE("consume RemoteException", e);
            call.reject("خطا در consume خرید");
        } catch (Exception e) {
            logE("consume error", e);
            call.reject("خطا در consume");
        }
    }

    // ── getDiagnostics ──────────────────────────────────────────

    /**
     * FIX (diag-2): the body is split out and wrapped in catch (Throwable) by the
     * caller. An uncaught Throwable in a Capacitor plugin method means the JS
     * promise never settles, which is exactly what left the diagnostics panel stuck
     * on "در حال جمع‌آوری".
     */
    private void fillDiagnostics(JSObject ret) {
        Context ctx = getContext();

        ret.put("pluginRegistered", true);
        ret.put("appPackage", ctx != null ? ctx.getPackageName() : "");
        ret.put("androidSdk", String.valueOf(android.os.Build.VERSION.SDK_INT));
        ret.put("androidRelease", android.os.Build.VERSION.RELEASE);
        ret.put("deviceModel", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL);
        ret.put("apiVersion", String.valueOf(API_VERSION));
        ret.put("itemType", ITEM_TYPE_SUBS);
        ret.put("requestCodePurchase", String.valueOf(REQUEST_CODE_PURCHASE));

        boolean installed = isBazaarInstalled();
        ret.put("bazaarInstalled", installed);

        String versionName = "";
        String versionCode = "";
        if (installed && ctx != null) {
            try {
                android.content.pm.PackageInfo pi =
                    ctx.getPackageManager().getPackageInfo(BAZAAR_PACKAGE, 0);
                versionName = pi.versionName != null ? pi.versionName : "";
                versionCode = String.valueOf(
                    android.os.Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
            } catch (Exception e) {
                appendNativeLog("E", "reading bazaar package info failed :: " + e);
            }
        }
        ret.put("bazaarVersionName", versionName);
        ret.put("bazaarVersionCode", versionCode);

        ret.put("isBound", isBound);
        ret.put("isConnecting", isConnecting);
        ret.put("subscriptionsSupported", subscriptionsSupported);

        // Is the billing service even resolvable (package visibility)?
        boolean serviceResolvable = false;
        if (ctx != null) {
            try {
                Intent intent = new Intent(BILLING_SERVICE_ACTION);
                intent.setPackage(BAZAAR_PACKAGE);
                List<ResolveInfo> list = ctx.getPackageManager().queryIntentServices(intent, 0);
                serviceResolvable = list != null && !list.isEmpty();
            } catch (Exception e) {
                appendNativeLog("E", "queryIntentServices failed :: " + e);
            }
        }
        ret.put("billingServiceResolvable", serviceResolvable);

        // Does this APK actually carry the permission Bazaar requires?
        boolean payThroughBazaar = false;
        if (ctx != null) {
            try {
                payThroughBazaar = ctx.checkCallingOrSelfPermission(
                    "com.farsitel.bazaar.permission.PAY_THROUGH_BAZAAR")
                    == PackageManager.PERMISSION_GRANTED;
            } catch (Exception e) {
                appendNativeLog("E", "permission check failed :: " + e);
            }
        }
        ret.put("payThroughBazaarGranted", payThroughBazaar);

        StringBuilder sb = new StringBuilder();
        synchronized (nativeLogs) {
            for (String l : nativeLogs) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(l);
            }
        }
        ret.put("nativeLogs", sb.toString());
    }

    /** Exposes device/Bazaar state plus the native log ring buffer to the JS panel. */
    @PluginMethod
    public void getDiagnostics(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            fillDiagnostics(ret);
        } catch (Throwable t) {
            // Always answer, even on an Error (not Exception) - otherwise the JS
            // promise never settles and the panel hangs.
            appendNativeLog("E", "getDiagnostics failed :: " + t);
            ret.put("error", String.valueOf(t));
            ret.put("pluginRegistered", true);
        }
        call.resolve(ret);
    }
}
