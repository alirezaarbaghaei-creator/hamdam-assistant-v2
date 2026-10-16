import { Sparkles, Crown, Gift, Zap } from 'lucide-react';
import { usePlanStore } from '@/store/planStore';
import { useAppStore } from '@/store/appStore';
import { PLANS, type PlanId } from '@/data/plans';

const planIcons: Record<PlanId, typeof Gift> = {
  free: Gift,
  basic: Zap,
  pro: Crown,
};

export function CreditBadge({ compact = false }: { compact?: boolean }) {
  const planType = usePlanStore((s) => s.planType);
  const aiAssistantUsage = usePlanStore((s) => s.aiAssistantUsage);
  const templateUsage = usePlanStore((s) => s.templateUsage);
  const getAiAssistantLimit = usePlanStore((s) => s.getAiAssistantLimit);
  const getTemplateLimit = usePlanStore((s) => s.getTemplateLimit);
  const setPage = useAppStore((s) => s.setPage);

  const plan = PLANS.find((p) => p.id === planType);
  const Icon = planIcons[planType];

  const aiLimit = getAiAssistantLimit();
  const templateLimit = getTemplateLimit();
  const aiRemaining = aiLimit - aiAssistantUsage;
  const templateRemaining = templateLimit - templateUsage;

  const isLowCredits = aiRemaining <= 1 || templateRemaining <= 2;
  const isPaidPlan = planType !== 'free';

  const handleClick = () => setPage('pricing');

  if (compact) {
    return (
      <button
        onClick={handleClick}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all hover:scale-105 ${
          isLowCredits
            ? 'bg-red-50 text-red-600'
            : isPaidPlan
              ? 'bg-indigo-50 text-indigo-600'
              : 'bg-slate-100 text-slate-600'
        }`}
        title="مشاهده پلن‌ها"
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{plan?.name}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all hover:shadow-md text-right ${
        isLowCredits
          ? 'bg-red-50 border border-red-100'
          : isPaidPlan
            ? 'bg-indigo-50 border border-indigo-100'
            : 'bg-slate-50 border border-slate-100'
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          isLowCredits
            ? 'bg-red-100 text-red-500'
            : isPaidPlan
              ? 'bg-indigo-100 text-indigo-600'
              : 'bg-slate-200 text-slate-500'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-xs font-bold ${
            isLowCredits ? 'text-red-600' : isPaidPlan ? 'text-indigo-700' : 'text-slate-700'
          }`}
        >
          طرح {plan?.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] ${isLowCredits ? 'text-red-400' : 'text-slate-400'}`}>
            هوش: {aiRemaining.toLocaleString('fa-IR')} از {aiLimit.toLocaleString('fa-IR')}
          </span>
          <span className="text-slate-300">·</span>
          <span className={`text-[10px] ${isLowCredits ? 'text-red-400' : 'text-slate-400'}`}>
            ثبت هوشمند: {templateRemaining.toLocaleString('fa-IR')} از {templateLimit.toLocaleString('fa-IR')}
          </span>
        </div>
      </div>
      {isLowCredits && (
        <span className="text-[10px] font-bold text-red-500 bg-red-100 rounded-full px-2 py-0.5 shrink-0">
          نزدیک پایان
        </span>
      )}
      {planType === 'pro' && !isLowCredits && (
        <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
      )}
    </button>
  );
}
