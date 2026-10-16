import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Zap,
  Crown,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { usePlanStore } from '@/store/planStore';
import { PLANS, formatToman, type PlanId } from '@/data/plans';

export function UpgradeModal() {
  const showUpgradeModal = usePlanStore((s) => s.showUpgradeModal);
  const upgradeReason = usePlanStore((s) => s.upgradeReason);
  const closeUpgradeModal = usePlanStore((s) => s.closeUpgradeModal);
  const setPage = useAppStore((s) => s.setPage);

  const recommendedPlans: PlanId[] = ['basic', 'pro'];

  const reasonText: Record<string, string> = {
    'no-ai-credits': 'اعتبار گفتگو با دستیار هوشمند شما به پایان رسیده است. برای ادامه، طرح خود را ارتقا دهید.',
    'no-template-credits': 'اعتبار ثبت رویداد و کار به پایان رسیده است. برای ادامه، طرح خود را ارتقا دهید.',
    'pdf-export': 'این امکان فقط در طرح حرفه‌ای در دسترس است.',
    'edit-letter': 'این امکان فقط در طرح‌های پایه و حرفه‌ای در دسترس است.',
  };

  void useAppStore; // (legacy store import kept for compatibility)

  const description = reasonText[upgradeReason] ?? 'برای استفاده از این امکان، طرح خود را ارتقا دهید.';

  return (
    <AnimatePresence>
      {showUpgradeModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={closeUpgradeModal}
        >
          <motion.div
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white">
                  <Lock className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">ارتقای طرح</h3>
              </div>
              <button
                onClick={closeUpgradeModal}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 mb-5">
              <p className="text-sm text-amber-700">{description}</p>
            </div>

            {/* Plan comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              {recommendedPlans.map((planId) => {
                const plan = PLANS.find((p) => p.id === planId)!;
                const Icon = planId === 'pro' ? Crown : Zap;
                return (
                  <button
                    key={planId}
                    onClick={() => {
                      closeUpgradeModal();
                      setPage('pricing');
                    }}
                    className={`text-right rounded-2xl border-2 p-5 transition-all hover:shadow-lg group ${
                      plan.popular
                        ? 'border-indigo-300 bg-indigo-50/30'
                        : 'border-slate-100 hover:border-indigo-300'
                    }`}
                  >
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${plan.gradient} text-white mb-3`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="text-base font-bold text-slate-900 mb-1">{plan.name}</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {formatToman(plan.price)}
                      <span className="text-sm font-normal text-slate-500 mr-1">تومان / ماه</span>
                    </p>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-slate-600">
                        {plan.aiAssistantLimit.toLocaleString('fa-IR')} گفتگو با دستیار
                      </p>
                      <p className="text-xs text-slate-600">
                        {plan.templateLimit.toLocaleString('fa-IR')} ثبت هوشمند در ماه
                      </p>
                    </div>
                    <div className="flex items-center gap-1 mt-3 text-sm font-semibold text-indigo-600 group-hover:gap-2 transition-all">
                      انتخاب طرح
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                closeUpgradeModal();
                setPage('pricing');
              }}
              className="w-full rounded-xl bg-slate-100 text-slate-700 py-3 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              مشاهده همه طرح‌ها
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
