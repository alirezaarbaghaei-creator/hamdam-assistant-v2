import type { LetterCategory } from '@/types';

export const categoryLabels: Record<LetterCategory, string> = {
  administrative: 'اداری',
  legal: 'حقوقی',
  personal: 'شخصی',
  official: 'رسمی',
  financial: 'مالی',
  hr: 'منابع انسانی',
  contract: 'قرارداد',
  document: 'سند',
  pledge: 'قولنامه',
  agreement: 'توافق‌نامه',
};

export const categoryColors: Record<LetterCategory, string> = {
  administrative: 'from-indigo-500 to-indigo-600',
  legal: 'from-slate-600 to-slate-800',
  personal: 'from-cyan-500 to-cyan-600',
  official: 'from-indigo-600 to-cyan-600',
  financial: 'from-emerald-500 to-emerald-600',
  hr: 'from-violet-500 to-violet-600',
  contract: 'from-amber-500 to-orange-600',
  document: 'from-teal-500 to-teal-600',
  pledge: 'from-rose-500 to-rose-600',
  agreement: 'from-blue-500 to-blue-600',
};
