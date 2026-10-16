# Android App Links — assetlinks.json

This file must be served at:
```
https://app.kateb.site/.well-known/assetlinks.json
```

## What to do

1. Build and sign your Android APK with your release keystore.
2. Extract the SHA-256 fingerprint of your signing certificate:
   ```bash
   keytool -list -v -keystore your-release-key.jks -alias your-alias
   ```
   Look for the line: `SHA256: XX:XX:XX:...`
3. Replace `REPLACE_WITH_YOUR_SIGNING_CERTIFICATE_SHA256_FINGERPRINT` in
   `public/.well-known/assetlinks.json` with the actual SHA-256 fingerprint
   (remove the colons, keep it as a single hex string, or keep colons —
   Android accepts both formats).
4. Deploy the file so it is accessible at the URL above with
   `Content-Type: application/json` and HTTPS.
5. Reinstall the APK on a device and test the App Link:
   ```
   https://app.kateb.site/payment/result?order_id=TEST
   ```
   It should open the Kateb app directly instead of Chrome.

## Debug builds

For debug builds, the default debug keystore SHA-256 fingerprint is:
```
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
```
You can add the debug fingerprint alongside the release fingerprint in the
`sha256_cert_fingerprints` array for testing.
