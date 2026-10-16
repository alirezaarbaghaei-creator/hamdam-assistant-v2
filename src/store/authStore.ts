import { create } from 'zustand';
import * as api from '@/lib/api';
import type { AppUser } from '@/lib/api';
import { getItem } from '@/lib/safeStorage';
import { usePlanStore } from '@/store/planStore';
import type { PlanId } from '@/data/plans';

interface AuthState {
  session: { access_token: string } | null;
  user: AppUser | null;
  loading: boolean;
  setSession: (token: string, user: AppUser) => void;
  setUser: (user: AppUser) => void;
  updatePlan: (planType: PlanId, aiUsage: number, templateUsage: number) => void;
  setLoading: (v: boolean) => void;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  setSession: (token, user) => {
    set({ session: { access_token: token }, user });
    if (user.id) {
      usePlanStore.getState().refreshFromUser(
        (user.plan_type as PlanId) ?? 'free',
        user.ai_assistant_usage_this_month ?? 0,
        user.template_usage_this_month ?? 0,
      );
      usePlanStore.getState().loadPlan(user.id);
    }
  },

  setUser: (user) => {
    set({ user });
    if (user.id) {
      usePlanStore.getState().refreshFromUser(
        (user.plan_type as PlanId) ?? 'free',
        user.ai_assistant_usage_this_month ?? 0,
        user.template_usage_this_month ?? 0,
      );
    }
  },
  updatePlan: (planType, aiUsage, templateUsage) =>
    set((state) => ({
      user: state.user ? {
        ...state.user,
        plan_type: planType,
        ai_assistant_usage_this_month: aiUsage,
        template_usage_this_month: templateUsage,
      } : state.user,
    })),
  setLoading: (v) => set({ loading: v }),
  signOut: async () => {
    await api.signOut();
    usePlanStore.getState().refreshFromUser('free', 0, 0);
    set({ session: null, user: null });
  },
  restoreSession: async () => {
    const token = getItem('kateb_token');
    if (!token) {
      set({ session: null, user: null, loading: false });
      return;
    }
    const user = await api.getMe();
    if (user) {
      const token = getItem('kateb_token') ?? '';
      set({ session: { access_token: token }, user, loading: false });
      usePlanStore.getState().refreshFromUser(
        (user.plan_type as PlanId) ?? 'free',
        user.ai_assistant_usage_this_month ?? 0,
        user.template_usage_this_month ?? 0,
      );
      usePlanStore.getState().loadPlan(user.id);
    } else {
      set({ session: null, user: null, loading: false });
    }
  },
}));
