import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  X,
  Sparkles,
  Crown,
  Zap,
  Gift,
  User,
  CreditCard,
  CheckCircle2,
  Clock,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { usePlanStore } from '@/store/planStore';
import { PLANS, formatToman, type PlanId, type PricingPlan } from '@/data/plans';
import { PlanCheckout } from '@/components/PlanCheckout';
import { isNativeApp } from '@/lib/capacitor';
import { restorePurchases } from '@/services/cafeBazaarBilling';
import { bazaarPurchaseVerifyApi } from '@/lib/api';

const planIcons: Record<PlanId, typeof Gift> = {
  free: Gift,
  basic: Zap,
  pro: Crown,
};

export function PricingPage() {
  const setPage = useAppStore((s) => s.setPage);
  const user = useAuthStore((s) => s.user);
  const planType = usePlanStore((s) => s.planType);
  const expiresAt = usePlanStore((s) => s.expiresAt);
  const aiAssistantUsage = usePlanStore((s) => s.aiAssistantUsage);
  const templateUsage = usePlanStore((s) => s.templateUsage);
  const getAiAssistantLimit = usePlanStore((s) => s.getAiAssistantLimit);
  const getTemplateLimit = usePlanStore((s) => s.getTemplateLimit);
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState('');

  const aiLimit = getAiAssistantLimit();
  const templateLimit = getTemplateLimit();
  const isAndroid = isNativeApp();

  const handleRestore = async () => {
    setRestoring(true);
    setRestoreMsg('');
    try {
      const purchases = await restorePurchases();
      if (purchases.length === 0) {
        setRestoreMsg('خرید قبلی یافت نشد.');
        setRestoring(false);
        return;
      }
      let lastResult: { success: boolean; already_processed?: boolean } | null = null;
      for (const p of purchases) {
        lastResult = await bazaarPurchaseVerifyApi(p.productId, p.purchaseToken);
      }
      if (lastResult?.success) {
        await usePlanStore.getState().loadPlan(user?.id ?? '');
        setRestoreMsg('اشتراک شما بازیابی شد.');
      } else {
        setRestoreMsg('بازیابی خرید ناموفق بود.');
      }
    } catch {
      setRestoreMsg('خطا در بازیابی خرید.');
    }
    setRestoring(false);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPage('dashboard')}
          className="flex h-10 w-10 items-center justify-center rounded-xl glass text-slate-600 hover:text-slate-900 shadow-glass"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900">طرح‌ها و قیمت‌ها</h2>
          <p className="text-sm text-slate-500">طرح مناسب خود را انتخاب کنید</p>
        </div>
      </div>

      {/* Current plan status */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-5 shadow-glass"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500">طرح فعلی شما</p>
              <p className="text-lg font-bold text-slate-900">
                {PLANS.find((p) => p.id === planType)?.name ?? 'آزمایشی'}
              </p>
              {expiresAt ? (
                <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" />
                  انقضا: {new Date(expiresAt).toLocaleDateString('fa-IR')}
                </p>
              ) : planType === 'free' && (
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">بدون انقضا</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-cyan-50 px-4 py-2">
              <Zap className="h-4 w-4 text-cyan-500" />
              <span className="text-sm font-bold text-cyan-700">
                {(aiLimit - aiAssistantUsage).toLocaleString('fa-IR')} / {aiLimit.toLocaleString('fa-IR')} هوش
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2">
              <Gift className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-bold text-indigo-700">
                {(templateLimit - templateUsage).toLocaleString('fa-IR')} / {templateLimit.toLocaleString('fa-IR')} ثبت هوشمند
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Restore purchase (Android only) */}
      {isAndroid && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 shadow-glass disabled:opacity-50 transition-all"
          >
            {restoring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            بازیابی خریدهای کافه‌بازار
          </button>
          {restoreMsg && (
            <span className="text-xs text-slate-500">{restoreMsg}</span>
          )}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PLANS.map((plan, i) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            index={i}
            isCurrent={planType === plan.id}
            onSelect={() => {
              if (plan.id === 'free') return;
              setCheckoutPlan(plan.id);
            }}
          />
        ))}
      </div>

      {/* Feature comparison table */}
      <FeatureComparison currentPlan={planType} />

      {/* Checkout modal */}
      {checkoutPlan && (
        <PlanCheckout
          planId={checkoutPlan}
          userId={user?.id ?? ''}
          onClose={() => setCheckoutPlan(null)}
          onSuccess={() => {
            setCheckoutPlan(null);
            setPage('dashboard');
          }}
        />
      )}
    </div>
  );
}

function PlanCard({
  plan,
  index,
  isCurrent,
  onSelect,
}: {
  plan: PricingPlan;
  index: number;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const Icon = planIcons[plan.id];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={`glass rounded-3xl p-6 shadow-glass hover:shadow-glass-lg transition-all relative flex flex-col ${
        plan.popular ? 'ring-2 ring-indigo-400 scale-[1.02]' : ''
      }`}
    >
      {plan.popular && (
        <div className="absolute -top-3 right-6 flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-700 text-white px-3 py-1 text-[10px] font-bold shadow-lg">
          <Sparkles className="h-3 w-3" />
          پیشنهاد ویژه
        </div>
      )}

      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${plan.gradient} text-white shadow-lg mb-4`}>
        <Icon className="h-7 w-7" />
      </div>

      <h3 className="text-lg font-bold text-slate-900">طرح {plan.name}</h3>
      <p className="text-xs text-slate-400 mb-4" dir="ltr">{plan.nameEn}</p>

      <div className="mb-1">
        {plan.price === 0 ? (
          <span className="text-3xl font-bold text-slate-900">{plan.priceLabel}</span>
        ) : (
          <>
            <span className="text-3xl font-bold text-slate-900">{formatToman(plan.price)}</span>
            <span className="text-sm text-slate-500 mr-1">تومان / ماه</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4 mb-5">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-cyan-500" />
          <span className="text-xs text-slate-600">
            {plan.aiAssistantLimit.toLocaleString('fa-IR')} دستیار
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Gift className="h-3.5 w-3.5 text-indigo-500" />
          <span className="text-xs text-slate-600">
            {plan.templateLimit.toLocaleString('fa-IR')} ثبت هوشمند
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs text-slate-600">
            {plan.profileLimit === Infinity ? 'پروفایل نامحدود' : `${plan.profileLimit.toLocaleString('fa-IR')} پروفایل`}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 mb-6">
        {plan.features.map((f, idx) => (
          <div key={idx} className="flex items-start gap-2">
            {f.included ? (
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 mt-0.5">
                <Check className="h-3 w-3 text-emerald-500" />
              </div>
            ) : (
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 mt-0.5">
                <X className="h-3 w-3 text-slate-300" />
              </div>
            )}
            <span className={`text-sm ${f.included ? 'text-slate-700' : 'text-slate-400'}`}>
              {f.label}
            </span>
          </div>
        ))}
      </div>

      {isCurrent ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 text-emerald-600 py-3 text-sm font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          طرح فعلی شما
        </div>
      ) : plan.id === 'free' ? (
        <div className="flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 py-3 text-sm font-semibold">
          طرح پیش‌فرض
        </div>
      ) : (
        <button
          onClick={onSelect}
          className={`w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${plan.gradient} text-white py-3.5 text-sm font-bold hover:shadow-lg transition-all`}
        >
          <CreditCard className="h-4 w-4" />
          انتخاب و پرداخت
        </button>
      )}
    </motion.div>
  );
}

function FeatureComparison({ currentPlan }: { currentPlan: PlanId }) {
  const features = [
    { label: 'گفتگو با دستیار هوشمند', plans: { free: '۳ در ماه', basic: '۲۰ در ماه', pro: '۸۰ در ماه' } },
    { label: 'ثبت رویداد و کار', plans: { free: '۱۰ در ماه', basic: '۳۰ در ماه', pro: '۱۲۰ در ماه' } },
    { label: 'تعداد پروفایل', plans: { free: '۱', basic: '۵', pro: 'نامحدود' } },
    { label: 'خروجی متن (کپی)', plans: { free: true, basic: true, pro: true } },
    { label: 'ویرایش متن نهایی', plans: { free: false, basic: true, pro: true } },
    { label: 'خروجی PDF', plans: { free: false, basic: false, pro: true } },
    { label: 'بدون واترمارک', plans: { free: false, basic: true, pro: true } },
    { label: 'پردازش با اولویت', plans: { free: false, basic: false, pro: true } },
  ];

  const cols: PlanId[] = ['free', 'basic', 'pro'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="glass rounded-2xl p-5 shadow-glass overflow-x-auto"
    >
      <h3 className="text-base font-bold text-slate-900 mb-4">مقایسه امکانات</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-right py-3 px-2 font-medium text-slate-500">امکان</th>
            {cols.map((id) => {
              const plan = PLANS.find((p) => p.id === id)!;
              return (
                <th
                  key={id}
                  className={`text-center py-3 px-2 font-bold ${
                    currentPlan === id ? 'text-indigo-600' : 'text-slate-700'
                  }`}
                >
                  {plan.name}
                  {currentPlan === id && (
                    <span className="block text-[10px] font-medium text-indigo-400 mt-0.5">طرح شما</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {features.map((f, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              <td className="py-3 px-2 font-medium text-slate-600">{f.label}</td>
              {cols.map((id) => {
                const val = (f.plans as Record<string, unknown>)[id];
                return (
                  <td key={id} className="text-center py-3 px-2">
                    {typeof val === 'boolean' ? (
                      val ? (
                        <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                      ) : (
                        <X className="h-4 w-4 text-slate-300 mx-auto" />
                      )
                    ) : (
                      <span className="text-xs text-slate-600">{val as string}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
