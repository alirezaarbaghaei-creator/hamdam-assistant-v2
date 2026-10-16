import * as api from '@/lib/api';
import type { LetterType, DiscoveredLetter, ChatMessage } from '@/types';

export interface Draft {
  id: string;
  user_id: string;
  title: string;
  letter_type: LetterType;
  discovered_letter: DiscoveredLetter | null;
  field_values: Record<string, string>;
  chat_messages: ChatMessage[];
  step: number;
  phase: string;
  use_profile: boolean;
  include_optional: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchDrafts(): Promise<Draft[]> {
  try {
    const rows = await api.fetchDraftsApi();
    return (rows as Draft[]);
  } catch {
    return [];
  }
}

export async function saveDraft(draft: {
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
}): Promise<string | null> {
  try {
    const res = await api.saveDraftApi(draft as Record<string, unknown>);
    return res.id ?? null;
  } catch {
    return null;
  }
}

export async function deleteDraft(id: string): Promise<boolean> {
  try {
    await api.deleteDraftApi(id);
    return true;
  } catch {
    return false;
  }
}
