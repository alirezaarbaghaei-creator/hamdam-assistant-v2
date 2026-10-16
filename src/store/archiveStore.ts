import { create } from 'zustand';
import type { GeneratedLetter } from '@/types';
import {
  fetchLetters,
  createLetter as svcCreate,
  updateLetter as svcUpdate,
  deleteLetter as svcDelete,
} from '@/services/lettersService';

interface ArchiveState {
  letters: GeneratedLetter[];
  loading: boolean;
  loadLetters: () => Promise<void>;
  addLetter: (l: GeneratedLetter) => Promise<GeneratedLetter>;
  updateLetter: (id: string, patch: Partial<GeneratedLetter>) => Promise<void>;
  deleteLetter: (id: string) => Promise<void>;
  getLetter: (id: string) => GeneratedLetter | undefined;
}

export const useArchiveStore = create<ArchiveState>((set, get) => ({
  letters: [],
  loading: false,

  loadLetters: async () => {
    set({ loading: true });
    const letters = await fetchLetters();
    set({ letters, loading: false });
  },

  addLetter: async (l) => {
    const created = await svcCreate(l);
    // Keep the letter locally even if the server save fails (offline / API
    // error) so it still shows up in the archive and Preview can resolve it.
    const saved = created ?? l;
    set((s) => ({ letters: [saved, ...s.letters] }));
    return saved;
  },

  updateLetter: async (id, patch) => {
    const ok = await svcUpdate(id, patch);
    if (ok) {
      set((s) => ({
        letters: s.letters.map((x) =>
          x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x,
        ),
      }));
    }
  },

  deleteLetter: async (id) => {
    const ok = await svcDelete(id);
    if (ok) {
      set((s) => ({ letters: s.letters.filter((x) => x.id !== id) }));
    }
  },

  getLetter: (id) => get().letters.find((x) => x.id === id),
}));
