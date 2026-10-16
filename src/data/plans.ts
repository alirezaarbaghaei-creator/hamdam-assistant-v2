export type PlanId = 'free' | 'basic' | 'pro';

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface PricingPlan {
  id: PlanId;
  name: string;
  nameEn: string;
  price: number;
  priceLabel: string;
  period: string;
  /** Monthly quota for AI assistant conversations (server-enforced counter) */
  aiAssistantLimit: number;
  /** Monthly quota for smart registrations (legacy template counter, reused) */
  templateLimit: number;
  profileLimit: number;
  popular?: boolean;
  accent: string;
  gradient: string;
  features: PlanFeature[];
}

/**
 * Plans for «همدم» — the payment engine (Zarinpal + Cafe Bazaar, plan ids,
 * server-side counters) is unchanged; only the commercial wording matches
 * the calendar-assistant product.
 */
export const PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'آزمایشی',
    nameEn: 'Free',
    price: 0,
    priceLabel: 'رایگان',
    period: '',
    aiAssistantLimit: 3,
    templateLimit: 10,
    profileLimit: 1,
    accent: 'slate',
    gradient: 'from-slate-400 to-slate-600',
    features: [
      { label: '۳ گفتگو با دستیار هوشمند در ماه', included: true },
      { label: '۱۰ ثبت رویداد و کار در ماه', included: true },
      { label: 'تقویم جلالی با مناسبت‌ها', included: true },
      { label: 'یادآوری روی دستگاه', included: true },
      { label: 'گزارش هوشمند روز و هفته', included: false },
      { label: 'همگام‌سازی ابری', included: false },
    ],
  },
  {
    id: 'basic',
    name: 'پایه',
    nameEn: 'Basic',
    price: 59000,
    priceLabel: '۵۹٬۰۰۰',
    period: 'ماهانه',
    aiAssistantLimit: 20,
    templateLimit: 30,
    profileLimit: 5,
    accent: 'cyan',
    gradient: 'from-cyan-500 to-blue-600',
    features: [
      { label: '۲۰ گفتگو با دستیار هوشمند در ماه', included: true },
      { label: '۳۰ ثبت رویداد و کار در ماه', included: true },
      { label: 'تقویم جلالی با مناسبت‌ها', included: true },
      { label: 'یادآوری روی دستگاه', included: true },
      { label: 'گزارش هوشمند روز و هفته', included: true },
      { label: 'همگام‌سازی ابری', included: true },
    ],
  },
  {
    id: 'pro',
    name: 'حرفه‌ای',
    nameEn: 'Pro',
    price: 119000,
    priceLabel: '۱۱۹٬۰۰۰',
    period: 'ماهانه',
    aiAssistantLimit: 80,
    templateLimit: 120,
    profileLimit: Infinity,
    popular: true,
    accent: 'indigo',
    gradient: 'from-indigo-500 to-indigo-700',
    features: [
      { label: '۸۰ گفتگو با دستیار هوشمند در ماه', included: true },
      { label: '۱۲۰ ثبت رویداد و کار در ماه', included: true },
      { label: 'تقویم جلالی با مناسبت‌ها', included: true },
      { label: 'یادآوری روی دستگاه', included: true },
      { label: 'گزارش هوشمند روز و هفته', included: true },
      { label: 'همگام‌سازی ابری', included: true },
      { label: 'پردازش با اولویت', included: true },
    ],
  },
];

export const PLAN_MAP: Record<PlanId, PricingPlan> = PLANS.reduce(
  (acc, p) => { acc[p.id] = p; return acc; },
  {} as Record<PlanId, PricingPlan>,
);

export function getPlanById(id: string): PricingPlan | undefined {
  return PLAN_MAP[id as PlanId];
}

export function formatToman(n: number): string {
  return n.toLocaleString('fa-IR');
}

export const WATERMARK_TEXT = '\n\n— برنامه‌ریزی‌شده با همدم';
