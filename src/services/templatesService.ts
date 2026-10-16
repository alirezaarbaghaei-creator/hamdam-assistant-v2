import * as api from '@/lib/api';
import type { SavedTemplate, LetterType } from '@/types';

export interface TemplateRow {
  id: string;
  user_id: string;
  letter_type: Record<string, unknown>;
  title: string;
  raw_request: string;
  creator_name: string;
  rating: number;
  rating_count: number;
  my_rating: number;
  created_at: string;
  is_approved: boolean;
  sample_content: string;
}

function sanitizeExistingContent(content: string): string {
  if (!content) return '';

  // Replace obvious Iranian phone number patterns (mobile and landline)
  let sanitized = content
    .replace(/0\s*9\s*[۰-۹0-9]\s*[۰-۹0-9]\s*[۰-۹0-9]\s*[۰-۹0-9]\s*[۰-۹0-9]\s*[۰-۹0-9]\s*[۰-۹0-9]\s*[۰-۹0-9]/g, '{{شماره تماس}}')
    .replace(/09\d{9}/g, '{{شماره تماس}}')
    .replace(/0\d{2,3}-?\d{7,8}/g, '{{شماره تماس}}')
    .replace(/\b\d{10,11}\b/g, '{{شماره تماس}}')
    .replace(/[۰-۹]{10,11}/g, '{{شماره تماس}}');

  // Replace lines that are explicitly labeled as sensitive
  const lineSensitive = /^([^:\n]*(?:شماره\s*(?:تماس|تلفن|همراه|موبایل)|کد\s*پرسنلی|کد\s*ملی|تلفن|موبایل|همراه)\s*[:：])\s*(.+)$/i;
  sanitized = sanitized.split('\n').map((line) => {
    const m = line.match(lineSensitive);
    if (m) return `${m[1]} {{${m[1].includes('پرسنلی') ? 'کد پرسنلی' : m[1].includes('ملی') ? 'کد ملی' : 'شماره تماس'}}}`;
    return line;
  }).join('\n');

  return sanitized;
}

function rowToTemplate(row: TemplateRow, currentUserId?: string): SavedTemplate {
  return {
    id: row.id,
    letterType: row.letter_type as unknown as SavedTemplate['letterType'],
    title: row.title,
    rawRequest: row.raw_request,
    rating: Number(row.rating) ?? 0,
    ratingCount: row.rating_count ?? 0,
    myRating: row.my_rating ?? 0,
    creatorName: row.creator_name ?? '',
    isOwner: currentUserId ? row.user_id === currentUserId : false,
    isApproved: row.is_approved ?? false,
    sampleContent: sanitizeExistingContent(row.sample_content ?? ''),
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function fetchTemplates(search?: string, currentUserId?: string): Promise<{ templates: SavedTemplate[]; total: number }> {
  try {
    const result = await api.fetchTemplatesApi(search);
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      templates: rows.map((row) => rowToTemplate(row, currentUserId)),
      total: Number.isFinite(result.total) ? result.total : rows.length,
    };
  } catch {
    return { templates: [], total: 0 };
  }
}

export async function createTemplate(t: Omit<SavedTemplate, 'id' | 'createdAt' | 'isApproved'>): Promise<SavedTemplate | null> {
  try {
    const row = {
      letter_type: t.letterType as unknown as Record<string, unknown>,
      title: t.title,
      raw_request: t.rawRequest,
      sample_content: t.sampleContent ?? '',
      source_template_id: (t as any).sourceTemplateId ?? null,
    };
    const res = await api.createTemplateApi(row);
    return { ...t, id: res.id, createdAt: Date.now(), isApproved: false };
  } catch {
    return null;
  }
}

export async function rateTemplate(templateId: string, rating: number): Promise<{ avg: number; count: number; myRating: number } | null> {
  try {
    const res = await api.rateTemplateApi(templateId, rating);
    return { avg: res.avg, count: res.count, myRating: res.my_rating };
  } catch {
    return null;
  }
}

export async function deleteTemplate(id: string): Promise<boolean> {
  try {
    await api.deleteTemplateApi(id);
    return true;
  } catch {
    return false;
  }
}

export async function updateRating(templateId: string, rating: number): Promise<{ avg: number; count: number; myRating: number } | null> {
  try {
    const res = await api.updateTemplateRatingApi(templateId, rating);
    return { avg: res.avg, count: res.count, myRating: res.my_rating };
  } catch {
    return null;
  }
}
