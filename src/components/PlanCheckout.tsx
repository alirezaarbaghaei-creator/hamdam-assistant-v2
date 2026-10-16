import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CreditCard,
  Loader2,
  AlertCircle,
  Shield,
  Zap,
  Check,
  Tag,
} from 'lucide-react';
import { usePlanStore } from '@/store/planStore';
import { PLANS, formatToman, type PlanId } from '@/data/plans';
import { planPurchaseRequestApi, bazaarPurchaseVerifyApi } from '@/lib/api';
import { openExternalUrl } from '@/lib/externalUrl';
import { isNativeApp } from '@/lib/capacitor';
import { diag } from '@/services/diagnostics';
import { getCafeBazaarProductId, type BillingMonths } from '@/config/cafeBazaarProducts';
import {
  purchaseSubscription,
  isCafeBazaarAvailable,
  restorePurchases,
  type BazaarPurchaseResult,
} from '@/services/cafeBazaarBilling';

interface PlanCheckoutProps {
  planId: PlanId;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type CheckoutState = 'confirm' | 'purchasing' | 'verifying' | 'success' | 'failed';

interface BillingOption {
  months: number;
  label: string;
  discount: number;
  badge?: string;
}

const BILLING_OPTIONS: BillingOption[] = [
  { months: 1, label: 'یک ماهه', discount: 0 },
  { months: 3, label: 'سه ماهه', discount: 0.10, badge: '۱۰٪ تخفیف' },
  { months: 6, label: 'شش ماهه', discount: 0.20, badge: '۲۰٪ تخفیف' },
];

export function PlanCheckout({ planId, userId, onClose, onSuccess }: PlanCheckoutProps) {
  const plan = PLANS.find((p) => p.id === planId)!;
  const [state, setState] = useState<CheckoutState>('confirm');
  const [error, setError] = useState('');
  const [selectedMonths, setSelectedMonths] = useState(1);
  const { loadPlan } = usePlanStore();

  const isAndroid = isNativeApp();
  const selectedOption = BILLING_OPTIONS.find((o) => o.months === selectedMonths)!;
  const baseTotal = plan.price * selectedMonths;
  const discountedTotal = Math.round(baseTotal * (1 - selectedOption.discount));
  const savings = baseTotal - discountedTotal;

  const isBusy = state === 'purchasing' || state === 'verifying';

  const handleBazaarPayment = async () => {
    setState('purchasing');
    setError('');
    diag.info('checkout', `bazaar payment start plan=${planId} months=${selectedMonths}`);

    try {
      const available = await isCafeBazaarAvailable();
      if (!available) {
        throw new Error('کافه‌بازار روی این دستگاه نصب یا در دسترس نیست');
      }

      const productId = getCafeBazaarProductId(planId, selectedMonths as BillingMonths);
      if (!productId) {
        throw new Error('محصول یافت نشد');
      }
      diag.info('checkout', `resolved productId=${productId}`);

      // FIX (pay): Bazaar answers ITEM_ALREADY_OWNED for a subscription the user
      // already paid for but that the app never activated (server was down, app was
      // killed mid-purchase, ...). Previously this was a dead end: the retry showed
      // "قبلاً خریداری شده است" forever and the paid subscription stayed inactive.
      // Recover by re-querying the owned purchases and verifying them server-side.
      let purchaseResult: BazaarPurchaseResult;
      try {
        purchaseResult = await purchaseSubscription(productId);
      } catch (purchaseErr) {
        const raw = purchaseErr instanceof Error ? purchaseErr.message : String(purchaseErr);
        if (!raw.includes('قبلاً خریداری شده')) throw purchaseErr;

        setState('verifying');
        const owned = await restorePurchases();
        const match = owned.find((p) => p.productId === productId) ?? owned[0];
        if (!match?.purchaseToken) {
          throw new Error('این اشتراک قبلاً خریداری شده است، اما خرید فعالی برای بازیابی پیدا نشد.');
        }
        const recovered = await bazaarPurchaseVerifyApi(match.productId, match.purchaseToken);
        if (!recovered.success) {
          throw new Error('این اشتراک قبلاً خریداری شده است، اما فعال‌سازی آن ناموفق بود.');
        }
        await loadPlan(userId);
        setState('success');
        setTimeout(() => onSuccess(), 1500);
        return;
      }
      if (!purchaseResult.purchaseToken) {
        throw new Error('Purchase Token دریافت نشد');
      }

      setState('verifying');

      const verifyResult = await bazaarPurchaseVerifyApi(
        purchaseResult.productId,
        purchaseResult.purchaseToken,
      );

      if (!verifyResult.success) {
        throw new Error(verifyResult.message || 'تأیید پرداخت ناموفق بود');
      }

      await loadPlan(userId);
      setState('success');
      setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در پرداخت';
      diag.error('checkout', 'bazaar payment FAILED', msg);
      if (msg.includes('لغو')) {
        setError('خرید لغو شد.');
      } else {
        setError(msg);
      }
      setState('failed');
    }
  };

  const handleZarinpalPayment = async () => {
    setState('purchasing');
    setError('');

    try {
      const result = await planPurchaseRequestApi(planId, selectedMonths);
      if (!result || !result.redirect_url) {
        throw new Error('خطا در ایجاد درخواست پرداخت');
      }
      setState('verifying');
      await openExternalUrl(result.redirect_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ارتباط با سرور');
      setState('failed');
    }
  };

  const handlePayment = isAndroid ? handleBazaarPayment : handleZarinpalPayment;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={isBusy ? undefined : onClose}
      >
        <motion.div
          initial={{ scale: 0.92, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 20 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-slate-900">تکمیل خرید طرح</h3>
            {!isBusy && (
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {state === 'confirm' && (
            <>
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 p-5 mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${plan.gradient} text-white`}>
                    <Zap className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-900">طرح {plan.name}</p>
                    <p className="text-xs text-slate-500">
                      {plan.aiAssistantLimit.toLocaleString('fa-IR')} دستیار + {plan.templateLimit.toLocaleString('fa-IR')} قالب در ماه
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-600 mb-2">انتخاب دوره اشتراک</p>
                <div className="grid grid-cols-3 gap-2">
                  {BILLING_OPTIONS.map((opt) => {
                    const total = Math.round(plan.price * opt.months * (1 - opt.discount));
                    const isSelected = selectedMonths === opt.months;
                    return (
                      <button
                        key={opt.months}
                        onClick={() => setSelectedMonths(opt.months)}
                        className={`relative rounded-xl border-2 p-3 text-center transition-all ${
                          isSelected
                            ? 'border-cyan-500 bg-cyan-50 shadow-md shadow-cyan-500/10'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {opt.badge && (
                          <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 text-white px-2 py-0.5 text-[9px] font-bold whitespace-nowrap shadow-sm">
                            {opt.badge}
                          </span>
                        )}
                        <p className={`text-sm font-bold ${isSelected ? 'text-cyan-700' : 'text-slate-700'}`}>
                          {opt.label}
                        </p>
                        <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-cyan-500' : 'text-slate-400'}`}>
                          {formatToman(total)} ت
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 p-4 mb-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">مبلغ ماهانه</span>
                  <span className="font-medium text-slate-700">{formatToman(plan.price)} تومان</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">دوره</span>
                  <span className="font-medium text-slate-700">
                    {selectedOption.label} ({selectedMonths * 30} روز)
                  </span>
                </div>
                {savings > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">تخفیف</span>
                    <span className="font-medium text-emerald-600 flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {formatToman(savings)} تومان
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm border-t border-slate-200 pt-2">
                  <span className="font-semibold text-slate-700">مبلغ قابل پرداخت</span>
                  <span className="font-bold text-slate-900">{formatToman(discountedTotal)} تومان</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">تاریخ انقضا</span>
                  <span className="font-medium text-slate-700">
                    {selectedMonths * 30} روز پس از خرید
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 mb-5">
                <Shield className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700">
                  {isAndroid
                    ? 'پرداخت امن از طریق کافه‌بازار انجام می‌شود.'
                    : 'پرداخت از طریق درگاه امن زرین‌پال انجام می‌شود.'}
                </p>
              </div>

              <button
                onClick={handlePayment}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3.5 text-sm font-bold hover:shadow-lg shadow-cyan-500/30 transition-all"
              >
                <CreditCard className="h-5 w-5" />
                پرداخت {formatToman(discountedTotal)} تومان
              </button>
            </>
          )}

          {state === 'purchasing' && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-cyan-500 mx-auto mb-5" />
              <h4 className="text-base font-bold text-slate-900 mb-1">
                {isAndroid ? 'در حال اتصال به کافه‌بازار...' : 'در حال انتقال به درگاه پرداخت'}
              </h4>
              <p className="text-sm text-slate-500">لطفاً صبر کنید...</p>
            </div>
          )}

          {state === 'verifying' && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-cyan-500 mx-auto mb-5" />
              <h4 className="text-base font-bold text-slate-900 mb-1">در حال تأیید پرداخت...</h4>
              <p className="text-sm text-slate-500">لطفاً صبر کنید...</p>
            </div>
          )}

          {state === 'success' && (
            <div className="text-center py-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 mb-5">
                <Check className="h-8 w-8" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">پرداخت موفق بود</h4>
              <p className="text-sm text-slate-500">اشتراک شما فعال شد.</p>
            </div>
          )}

          {state === 'failed' && (
            <div className="text-center py-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500 mb-5">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">پرداخت ناموفق بود</h4>
              <p className="text-sm text-slate-500 mb-5">{error || 'لطفاً دوباره تلاش کنید'}</p>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-slate-200 text-slate-700 py-3 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  بستن
                </button>
                <button
                  onClick={handlePayment}
                  className="flex-1 rounded-xl bg-cyan-600 text-white py-3 text-sm font-semibold hover:bg-cyan-700 transition-colors"
                >
                  تلاش مجدد
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
