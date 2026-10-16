import { create } from 'zustand';
import type { Profile } from '@/types';
import {
  fetchProfiles,
  createProfile as svcCreate,
  updateProfile as svcUpdate,
  deleteProfile as svcDelete,
  setDefaultProfile as svcSetDefault,
} from '@/services/profilesService';

interface ProfileState {
  profiles: Profile[];
  loading: boolean;
  loadProfiles: () => Promise<void>;
  addProfile: (p: Omit<Profile, 'id' | 'createdAt'>) => Promise<void>;
  updateProfile: (id: string, p: Partial<Profile>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
  getDefault: () => Profile | undefined;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  loading: false,

  loadProfiles: async () => {
    set({ loading: true });
    const profiles = await fetchProfiles();
    set({ profiles, loading: false });
  },

  addProfile: async (p) => {
    const created = await svcCreate(p);
    if (created) {
      set((s) => {
        let profiles = [...s.profiles, created];
        if (created.isDefault) {
          profiles = profiles.map((x) => (x.id === created.id ? x : { ...x, isDefault: false }));
        }
        return { profiles };
      });
    }
  },

  updateProfile: async (id, p) => {
    const ok = await svcUpdate(id, p);
    if (ok) {
      set((s) => {
        let profiles = s.profiles.map((x) => (x.id === id ? { ...x, ...p } : x));
        if (p.isDefault) {
          profiles = profiles.map((x) => (x.id === id ? x : { ...x, isDefault: false }));
        }
        return { profiles };
      });
    }
  },

  deleteProfile: async (id) => {
    const ok = await svcDelete(id);
    if (ok) {
      set((s) => {
        const profiles = s.profiles.filter((x) => x.id !== id);
        if (profiles.length && !profiles.some((x) => x.isDefault)) {
          profiles[0].isDefault = true;
        }
        return { profiles };
      });
    }
  },

  setDefault: async (id) => {
    const allIds = get().profiles.map((p) => p.id);
    const ok = await svcSetDefault(id, allIds);
    if (ok) {
      set((s) => ({
        profiles: s.profiles.map((x) => ({ ...x, isDefault: x.id === id })),
      }));
    }
  },

  getDefault: () => get().profiles.find((x) => x.isDefault),
}));
