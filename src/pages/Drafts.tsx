import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Trash2,
  ArrowLeft,
  Clock,
  MessageSquare,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { useDraftsStore } from '@/store/draftsStore';
import { useAppStore } from '@/store/appStore';
import type { LetterType, DiscoveredLetter, LetterField } from '@/types';

export function Drafts() {
  const drafts = useDraftsStore((s) => s.drafts);
  const loading = useDraftsStore((s) => s.loading);
  const loadDrafts = useDraftsStore((s) => s.loadDrafts);
  const removeDraft = useDraftsStore((s) => s.removeDraft);
  const setCurrentDraftId = useDraftsStore((s) => s.setCurrentDraftId);

  const setPage = useAppStore((s) => s.setPage);
  const setActiveLetterType = useAppStore((s) => s.setActiveLetterType);
  const setDiscoveredLetter = useAppStore((s) => s.setDiscoveredLetter);
  const setFieldValues = useAppStore((s) => s.setFieldValue);
  const resetFieldValues = useAppStore((s) => s.resetFieldValues);
  const setChatMessages = useAppStore((s) => s.setChatMessages);
  const resetChat = useAppStore((s) => s.resetChat);
  const setCachedChatStep = useAppStore((s) => s.setCachedChatStep);
  const setChatPhase = useAppStore((s) => s.setChatPhase);
  const setUseProfileForLetter = useAppStore((s) => s.setUseProfileForLetter);
  const setIncludeOptional = useAppStore((s) => s.setIncludeOptional);
  const setEditingLetterId = useAppStore((s) => s.setEditingLetterId);
  const setGeneratedContent = useAppStore((s) => s.setGeneratedContent);
  const setResumingDraft = useAppStore((s) => s.setResumingDraft);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const resumeDraft = (draftId: string) => {
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft) return;

    resetChat();
    resetFieldValues();

    const lt = draft.letter_type as LetterType;
    setActiveLetterType(lt);

    if (draft.discovered_letter) {
      setDiscoveredLetter(draft.discovered_letter as DiscoveredLetter);
    }
    setUseProfileForLetter(draft.use_profile);
    setIncludeOptional(draft.include_optional);

    // Restore field values
    for (const [key, val] of Object.entries(draft.field_values ?? {})) {
      setFieldValues(key, val);
    }

    // Restore chat messages
    setChatMessages(draft.chat_messages ?? []);
    setCachedChatStep(draft.step ?? 0);
    setChatPhase((draft.phase as 'chat' | 'profile-save' | 'scoring' | 'done') ?? 'chat');

    setCurrentDraftId(draftId);
    setEditingLetterId(null);
    setGeneratedContent('');
    setResumingDraft(true);
    setPage('chat');
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('fa-IR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">مکالمات ناتمام</h2>
          <p className="text-sm text-slate-500">
            مکالماتی که هنوز به مکتوب ختم نشده‌اند
          </p>
        </div>
        <button
          onClick={() => loadDrafts()}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          به‌روزرسانی
        </button>
      </div>

      {loading && drafts.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center shadow-glass">
          <Loader />
        </div>
      ) : drafts.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center shadow-glass">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-4">
            <MessageSquare className="h-8 w-8" />
          </div>
          <p className="text-sm font-semibold text-slate-600">مکالمه ناتمامی وجود ندارد</p>
          <p className="text-xs text-slate-400 mt-1">
            مکالماتی که قبل از تولید مکتوب رها شوند، در اینجا ذخیره می‌شوند
          </p>
          <button
            onClick={() => setPage('discovery')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            شروع مکالمه جدید
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {drafts.map((draft, i) => {
              const fieldCount = Object.keys(draft.field_values ?? {}).length;
              const totalFields = (draft.letter_type?.fields ?? []).filter(
                (f: LetterField) => f.required,
              ).length;
              const progress = totalFields > 0 ? Math.round((fieldCount / totalFields) * 100) : 0;

              return (
                <motion.div
                  key={draft.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                  className="glass rounded-2xl p-4 shadow-glass hover:shadow-glass-lg transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/20">
                      <FileText className="h-6 w-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {draft.title || 'مکالمه بدون عنوان'}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="h-3 w-3" />
                          {formatDate(draft.updated_at)}
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-600">
                          {fieldCount} / {totalFields} فیلد
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                          {progress}%
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => resumeDraft(draft.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">ادامه</span>
                      </button>
                      <button
                        onClick={() => setConfirmDelete(draft.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {confirmDelete === draft.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mt-3"
                      >
                        <div className="rounded-xl bg-red-50 p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-red-700">
                            این مکالمه حذف شود؟
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                await removeDraft(draft.id);
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

      {drafts.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-blue-50/60 border border-blue-100 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700">
            برای ادامه مکالمه روی «ادامه» بزنید. مکالمات ناتمام به‌طور خودکار ذخیره می‌شوند.
          </p>
        </div>
      )}
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
    </div>
  );
}
