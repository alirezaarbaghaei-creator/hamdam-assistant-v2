import * as api from '@/lib/api';
import type { GeneratedLetter } from '@/types';

export interface LetterRow {
  id: string;
  user_id: string;
  letter_type_id: string;
  template_id: string;
  template_title: string;
  profile_id: string | null;
  title: string;
  content: string;
  field_values: Record<string, string>;
  status: string;
  quality_score: number | null;
  quality_feedback: string | null;
  user_rating: number | null;
  created_at: string;
  updated_at: string;
}

function rowToLetter(row: LetterRow): GeneratedLetter {
  return {
    id: row.id,
    letterTypeId: row.letter_type_id,
    templateId: row.template_id,
    templateTitle: row.template_title,
    profileId: row.profile_id,
    title: row.title,
    content: row.content,
    fieldValues: row.field_values ?? {},
    status: row.status as 'draft' | 'final',
    qualityScore: row.quality_score ?? undefined,
    qualityFeedback: row.quality_feedback ?? undefined,
    userRating: row.user_rating ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function letterToRow(l: Omit<GeneratedLetter, 'createdAt' | 'updatedAt'>): Omit<LetterRow, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
  return {
    letter_type_id: l.letterTypeId ?? '',
    template_id: l.templateId,
    template_title: l.templateTitle,
    profile_id: l.profileId,
    title: l.title,
    content: l.content,
    field_values: l.fieldValues,
    status: l.status,
    quality_score: l.qualityScore ?? null,
    quality_feedback: l.qualityFeedback ?? null,
    user_rating: l.userRating ?? null,
  };
}

export async function fetchLetters(): Promise<GeneratedLetter[]> {
  try {
    const rows = await api.fetchLettersApi();
    return (rows as LetterRow[]).map(rowToLetter);
  } catch {
    return [];
  }
}

export async function createLetter(l: GeneratedLetter): Promise<GeneratedLetter | null> {
  try {
    const row = letterToRow(l);
    const res = await api.createLetterApi(row);
    return { ...l, id: res.id };
  } catch {
    return null;
  }
}

export async function updateLetter(id: string, patch: Partial<GeneratedLetter>): Promise<boolean> {
  const row: Record<string, unknown> = {};
  if (patch.content !== undefined) row.content = patch.content;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.qualityScore !== undefined) row.quality_score = patch.qualityScore;
  if (patch.qualityFeedback !== undefined) row.quality_feedback = patch.qualityFeedback;
  if (patch.userRating !== undefined) row.user_rating = patch.userRating;
  try {
    await api.updateLetterApi(id, row);
    return true;
  } catch {
    return false;
  }
}

export async function deleteLetter(id: string): Promise<boolean> {
  try {
    await api.deleteLetterApi(id);
    return true;
  } catch {
    return false;
  }
}
