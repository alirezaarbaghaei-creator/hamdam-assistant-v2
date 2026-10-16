package com.kateb.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.kateb.app.plugins.CafeBazaarBillingPlugin;
import com.kateb.app.plugins.DownloadsPlugin;
import com.kateb.app.plugins.OtpAutofillPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // FIX (pay): registerPlugin() only appends to BridgeActivity.bridgeBuilder,
        // and that builder is consumed inside super.onCreate() ->
        // load() -> bridgeBuilder.create(). Registering AFTER super.onCreate()
        // therefore never reaches the live Bridge, and the web layer gets
        // "CafeBazaarBilling plugin is not implemented on android" -> the
        // checkout falls back to "کافه‌بازار روی این دستگاه نصب یا در دسترس نیست".
        // The same rule applies to DownloadsPlugin and SmsAutofillPlugin: they must
        // be registered before super.onCreate() or the web layer gets
        // "X plugin is not implemented on android" back — the PDF export falls back
        // to the share sheet, and OTP autofill silently never fills anything in.
        registerPlugin(CafeBazaarBillingPlugin.class);
        registerPlugin(DownloadsPlugin.class);
        registerPlugin(OtpAutofillPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
