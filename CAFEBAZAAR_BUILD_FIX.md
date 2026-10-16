# CafeBazaar build fix

The release build was failing because `CafeBazaarBillingPlugin.java` imports
`com.android.vending.billing.IInAppBillingService`, while the AIDL source was
not reliably included in the Android release compile inputs/CI checkout.

This package keeps the required AIDL file at:

`android/app/src/main/aidl/com/android/vending/billing/IInAppBillingService.aidl`

and explicitly enables and registers the AIDL source directory in
`android/app/build.gradle`.

The GitHub Actions workflow also verifies that both the AIDL file and the
native billing plugin exist before and after `npx cap sync android`.

## Important

Commit the AIDL file itself to Git:

```bash
git add android/app/src/main/aidl/com/android/vending/billing/IInAppBillingService.aidl
git add android/app/src/main/java/com/kateb/app/plugins/CafeBazaarBillingPlugin.java
git add android/app/build.gradle .github/workflows/android-apk.yml
git commit -m "fix: include CafeBazaar AIDL in release build"
git push
```

The workflow will then build:

`android/app/build/outputs/apk/release/app-release.apk`

and upload `Kateb-Android-Release` as a GitHub Actions artifact.

The billing implementation currently uses the legacy CafeBazaar-compatible
Binder/AIDL interface. For production payment behavior, test the complete
purchase and server-verification flow on a device with CafeBazaar installed.
