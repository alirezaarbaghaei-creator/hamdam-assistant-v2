import { ensureBazaarPlugin, getBazaarPluginSync } from './bazaarPlugin';
import { diag } from './diagnostics';
import type { BazaarProductId } from '@/config/cafeBazaarProducts';

export interface BazaarPurchaseResult {
  productId: string;
  purchaseToken: string;
  orderId: string;
  purchaseTime: number;
  purchaseState: number;
}

export interface BazaarPurchasesResult {
  purchases: BazaarPurchaseResult[];
}

/**
 * The native billing plugin talks to Bazaar over an Android bound service. If that
 * binding never completes the native promise can stay pending forever, which left
 * the checkout spinning on "در حال اتصال به کافه‌بازار..." with no error and no way
 * out. These guards turn a silent hang into a readable message. The purchase
 * timeout is deliberately generous because the Bazaar dialog legitimately waits for
 * the user to pay.
 */
const CONNECT_TIMEOUT_MS = 15_000;
const PURCHASE_TIMEOUT_MS = 180_000;

// Non-generic on purpose: the plugin wrapper is untyped (`any`), so a generic
// parameter was inferred as `unknown` and every property access failed with TS2339.
function withTimeout(promise: Promise<any>, ms: number, message: string): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Registers the plugin if needed and returns the thenable-proof wrapper.
 *
 * NOTE: this returns a plain object (see bazaarPlugin.ts), never the raw Capacitor
 * proxy, so it is safe to return from this async function. An earlier version
 * returned the raw proxy here and every call failed with
 * "CafeBazaarBilling.then() is not implemented on android".
 */
async function requirePlugin(): Promise<ReturnType<typeof getBazaarPluginSync>> {
  const registered = await ensureBazaarPlugin();
  const plugin = getBazaarPluginSync();
  if (!registered || !plugin) {
    diag.error('billing', `native plugin unavailable (registered=${registered})`);
    throw new Error('پلاگین پرداخت کافه‌بازار در دسترس نیست');
  }
  return plugin;
}

export async function isCafeBazaarAvailable(): Promise<boolean> {
  const registered = await ensureBazaarPlugin();
  const plugin = getBazaarPluginSync();
  if (!registered || !plugin) {
    diag.error('billing', `isAvailable: native plugin unavailable (registered=${registered})`);
    return false;
  }

  diag.info('billing', 'isAvailable: calling native isAvailable()');
  try {
    const result = await withTimeout(
      plugin.isAvailable(),
      CONNECT_TIMEOUT_MS,
      'اتصال به سرویس کافه‌بازار برقرار نشد',
    );
    diag.info('billing', 'isAvailable result', result);
    return result?.available === true;
  } catch (err) {
    // Previously this was swallowed, which is why a failed binding surfaced as the
    // misleading "کافه‌بازار نصب یا در دسترس نیست". Report the real reason instead.
    diag.error('billing', 'isAvailable FAILED', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function purchaseSubscription(
  productId: BazaarProductId,
): Promise<BazaarPurchaseResult> {
  const plugin = await requirePlugin();
  if (!plugin) throw new Error('پلاگین پرداخت کافه‌بازار در دسترس نیست');

  diag.info('billing', 'launchPurchase', { productId });
  const result = await withTimeout(
    plugin.launchPurchase({ productId }),
    PURCHASE_TIMEOUT_MS,
    'پاسخی از کافه‌بازار دریافت نشد. اگر مبلغ کسر شده، دکمه «بازیابی خرید» را بزنید.',
  ).catch((err) => {
    diag.error('billing', 'launchPurchase FAILED', err);
    throw err;
  });
  diag.info('billing', 'launchPurchase result', result);

  if (!result?.purchaseToken) {
    throw new Error('Purchase token دریافت نشد');
  }
  return {
    productId: result.productId,
    purchaseToken: result.purchaseToken,
    orderId: result.orderId ?? '',
    purchaseTime: result.purchaseTime ?? 0,
    purchaseState: result.purchaseState ?? 0,
  };
}

export async function restorePurchases(): Promise<BazaarPurchaseResult[]> {
  const plugin = await requirePlugin();
  if (!plugin) throw new Error('پلاگین پرداخت کافه‌بازار در دسترس نیست');

  diag.info('billing', 'queryPurchases: calling native');
  const result: BazaarPurchasesResult = await withTimeout(
    plugin.queryPurchases(),
    CONNECT_TIMEOUT_MS,
    'دریافت خریدهای قبلی از کافه‌بازار ناموفق بود',
  ).catch((err) => {
    diag.error('billing', 'queryPurchases FAILED', err);
    throw err;
  });
  diag.info('billing', `queryPurchases returned ${result?.purchases?.length ?? 0} item(s)`);
  return result?.purchases ?? [];
}

export async function consumeBazaarPurchase(purchaseToken: string): Promise<void> {
  const plugin = getBazaarPluginSync();
  if (!plugin) return;
  await plugin.consumePurchase({ purchaseToken });
}
