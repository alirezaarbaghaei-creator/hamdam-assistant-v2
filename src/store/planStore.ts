import { create } from 'zustand';
import { getItem } from '@/lib/safeStorage';
import { incrementAiUsageApi, incrementTemplateUsageApi, usageGetApi } from '@/lib/api';
import { PLANS, PLAN_MAP, WATERMARK_TEXT, type PlanId } from '@/data/plans';

export interface Subscription {
  id: string;
  plan_id: PlanId;
  status: 'active' | 'expired' | 'cancelled';
  ai_assistant_limit: number;
  template_limit: number;
  ai_assistant_usage: number;
  template_usage: number;
  price_toman: number;
  started_at: string;
  expires_at: string | null;
  cycle_start: string;
  ref_id: string | null;
}

export interface PlanTransaction {
  id: string;
  plan_id: PlanId;
  amount_toman: number;
  status: 'pending' | 'paid' | 'failed';
  authority: string;
  ref_id: string | null;
  created_at: string;
  paid_at: string | null;
}

interface PlanState {
  subscription: Subscription | null;
  planType: PlanId;
  aiAssistantUsage: number;
  templateUsage: number;
  expiresAt: string | null;
  loading: boolean;
  showUpgradeModal: boolean;
  upgradeReason: string;
  loadPlan: (userId: string) => Promise<void>;
  incrementAiAssistant: (userId: string) => Promise<boolean>;
  incrementTemplate: (userId: string) => Promise<boolean>;
  canUseAiAssistant: () => boolean;
  canUseTemplate: () => boolean;
  canEdit: () => boolean;
  canExportPdf: () => boolean;
  hasWatermark: () => boolean;
  getAiAssistantLimit: () => number;
  getTemplateLimit: () => number;
  getProfileLimit: () => number;
  canAddProfile: (currentCount: number) => boolean;
  openUpgradeModal: (reason: string) => void;
  closeUpgradeModal: () => void;
  refreshFromUser: (planType: PlanId, aiUsage: number, templateUsage: number) => void;
}

function getAuthHeaders(): Record<string, string> {
  const token = getItem('kateb_token') ?? '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}


export const usePlanStore = create<PlanState>((set, get) => ({
  subscription: null,
  planType: 'free',
  aiAssistantUsage: 0,
  templateUsage: 0,
  expiresAt: null,
  loading: false,
  showUpgradeModal: false,
  upgradeReason: '',

  loadPlan: async (userId: string) => {
    set({ loading: true });
    try {
      const data = await usageGetApi();
      set({
        subscription: null,
        planType: (data.plan_type as PlanId) ?? 'free',
        aiAssistantUsage: data.ai_assistant_usage_this_month ?? 0,
        templateUsage: data.template_usage_this_month ?? 0,
        expiresAt: data.expires_at ?? null,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  incrementAiAssistant: async (userId: string) => {
    const state = get();
    if (!state.canUseAiAssistant()) return false;

    try {
      const newUsage = await incrementAiUsageApi();
      set({ aiAssistantUsage: newUsage });
      return true;
    } catch {
      return false;
    }
  },

  incrementTemplate: async (userId: string) => {
    const state = get();
    if (!state.canUseTemplate()) return false;

    try {
      const newUsage = await incrementTemplateUsageApi();
      set({ templateUsage: newUsage });
      return true;
    } catch {
      return false;
    }
  },

  canUseAiAssistant: () => {
    const { planType, aiAssistantUsage, subscription } = get();
    const limit = subscription?.ai_assistant_limit ?? PLAN_MAP[planType]?.aiAssistantLimit ?? 3;
    return aiAssistantUsage < limit;
  },

  canUseTemplate: () => {
    const { planType, templateUsage, subscription } = get();
    const limit = subscription?.template_limit ?? PLAN_MAP[planType]?.templateLimit ?? 10;
    return templateUsage < limit;
  },

  canEdit: () => {
    const { planType } = get();
    return planType === 'basic' || planType === 'pro';
  },

  canExportPdf: () => {
    return true;
  },

  hasWatermark: () => {
    const { planType } = get();
    return planType === 'free';
  },

  getAiAssistantLimit: () => {
    const { planType, subscription } = get();
    return subscription?.ai_assistant_limit ?? PLAN_MAP[planType]?.aiAssistantLimit ?? 3;
  },

  getTemplateLimit: () => {
    const { planType, subscription } = get();
    return subscription?.template_limit ?? PLAN_MAP[planType]?.templateLimit ?? 10;
  },

  getProfileLimit: () => {
    const { planType } = get();
    return PLAN_MAP[planType]?.profileLimit ?? 1;
  },

  canAddProfile: (currentCount: number) => {
    const { planType } = get();
    const limit = PLAN_MAP[planType]?.profileLimit ?? 1;
    return currentCount < limit;
  },

  openUpgradeModal: (reason: string) => set({ showUpgradeModal: true, upgradeReason: reason }),
  closeUpgradeModal: () => set({ showUpgradeModal: false, upgradeReason: '' }),

  refreshFromUser: (planType: PlanId, aiUsage: number, templateUsage: number) =>
    set({ planType, aiAssistantUsage: aiUsage, templateUsage: templateUsage }),
}));

export { getAuthHeaders, WATERMARK_TEXT };
