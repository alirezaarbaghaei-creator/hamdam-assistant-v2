import { create } from 'zustand';
import type { Draft } from '@/services/drafts';
import { fetchDrafts, saveDraft, deleteDraft } from '@/services/drafts';
import type { LetterType, DiscoveredLetter, ChatMessage } from '@/types';

interface DraftsStoreState {
  drafts: Draft[];
  loading: boolean;
  currentDraftId: string | null;
  setDrafts: (d: Draft[]) => void;
  setLoading: (v: boolean) => void;
  setCurrentDraftId: (id: string | null) => void;
  loadDrafts: () => Promise<void>;
  upsertDraft: (draft: {
    id?: string;
    title: string;
    letter_type: LetterType;
    discovered_letter: DiscoveredLetter | null;
    field_values: Record<string, string>;
    chat_messages: ChatMessage[];
    step: number;
    phase: string;
    use_profile: boolean;
    include_optional: boolean;
  }) => Promise<string | null>;
  removeDraft: (id: string) => Promise<void>;
}

export const useDraftsStore = create<DraftsStoreState>((set, get) => ({
  drafts: [],
  loading: false,
  currentDraftId: null,
  setDrafts: (d) => set({ drafts: d }),
  setLoading: (v) => set({ loading: v }),
  setCurrentDraftId: (id) => set({ currentDraftId: id }),
  loadDrafts: async () => {
    set({ loading: true });
    const drafts = await fetchDrafts();
    set({ drafts, loading: false });
  },
  upsertDraft: async (draft) => {
    const id = await saveDraft(draft);
    if (id) {
      const drafts = await fetchDrafts();
      set({ drafts, currentDraftId: id });
    }
    return id;
  },
  removeDraft: async (id) => {
    const ok = await deleteDraft(id);
    if (ok) {
      set({ drafts: get().drafts.filter((d) => d.id !== id) });
    }
  },
}));
