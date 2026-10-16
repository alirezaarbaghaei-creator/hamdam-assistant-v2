import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Loader2, Receipt, Clock, Home } from 'lucide-react';
import * as api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { usePlanStore } from '@/store/planStore';

type VerifyState = 'loading' | 'success' | 'failed' | 'pending';

interface PaymentCallbackProps {
  onDone?: (orderId: string) => void;
}

export function PaymentCallback({ onDone }: PaymentCallbackProps) {
  const [state, setState] = useState<VerifyState>('loading');
  const [refId, setRefId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [addedCoins, setAddedCoins] = useState<number | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [orderType, setOrderType] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const loadPlan = usePlanStore((s) => s.loadPlan);

  const refreshSession = async () => {
    try {
      const freshUser = await api.getMe();
      if (freshUser) setUser(freshUser);
    } catch {
      // ignore — session refresh is best-effort
    }
  };

  const handleReturnToApp = () => {
    const isCapacitor = typeof (window as any).Capacitor !== 'undefined' &&
      (window as any).Capacitor?.isNativePlatform?.();

    if (isCapacitor && onDone) {
      onDone(orderId);
      return;
    }

    // External browser: launch the app via custom scheme
    const appUrl = orderId
      ? `kateb://payment/result?order_id=${orderId}`
      : 'kateb://payment/result';
    window.location.href = appUrl;

    // Fallback if app not installed — redirect to website after delay
    setTimeout(() => {
      window.location.href = 'https://app.kateb.site/';
    }, 2000);
  };

  // Auto-return countdown for success state
  useEffect(() => {
    if (state !== 'success') return;
    if (countdown <= 0) {
      handleReturnToApp();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [state, countdown]);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const status = params.get('Status');
      const authority = params.get('Authority');

      if (!status || !authority) {
        setState('failed');
        return;
      }

      if (status !== 'OK') {
        setState('failed');
        return;
      }

      try {
        const result = await api.paymentCallbackApi(authority, status);
        if (result?.success) {
          setState('success');
          setRefId(String(result.ref_id ?? ''));
          setOrderId(result.order_id ?? '');
          setAddedCoins(result.added ?? null);
          setPlanId((result as any).plan_id ?? null);
          setAlreadyVerified(!!result.already_paid);
          setOrderType((result as any).type ?? null);

          // Refresh user session + plan data so no re-login needed
          if (user?.id) {
            await refreshSession();
            await loadPlan(user.id);
          }
        } else if (result?.status === 'pending') {
          setState('pending');
          setOrderId(result.order_id ?? '');
        } else {
          setState('failed');
          setOrderId(result?.order_id ?? '');
        }
      } catch {
        setState('failed');
      }

      window.history.replaceState({}, '', window.location.pathname);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="glass rounded-3xl p-8 shadow-glass-lg max-w-sm w-full text-center"
      >
        {state === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-indigo-500 mx-auto mb-5" />
            <h1 className="text-lg font-bold text-slate-900 mb-1">در حال تأیید پرداخت...</h1>
            <p className="text-sm text-slate-500">لطفاً صبر کنید</p>
          </>
        )}

        {state === 'pending' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 mb-5">
              <Clock className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">تأیید پرداخت در حال انجام است</h1>
            <p className="text-sm text-slate-500 mb-5">
              لطفاً چند لحظه دیگر دوباره تلاش کنید. در صورت کسر وجه، طی ۲۴ ساعت بازگردانده می‌شود.
            </p>
            <button
              onClick={handleReturnToApp}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white py-3.5 text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              <Home className="h-4 w-4" />
              بازگشت به برنامه
            </button>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 mb-5">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">پرداخت با موفقیت انجام شد</h1>
            {planId && (
              <p className="text-sm text-slate-600 mb-1">
                طرح شما با موفقیت فعال شد
              </p>
            )}
            {addedCoins !== null && (
              <p className="text-sm text-slate-600 mb-1">
                {addedCoins.toLocaleString('fa-IR')} اعتبار به حساب شما اضافه شد
              </p>
            )}
            {alreadyVerified && (
              <p className="text-xs text-amber-600 mb-2">
                این پرداخت قبلاً تأیید شده است.
              </p>
            )}
            {refId && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mb-3" dir="ltr">
                <Receipt className="h-3.5 w-3.5" />
                کد پیگیری: {refId}
              </div>
            )}
            <p className="text-xs text-slate-400 mb-4">
              بازگشت خودکار به برنامه تا {countdown.toLocaleString('fa-IR')} ثانیه...
            </p>
            <button
              onClick={handleReturnToApp}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white py-3.5 text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              <Home className="h-4 w-4" />
              بازگشت به برنامه
            </button>
          </>
        )}

        {state === 'failed' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500 mb-5">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">پرداخت لغو شد یا ناموفق بود</h1>
            <p className="text-sm text-slate-500 mb-5">
              هیچ مبلغی از حساب شما کسر یا به حساب شما اعتبار اضافه نشد.
            </p>
            <button
              onClick={handleReturnToApp}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white py-3.5 text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              <Home className="h-4 w-4" />
              بازگشت به برنامه
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
