import { create } from 'zustand';
import type { ChatMessage, LetterType, PageId, DiscoveredLetter } from '@/types';
import type { AIDiscoveryResult } from '@/services/deepseek';

interface AppState {
  currentPage: PageId;
  setPage: (p: PageId) => void;

  activeLetterType: LetterType | null;
  setActiveLetterType: (t: LetterType | null) => void;

  /** Kept for backward-compat with old template references */
  activeTemplate: LetterType | null;
  setActiveTemplate: (t: LetterType | null) => void;

  fieldValues: Record<string, string>;
  setFieldValue: (id: string, value: string) => void;
  resetFieldValues: () => void;

  chatMessages: ChatMessage[];
  addMessage: (m: Omit<ChatMessage, 'id'>) => void;
  setChatMessages: (m: ChatMessage[]) => void;
  resetChat: () => void;

  generatedContent: string;
  setGeneratedContent: (c: string) => void;

  editingLetterId: string | null;
  setEditingLetterId: (id: string | null) => void;

  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;

  /** Smart discovery state */
  discoveredLetter: DiscoveredLetter | null;
  setDiscoveredLetter: (d: DiscoveredLetter | null) => void;

  /** Whether to include optional fields in the conversation */
  includeOptional: boolean;
  setIncludeOptional: (v: boolean) => void;

  /** Cached discovery result — survives navigation away and back */
  cachedDiscovery: AIDiscoveryResult | null;
  setCachedDiscovery: (d: AIDiscoveryResult | null) => void;

  /** Cached discovery query text */
  cachedDiscoveryQuery: string;
  setCachedDiscoveryQuery: (q: string) => void;

  /** Whether user chose to use a profile for the current letter */
  useProfileForLetter: boolean;
  setUseProfileForLetter: (v: boolean) => void;

  /** Saved template id created at end of conversation */
  savedTemplateId: string | null;
  setSavedTemplateId: (id: string | null) => void;

  /** Source template id when user re-uses an existing template */
  sourceTemplateId: string | null;
  setSourceTemplateId: (id: string | null) => void;

  /** Chat phase cached so navigation away and back preserves state */
  chatPhase: 'chat' | 'profile-save' | 'scoring' | 'rating' | 'done';
  setChatPhase: (p: 'chat' | 'profile-save' | 'scoring' | 'rating' | 'done') => void;

  /** Cached quality result */
  cachedQualityResult: { score: number; feedback: string } | null;
  setCachedQualityResult: (r: { score: number; feedback: string } | null) => void;

  /** Cached profile save fields suggestion */
  cachedProfileSaveFields: { key: string; label: string; value: string }[];
  setCachedProfileSaveFields: (f: { key: string; label: string; value: string }[]) => void;

  /** Cached chat step */
  cachedChatStep: number;
  setCachedChatStep: (n: number) => void;

  /** Current draft id — tracks which draft is being edited in the chat */
  currentDraftId: string | null;
  setCurrentDraftId: (id: string | null) => void;

  /** Cached input text */
  cachedChatInput: string;
  setCachedChatInput: (s: string) => void;

  /** When true, ChatFlow skips its init reset because we're resuming a saved draft */
  resumingDraft: boolean;
  setResumingDraft: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  setPage: (p) => set({ currentPage: p }),

  activeLetterType: null,
  setActiveLetterType: (t) => set({ activeLetterType: t, activeTemplate: t }),

  activeTemplate: null,
  setActiveTemplate: (t) => set({ activeTemplate: t, activeLetterType: t }),

  fieldValues: {},
  setFieldValue: (id, value) =>
    set((s) => ({ fieldValues: { ...s.fieldValues, [id]: value } })),
  resetFieldValues: () => set({ fieldValues: {} }),

  chatMessages: [],
  addMessage: (m) =>
    set((s) => ({
      chatMessages: [...s.chatMessages, { ...m, id: crypto.randomUUID() }],
    })),
  resetChat: () => set({ chatMessages: [] }),
  setChatMessages: (m) => set({ chatMessages: m }),

  generatedContent: '',
  setGeneratedContent: (c) => set({ generatedContent: c }),

  editingLetterId: null,
  setEditingLetterId: (id) => set({ editingLetterId: id }),

  isGenerating: false,
  setIsGenerating: (v) => set({ isGenerating: v }),

  discoveredLetter: null,
  setDiscoveredLetter: (d) => set({ discoveredLetter: d }),

  includeOptional: true,
  setIncludeOptional: (v) => set({ includeOptional: v }),
  cachedDiscovery: null,
  setCachedDiscovery: (d) => set({ cachedDiscovery: d }),
  cachedDiscoveryQuery: '',
  setCachedDiscoveryQuery: (q) => set({ cachedDiscoveryQuery: q }),
  useProfileForLetter: true,
  setUseProfileForLetter: (v) => set({ useProfileForLetter: v }),
  savedTemplateId: null,
  setSavedTemplateId: (id) => set({ savedTemplateId: id }),
  sourceTemplateId: null,
  setSourceTemplateId: (id) => set({ sourceTemplateId: id }),
  chatPhase: 'chat',
  setChatPhase: (p) => set({ chatPhase: p }),
  cachedQualityResult: null,
  setCachedQualityResult: (r) => set({ cachedQualityResult: r }),
  cachedProfileSaveFields: [],
  setCachedProfileSaveFields: (f) => set({ cachedProfileSaveFields: f }),
  cachedChatStep: 0,
  setCachedChatStep: (n) => set({ cachedChatStep: n }),
  currentDraftId: null,
  setCurrentDraftId: (id) => set({ currentDraftId: id }),
  cachedChatInput: '',
  setCachedChatInput: (s) => set({ cachedChatInput: s }),
  resumingDraft: false,
  setResumingDraft: (v) => set({ resumingDraft: v }),
}));
