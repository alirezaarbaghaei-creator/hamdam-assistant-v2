import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Trash2,
  Eye,
  Search,
  Calendar,
  Archive as ArchiveIcon,
  Star,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import { useArchiveStore } from '@/store/archiveStore';
import { useAppStore } from '@/store/appStore';
import { useProfileStore } from '@/store/profileStore';

type ScoreFilter = 'all' | 'high' | 'medium' | 'low' | 'unscored';

const scoreFilters: { id: ScoreFilter; label: string; color: string }[] = [
  { id: 'all', label: 'همه', color: 'bg-slate-100 text-slate-600' },
  { id: 'high', label: 'عالی (۸۰+)', color: 'bg-green-50 text-green-600' },
  { id: 'medium', label: 'متوسط (۶۰-۷۹)', color: 'bg-amber-50 text-amber-600' },
  { id: 'low', label: 'ضعیف (<۶۰)', color: 'bg-red-50 text-red-600' },
  { id: 'unscored', label: 'بدون امتیاز', color: 'bg-slate-50 text-slate-400' },
];

function getScoreTier(score: number | undefined): 'high' | 'medium' | 'low' | 'unscored' {
  if (score == null) return 'unscored';
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

export function Archive() {
  const letters = useArchiveStore((s) => s.letters);
  const deleteLetter = useArchiveStore((s) => s.deleteLetter);
  const setGeneratedContent = useAppStore((s) => s.setGeneratedContent);
  const setEditingLetterId = useAppStore((s) => s.setEditingLetterId);
  const setPage = useAppStore((s) => s.setPage);
  const profiles = useProfileStore((s) => s.profiles);
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');

  const filtered = letters.filter((l) => {
    const matchesQuery = !query || l.title.includes(query) || l.templateTitle.includes(query);
    const tier = getScoreTier(l.qualityScore);
    const matchesScore = scoreFilter === 'all' || tier === scoreFilter;
    return matchesQuery && matchesScore;
  });

  // Sort by score descending (unscored at end)
  const sorted = [...filtered].sort((a, b) => {
    const sa = a.qualityScore ?? -1;
    const sb = b.qualityScore ?? -1;
    return sb - sa;
  });

  const openLetter = (id: string, content: string) => {
    setEditingLetterId(id);
    setGeneratedContent(content);
    setPage('preview');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">آرشیو مکتوب‌ها</h2>
        <p className="text-sm text-slate-500">
          {letters.length} مکتوب ذخیره شده
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجو در مکتوب‌ها..."
          className="w-full glass rounded-2xl py-3.5 pr-12 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring shadow-glass"
        />
      </div>

      {/* Score filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <SlidersHorizontal className="h-4 w-4 text-slate-400 shrink-0" />
        {scoreFilters.map((sf) => (
          <button
            key={sf.id}
            onClick={() => setScoreFilter(sf.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
              scoreFilter === sf.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : sf.color + ' hover:opacity-80'
            }`}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center shadow-glass">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-4">
            <ArchiveIcon className="h-8 w-8" />
          </div>
          <p className="text-sm font-semibold text-slate-600">
            {letters.length === 0 ? 'آرشیو خالی است' : 'نتیجه‌ای یافت نشد'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {letters.length === 0
              ? 'مکتوب‌های ساخته‌شده در اینجا ذخیره می‌شوند'
              : 'عبارت دیگری جستجو کنید'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {sorted.map((letter, i) => {
              const profile = profiles.find((p) => p.id === letter.profileId);
              const tier = getScoreTier(letter.qualityScore);
              return (
                <motion.div
                  key={letter.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                  className="glass rounded-2xl p-4 shadow-glass hover:shadow-glass-lg transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                      <FileText className="h-6 w-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {letter.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                          {letter.templateTitle}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Calendar className="h-3 w-3" />
                          {new Date(letter.createdAt).toLocaleDateString('fa-IR')}
                        </span>
                        {letter.status === 'final' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-green-50 text-green-600">
                            نهایی
                          </span>
                        )}
                        {letter.qualityScore != null && (
                          <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            tier === 'high' ? 'bg-green-50 text-green-600'
                              : tier === 'medium' ? 'bg-amber-50 text-amber-600'
                              : 'bg-red-50 text-red-600'
                          }`}>
                            <Star className={`h-2.5 w-2.5 ${tier === 'high' ? 'fill-green-400' : tier === 'medium' ? 'fill-amber-400' : 'fill-red-400'}`} />
                            {letter.qualityScore}
                          </span>
                        )}
                        {profile && (
                          <span className="text-[10px] text-slate-400 truncate">
                            · {profile.fullName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openLetter(letter.id, letter.content)}
                        className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="hidden sm:inline">مشاهده</span>
                      </button>
                      <button
                        onClick={() => setConfirmDelete(letter.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {confirmDelete === letter.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mt-3"
                      >
                        <div className="rounded-xl bg-red-50 p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-red-700">
                            این مکتوب حذف شود؟
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                deleteLetter(letter.id);
                                setConfirmDelete(null);
                              }}
                              className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-red-700"
                            >
                              بله، حذف کن
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="rounded-lg bg-white text-slate-600 px-3 py-1.5 text-xs font-medium border border-slate-200"
                            >
                              خیر
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
