/**
 * Native / web file bridge.
 *
 * ── ANDROID DOWNLOAD FIX ─────────────────────────────────────────────────────
 * Every PDF export used to be written to `Directory.Documents`. On Android that
 * constant is NOT the app's private Documents folder — it is the *public*
 * Documents collection on external storage. `FilesystemPlugin.writeFile()`
 * resolves it, sees `uri.inExternalStorage == true` and routes through
 * `runWithPermission()`, which calls `requestAllPermissions()` for
 * READ/WRITE_EXTERNAL_STORAGE.
 *
 * Those permissions are not declared in AndroidManifest.xml, so the system never
 * shows a dialog and immediately reports DENIED. That lands in
 * `permissionCallback()` → `sendError(filePermissionsDenied)`, the JS promise
 * rejects, and the Preview page showed "دانلود PDF ناموفق بود" on every tap.
 *
 * Declaring WRITE_EXTERNAL_STORAGE would not fix it either: it has had no effect
 * since scoped storage arrived in API 29, and this app targets SDK 36. It would
 * also make Cafe Bazaar's review reject the build for an unjustified permission.
 *
 * `Directory.Cache` (`context.cacheDir`) and `Directory.Data`
 * (`context.filesDir`) are internal storage, so `inExternalStorage` is false, no
 * permission is ever requested, and the write always succeeds. The file is then
 * handed to @capacitor/share, which exposes it through the app's FileProvider —
 * already declared in AndroidManifest.xml, with <cache-path> and <files-path>
 * whitelisted in res/xml/file_paths.xml — so the user can save it to Downloads /
 * Drive, or send it anywhere, straight from the share sheet.
 */

export function isNativeApp(): boolean {
  return (
    typeof (window as any).Capacitor !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.()
  );
}

interface SaveResult {
  shared: boolean;
  downloaded: boolean;
  /** `file://` uri of the saved file on native, undefined on web. */
  uri?: string;
}

/** Triggers a plain browser download for a blob. */
function triggerWebDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Keep the object URL alive a little longer than the click: some WebViews
  // resolve the download asynchronously and a too-eager revoke yields a 0-byte file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Writes a blob into app-private storage — Cache first, Data as a fallback —
 * and returns a `file://` uri that @capacitor/share can hand to other apps.
 *
 * Both targets live in internal storage (`context.cacheDir` / `context.filesDir`),
 * so the Filesystem plugin never asks for a storage permission here.
 */
async function writeBlobToPrivateStorage(blob: Blob, fileName: string): Promise<string> {
  const { Filesystem, Directory } = await import(/* @vite-ignore */ '@capacitor/filesystem');
  const base64 = await blobToBase64(blob);

  // No explicit type here on purpose: `Directory` is a runtime value pulled in by
  // the dynamic import, so annotating with it would fail to compile.
  const attempts = [
    { directory: Directory.Cache, label: 'cache' },
    { directory: Directory.Data, label: 'data' },
  ];

  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: attempt.directory,
        recursive: true,
      });
      return result.uri;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${attempt.label}: ${message}`);
      console.warn(`[files] write to ${attempt.label} failed`, err);
    }
  }

  throw new Error(`Failed to save file (${failures.join(' | ')})`);
}

/**
 * Saves a blob WITHOUT opening the share sheet.
 * Web triggers a browser download; Android writes it to app-private storage.
 */
export async function saveBlob(
  blob: Blob,
  fileName: string,
): Promise<{ downloaded: boolean; uri?: string }> {
  if (!isNativeApp()) {
    triggerWebDownload(blob, fileName);
    return { downloaded: true };
  }

  const uri = await writeBlobToPrivateStorage(blob, fileName);
  return { downloaded: true, uri };
}

/**
 * Saves a blob and opens the native share sheet so the user can store or send
 * the PDF (Files, Drive, Telegram, …). Web falls back to a browser download.
 */
export async function saveAndShareBlob(
  blob: Blob,
  fileName: string,
): Promise<SaveResult> {
  if (!isNativeApp()) {
    triggerWebDownload(blob, fileName);
    return { shared: false, downloaded: true };
  }

  const fileUri = await writeBlobToPrivateStorage(blob, fileName);
  const { Share } = await import(/* @vite-ignore */ '@capacitor/share');

  try {
    await Share.share({
      title: fileName.replace(/\.[^.]+$/, ''),
      text: fileName,
      url: fileUri,
      dialogTitle: 'اشتراک‌گذاری فایل',
    });
    return { shared: true, downloaded: true, uri: fileUri };
  } catch (err) {
    // The user dismissed the sheet, or no app could handle a PDF. The file is
    // already on disk either way, so the export still succeeded.
    console.warn('[files] share sheet dismissed or unavailable', err);
    return { shared: false, downloaded: true, uri: fileUri };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface SilentDownloadResult {
  /** True when the bytes really landed in the public Download folder. */
  downloaded: boolean;
  /** True when the file was also handed to a PDF viewer. */
  opened: boolean;
  /** Name that actually landed on disk. */
  displayName: string;
  /** 'mediastore' (API 29+) or 'legacy' (API 24-28). */
  strategy: string;
  uri?: string;
  /** Set when the write succeeded but no installed app can display the file. */
  noViewer?: boolean;
  /**
   * Set when the native plugin was unavailable or refused the write. The caller
   * should fall back to the share sheet, which always works.
   */
  fallbackReason?: string;
}

/**
 * Saves a blob straight into the public Download folder and opens it.
 *
 * ── WHY A NATIVE PLUGIN ──────────────────────────────────────────────────
 * This is the one thing @capacitor/filesystem cannot do. Its
 * `Directory.Documents` constant resolves to the *public* external Documents
 * collection, which makes writeFile() request READ/WRITE_EXTERNAL_STORAGE.
 * Those permissions are not declared in this app's manifest, so the framework
 * auto-denies them without a dialog and the promise rejects — the original
 * "دانلود PDF ناموفق بود" bug.
 *
 * Declaring WRITE_EXTERNAL_STORAGE would not fix it either: it has been a no-op
 * since scoped storage (API 29), and this app targets SDK 36.
 *
 * `DownloadsPlugin` writes through MediaStore.Downloads instead, which under
 * scoped storage needs NO permission at all on API 29+ — the file appears in
 * the real Download folder with no dialog, and is then opened with ACTION_VIEW.
 *
 * On web there is no MediaStore, so this is a plain browser download, which
 * already lands in the user's download directory.
 */
export async function saveBlobToDownloads(
  blob: Blob,
  fileName: string,
  mimeType = 'application/pdf',
): Promise<SilentDownloadResult> {
  // Web: the browser download manager is already the "Download folder".
  if (!isNativeApp()) {
    triggerWebDownload(blob, fileName);
    return {
      downloaded: true,
      opened: false,
      displayName: fileName,
      strategy: 'web',
    };
  }

  const {
    ensureDownloadsPlugin,
    getDownloadsPluginSync,
  } = await import('@/services/downloadsPlugin');

  const ready = await ensureDownloadsPlugin();
  const plugin = getDownloadsPluginSync();

  if (!ready || !plugin) {
    return {
      downloaded: false,
      opened: false,
      displayName: fileName,
      strategy: 'none',
      fallbackReason: 'plugin-unavailable',
    };
  }

  let saved;
  try {
    const base64 = await blobToBase64(blob);
    saved = await plugin.saveToDownloads({ fileName, data: base64, mimeType });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[downloads] native save failed', err);
    return {
      downloaded: false,
      opened: false,
      displayName: fileName,
      strategy: 'none',
      fallbackReason: message,
    };
  }

  const result: SilentDownloadResult = {
    downloaded: true,
    opened: false,
    displayName: saved?.displayName ?? fileName,
    strategy: saved?.strategy ?? 'unknown',
    uri: saved?.uri,
  };

  if (!saved?.uri) return result;

  // The file is saved; opening it is a nice-to-have. A missing PDF viewer must
  // not turn a successful download into an error message.
  try {
    const openResult = await plugin.openFile({ uri: saved.uri, mimeType });
    result.opened = !!openResult?.opened;
    if (!result.opened && openResult?.error === 'no_viewer') {
      result.noViewer = true;
    }
  } catch (err) {
    console.warn('[downloads] open after save failed', err);
  }

  return result;
}
