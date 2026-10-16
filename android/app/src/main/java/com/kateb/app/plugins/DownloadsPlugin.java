package com.kateb.app.plugins;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.MimeTypeMap;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.Locale;

/**
 * Silent, direct-to-public-Downloads file writer.
 *
 * WHY THIS PLUGIN EXISTS
 * ─────────────────────
 * @capacitor/filesystem cannot do this job. Its Directory.Documents constant
 * resolves to the *public* external Documents collection, which routes
 * writeFile() through the permission gate for READ/WRITE_EXTERNAL_STORAGE.
 * Those permissions are not declared in this app's manifest, so the framework
 * auto-denies them with no dialog and the JS promise rejects
 * ("filePermissionsDenied"). That was the "دانلود PDF ناموفق بود" bug.
 *
 * Declaring WRITE_EXTERNAL_STORAGE would not fix it on API 29+ either: scoped
 * storage makes it a no-op there, and this app targets SDK 36.
 *
 * The supported way to drop a file straight into the public Download folder is
 * MediaStore, and on API 29+ it needs NO permission whatsoever:
 *
 *   API 29+  -> MediaStore.Downloads insert with RELATIVE_PATH. Under scoped
 *               storage an app may always contribute its own entries to the
 *               Downloads collection. No runtime permission, no dialog, and the
 *               write is completely silent.
 *
 *   API 24-28 -> legacy path. Writing to the public Download directory really
 *               does require WRITE_EXTERNAL_STORAGE there, so the manifest
 *               declares it with android:maxSdkVersion="28". The cap matters:
 *               it is only ever merged and requested on API 28 and below, is
 *               ignored on 29+, and so can never be flagged as an unjustified
 *               broad-storage permission by a store review.
 *
 * Nothing here writes to a private folder, so a file saved through this plugin
 * is a real, user-visible download that survives an app uninstall.
 */
@CapacitorPlugin(
    name = "Downloads",
    permissions = {
        @Permission(
            alias = "storage",
            strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }
        )
    }
)
public class DownloadsPlugin extends Plugin {

    private static final String TAG = "KatebDownloads";
    private static final String DEFAULT_MIME = "application/pdf";

    /**
     * Writes a base64 payload straight into the public Download folder.
     *
     * @param fileName display name, e.g. "مکتوب.pdf". The extension decides the
     *                 MIME type when none is passed explicitly.
     * @param data     raw base64 (no "data:...;base64," prefix).
     * @param mimeType optional, defaults to application/pdf.
     * @return { uri, displayName, relativePath, strategy, sdkInt }
     */
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String fileName = call.getString("fileName");
        String data = call.getString("data");
        String mimeType = call.getString("mimeType", "");

        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("fileName is required");
            return;
        }
        if (data == null || data.isEmpty()) {
            call.reject("data is required");
            return;
        }

        // A path separator in the display name would let JS escape the Downloads
        // folder, so reduce whatever arrives to a plain filename.
        final String safeName = sanitizeFileName(fileName);
        final String resolvedMime =
            (mimeType == null || mimeType.isEmpty()) ? guessMimeType(safeName) : mimeType;

        final byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("data is not valid base64", e);
            return;
        }
        if (bytes.length == 0) {
            call.reject("decoded payload is empty");
            return;
        }

        // Plugin calls arrive on a background thread, which is exactly where disk
        // I/O belongs. Capacitor's callbacks are safe to resolve from there.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveViaMediaStore(call, safeName, resolvedMime, bytes);
            } else if (hasLegacyStoragePermission()) {
                saveViaLegacyFile(call, safeName, bytes);
            } else {
                // API 24-28 only: ask, then retry from permissionCallback().
                requestPermissionForAliases(new String[] { "storage" }, call, "permissionCallback");
            }
        } catch (Throwable t) {
            Log.e(TAG, "saveToDownloads failed", t);
            call.reject("Failed to save to Downloads: " + t, t instanceof Exception ? (Exception) t : null);
        }
    }

    /**
     * Opens a previously saved file with whatever app can view it.
     *
     * @param uri      a content:// or file:// uri returned by saveToDownloads.
     * @param mimeType the file's MIME type.
     * @return { opened, uri, error? } — opened=false means no viewer app is
     *         installed, which the JS layer reports so the user can fall back to
     *         the share sheet instead of hitting a dead button.
     */
    @PluginMethod
    public void openFile(PluginCall call) {
        String uriString = call.getString("uri");
        String mimeType = call.getString("mimeType", "");

        if (uriString == null || uriString.trim().isEmpty()) {
            call.reject("uri is required");
            return;
        }
        final Uri uri = Uri.parse(uriString);
        final String resolvedMime =
            (mimeType == null || mimeType.isEmpty()) ? DEFAULT_MIME : mimeType;

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, resolvedMime);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

        // A file:// uri cannot be handed to another app on API 24+, so the legacy
        // path returns a FileProvider content:// uri and the grant is carried by
        // FLAG_GRANT_READ_URI_PERMISSION on the intent below. MediaStore URIs from
        // the API 29+ path are public collection entries and need no grant at all.
        final JSObject ret = new JSObject();
        ret.put("opened", false);
        ret.put("uri", uriString);

        // startActivity must run on the UI thread.
        getActivity().runOnUiThread(() -> {
            // resolveActivity() is the honest capability probe, but on API 30+ it is
            // filtered by package visibility. The manifest declares a <queries>
            // entry for application/pdf viewers so the answer is reliable; the
            // try/catch below is the belt to that braces.
            boolean canOpen;
            try {
                List<ResolveInfo> matches = getContext().getPackageManager()
                    .queryIntentActivities(intent, 0);
                canOpen = matches != null && !matches.isEmpty();
            } catch (Throwable ignored) {
                canOpen = true; // unknown -> just try
            }

            if (!canOpen) {
                Log.w(TAG, "no PDF viewer installed - the saved file cannot be opened in-app");
                ret.put("error", "no_viewer");
                call.resolve(ret);
                return;
            }

            try {
                getActivity().startActivity(intent);
                ret.put("opened", true);
            } catch (Throwable t) {
                Log.w(TAG, "no activity could open the file", t);
                ret.put("opened", false);
                ret.put("error", String.valueOf(t));
            }
            call.resolve(ret);
        });
    }

    // ── API 29+: MediaStore.Downloads, zero permissions ──────────────────
    @SuppressLint("NewApi")
    private void saveViaMediaStore(PluginCall call, String fileName, String mimeType, byte[] bytes)
            throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        // Environment.DIRECTORY_DOWNLOADS == "Download"
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        // Hide the row from other apps until the bytes are fully flushed, then flip
        // it off so the file appears in the Downloads UI as a complete document.
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri item = getContext().getContentResolver().insert(collection, values);
        if (item == null) {
            throw new IllegalStateException("MediaStore refused the insert into Downloads");
        }

        try {
            OutputStream out = getContext().getContentResolver().openOutputStream(item);
            if (out == null) {
                throw new IllegalStateException("could not open an output stream for the new entry");
            }
            try {
                out.write(bytes);
                out.flush();
            } finally {
                out.close();
            }
        } catch (Throwable t) {
            // Never leave a half-written pending row behind.
            try {
                getContext().getContentResolver().delete(item, null, null);
            } catch (Throwable ignored) {
                // Surface the original error, not the cleanup failure.
            }
            throw t;
        }

        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        getContext().getContentResolver().update(item, values, null, null);

        // Read the display name back: MediaStore de-duplicates by appending " (1)"
        // when the user already has a file with that name, and the confirmation
        // message must show the name that actually landed on disk.
        String finalName = queryDisplayName(item, fileName);

        JSObject ret = new JSObject();
        ret.put("uri", item.toString());
        ret.put("displayName", finalName);
        ret.put("relativePath", Environment.DIRECTORY_DOWNLOADS + File.separator + finalName);
        ret.put("strategy", "mediastore");
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    private String queryDisplayName(Uri item, String fallback) {
        Cursor c = null;
        try {
            c = getContext().getContentResolver()
                .query(item, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst()) {
                String name = c.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Throwable t) {
            Log.w(TAG, "reading back the display name failed", t);
        } finally {
            if (c != null) {
                try {
                    c.close();
                } catch (Throwable ignored) {
                    // ignore
                }
            }
        }
        return fallback;
    }

    // ── API 24-28: legacy public-directory write ─────────────────────────
    private void saveViaLegacyFile(PluginCall call, String fileName, byte[] bytes) throws Exception {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null || (!dir.exists() && !dir.mkdirs())) {
            throw new IllegalStateException("the public Download directory is unavailable");
        }

        // Never silently overwrite an existing download.
        File target = new File(dir, fileName);
        if (target.exists()) {
            String base = fileName;
            String ext = "";
            int dot = fileName.lastIndexOf('.');
            if (dot > 0) {
                base = fileName.substring(0, dot);
                ext = fileName.substring(dot);
            }
            for (int i = 1; i < 1000 && target.exists(); i++) {
                target = new File(dir, String.format(Locale.US, "%s (%d)%s", base, i, ext));
            }
        }

        FileOutputStream fos = new FileOutputStream(target);
        try {
            fos.write(bytes);
            fos.flush();
        } finally {
            fos.close();
        }

        // Make the new file visible to the Downloads app / file managers straight
        // away instead of waiting for the next scheduled media scan.
        try {
            MediaScannerConnection.scanFile(
                getContext(),
                new String[] { target.getAbsolutePath() },
                null,
                null
            );
        } catch (Throwable ignored) {
            // Non-fatal: the bytes are on disk regardless.
        }

        // A file:// uri cannot be handed to another app on API 24+, so expose it
        // through the app's FileProvider. res/xml/file_paths.xml already whitelists
        // <external-path path=".">, which covers the Download directory.
        Uri contentUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            target
        );

        JSObject ret = new JSObject();
        ret.put("uri", contentUri.toString());
        ret.put("displayName", target.getName());
        ret.put("relativePath", Environment.DIRECTORY_DOWNLOADS + File.separator + target.getName());
        ret.put("strategy", "legacy");
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    // ── permission plumbing (API 24-28 only) ─────────────────────────────
    private boolean hasLegacyStoragePermission() {
        return ContextCompat.checkSelfPermission(
            getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE
        ) == PackageManager.PERMISSION_GRANTED;
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (!hasLegacyStoragePermission()) {
            call.reject("storage_permission_denied");
            return;
        }
        String data = call.getString("data");
        if (data == null) {
            call.reject("data is required");
            return;
        }
        try {
            saveViaLegacyFile(
                call,
                sanitizeFileName(call.getString("fileName")),
                Base64.decode(data, Base64.DEFAULT)
            );
        } catch (Throwable t) {
            Log.e(TAG, "legacy save failed after the permission was granted", t);
            call.reject("Failed to save to Downloads: " + t, t instanceof Exception ? (Exception) t : null);
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────
    /**
     * Reduces an arbitrary JS-supplied name to a safe single path segment and
     * guarantees an extension so the MIME type — and therefore the viewer
     * openFile() picks — is correct.
     */
    private String sanitizeFileName(String raw) {
        String name = raw == null ? "" : raw.trim();
        // Drop any directory component: keep only the last segment.
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) name = name.substring(slash + 1);
        // Characters illegal in Android filenames (and in FAT/exFAT volumes).
        name = name.replaceAll("[\\\\/:*?\"<>|\\r\\n\\t\\u0000]", "_").trim();
        if (name.isEmpty() || name.equals(".")) name = "download";
        if (!name.contains(".")) name = name + ".pdf";
        return name;
    }

    /** MIME type for a filename, used when JS does not pass one explicitly. */
    private String guessMimeType(String fileName) {
        String ext = null;
        int dot = fileName.lastIndexOf('.');
        if (dot > 0 && dot < fileName.length() - 1) ext = fileName.substring(dot + 1);
        if (ext != null) {
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase(Locale.US));
            if (mime != null) return mime;
        }
        return DEFAULT_MIME;
    }
}
