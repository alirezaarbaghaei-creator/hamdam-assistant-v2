import { create } from 'zustand';
import type { SavedTemplate } from '@/types';
import {
  fetchTemplates,
  createTemplate as svcCreate,
  rateTemplate as svcRate,
  deleteTemplate as svcDelete,
  updateRating as svcUpdateRating,
} from '@/services/templatesService';
import { useAuthStore } from '@/store/authStore';

interface TemplateState {
  templates: SavedTemplate[];
  total: number;
  loading: boolean;
  error: string | null;
  loadTemplates: (search?: string) => Promise<void>;
  addTemplate: (t: Omit<SavedTemplate, 'id' | 'createdAt' | 'isApproved'>) => Promise<string | null>;
  updateRating: (id: string, rating: number) => Promise<void>;
  rateTemplate: (id: string, rating: number) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  getTemplate: (id: string) => SavedTemplate | undefined;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  total: 0,
  loading: false,
  error: null,

  loadTemplates: async (search?: string) => {
    set({ loading: true, error: null });
    const currentUserId = useAuthStore.getState().user?.id;
    try {
      const { templates, total } = await fetchTemplates(search, currentUserId);
      set({ templates, total, loading: false });
    } catch {
      set({ templates: [], total: 0, loading: false, error: 'بارگذاری قالب‌ها انجام نشد.' });
    }
  },

  addTemplate: async (t) => {
    const created = await svcCreate(t);
    if (created) {
      set((s) => ({ templates: [created, ...s.templates], total: s.total + 1 }));
      return created.id;
    }
    return null;
  },

  rateTemplate: async (id, rating) => {
    const result = await svcRate(id, rating);
    if (result) {
      set((s) => ({
        templates: s.templates.map((t) =>
          t.id === id
            ? { ...t, rating: result.avg, ratingCount: result.count, myRating: result.myRating }
            : t,
        ),
      }));
    }
  },

  deleteTemplate: async (id) => {
    const ok = await svcDelete(id);
    if (ok) {
      set((s) => ({
        templates: s.templates.filter((t) => t.id !== id),
        total: Math.max(0, s.total - 1),
      }));
    }
  },

  updateRating: async (id, rating) => {
    const result = await svcUpdateRating(id, rating);
    if (result) {
      set((s) => ({
        templates: s.templates.map((t) =>
          t.id === id
            ? { ...t, rating: result.avg, ratingCount: result.count, myRating: result.myRating }
            : t,
        ),
      }));
    }
  },

  getTemplate: (id) => get().templates.find((t) => t.id === id),
}));
