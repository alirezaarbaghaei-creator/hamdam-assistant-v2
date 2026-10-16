import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  ArrowLeft,
  FileText,
  Zap,
  Star,
  Clock,
  Lock,
  Search as SearchIcon,
  X,
  Eye,
  User,
  UserX,
  Check,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useTemplateStore } from '@/store/templateStore';
import { useAuthStore } from '@/store/authStore';
import { usePlanStore } from '@/store/planStore';
import { useProfileStore } from '@/store/profileStore';
import { categoryLabels, categoryColors } from '@/data/templates';
import type { SavedTemplate, LetterType, LetterCategory, Profile } from '@/types';

export function Templates() {
  const setPage = useAppStore((s) => s.setPage);
  const setActiveLetterType = useAppStore((s) => s.setActiveLetterType);
  const setDiscoveredLetter = useAppStore((s) => s.setDiscoveredLetter);
  const setIncludeOptional = useAppStore((s) => s.setIncludeOptional);
  const setUseProfileForLetter = useAppStore((s) => s.setUseProfileForLetter);
  const resetChat = useAppStore((s) => s.resetChat);
  const resetFieldValues = useAppStore((s) => s.resetFieldValues);
  const setSourceTemplateId = useAppStore((s) => s.setSourceTemplateId);

  const templates = useTemplateStore((s) => s.templates);
  const total = useTemplateStore((s) => s.total);
  const loading = useTemplateStore((s) => s.loading);
  const templateError = useTemplateStore((s) => s.error);
  const loadTemplates = useTemplateStore((s) => s.loadTemplates);
  const rateTemplate = useTemplateStore((s) => s.rateTemplate);

  const user = useAuthStore((s) => s.user);
  const templateUsage = usePlanStore((s) => s.templateUsage);
  const getTemplateLimit = usePlanStore((s) => s.getTemplateLimit);
  const canUseTemplate = usePlanStore((s) => s.canUseTemplate());
  const openUpgradeModal = usePlanStore((s) => s.openUpgradeModal);
  const incrementTemplate = usePlanStore((s) => s.incrementTemplate);
  const [search, setSearch] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<SavedTemplate | null>(null);
  const [activeCategory, setActiveCategory] = useState<LetterCategory | 'all'>('all');
  const [profileChoiceTemplate, setProfileChoiceTemplate] = useState<SavedTemplate | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  const profiles = useProfileStore((s) => s.profiles);
  const defaultProfile = profiles.find((p) => p.isDefault) ?? profiles[0];

  const templateRemaining = getTemplateLimit() - templateUsage;

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleSearch = (val: string) => {
    setSearch(val);
    loadTemplates(val);
  };

  const categories = Array.from(new Set(templates.map((t) => t.letterType.category)));
  const filteredTemplates = activeCategory === 'all'
    ? templates
    : templates.filter((t) => t.letterType.category === activeCategory);

  const handleUseTemplate = async (template: SavedTemplate) => {
    if (!canUseTemplate) {
      openUpgradeModal('no-template-credits');
      return;
    }

    const letterType: LetterType = { ...template.letterType, id: crypto.randomUUID() };
    const needsProfile = letterType.needsProfile ?? true;

    if (needsProfile && profiles.length > 0) {
      setSelectedProfileId(defaultProfile?.id ?? profiles[0].id ?? '');
      setProfileChoiceTemplate(template);
      return;
    }

    await startConversation(template, false, null);
  };

  const startConversation = async (
    template: SavedTemplate,
    useProfile: boolean,
    profile: Profile | null,
  ) => {
    if (user?.id) {
      await incrementTemplate(user.id);
    }

    setSourceTemplateId(template.id);
    const letterType: LetterType = { ...template.letterType, id: crypto.randomUUID() };
    setActiveLetterType(letterType);
    setUseProfileForLetter(useProfile);
    setDiscoveredLetter({
      letterType,
      title: `${letterType.title} - ${new Date().toLocaleDateString('fa-IR')}`,
      category: letterType.category,
      requiredFields: letterType.fields.filter((f) => f.required),
      optionalFields: letterType.fields.filter((f) => f.optional),
      confidence: 1,
      rawRequest: template.rawRequest,
      needsProfile: useProfile,
    });
    setIncludeOptional(true);
    resetChat();
    resetFieldValues();
    setProfileChoiceTemplate(null);
    setPage('chat');
  };

  const handleRate = async (id: string, rating: number) => {
    await rateTemplate(id, rating);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">قالب‌های مکتوب</h2>
          <p className="text-sm text-slate-500">قالب‌های عمومی آماده برای استفاده</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2 shrink-0">
          <Zap className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-bold text-indigo-700">{templateRemaining.toLocaleString('fa-IR')} اعتبار قالب</span>
        </div>
      </div>

      {/* AI discovery CTA */}
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setPage('discovery')}
        className="w-full glass rounded-2xl p-5 shadow-glass hover:shadow-glass-lg transition-all text-right flex items-center gap-4 group"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
          <Sparkles className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-900">کشف هوشمند نوع مکتوب</p>
          <p className="text-xs text-slate-500 mt-0.5">
            درخواست خود را به زبان طبیعی بنویسید — هوش مصنوعی نوع مکتوب را طراحی می‌کند
          </p>
          <p className="text-[10px] text-cyan-600 mt-1 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> ۱ اعتبار هوشمند
          </p>
        </div>
        <ArrowLeft className="h-5 w-5 text-slate-400 group-hover:text-sky-500 transition-colors shrink-0" />
      </motion.button>

      {/* Search bar */}
      <div className="relative">
        <SearchIcon className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="جستجو در قالب‌ها..."
          className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pr-11 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus-ring"
        />
        {search && (
          <button
            onClick={() => handleSearch('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setActiveCategory('all')}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              activeCategory === 'all'
                ? 'bg-slate-900 text-white shadow-lg'
                : 'glass text-slate-600 hover:text-slate-900'
            }`}
          >
            همه
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-slate-900 text-white shadow-lg'
                  : 'glass text-slate-600 hover:text-slate-900'
              }`}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </div>
      )}

      {/* Limit reached warning */}
      {!canUseTemplate && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3"
        >
          <Lock className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-600 flex-1">اعتبار استفاده از قالب‌ها به پایان رسیده است.</p>
          <button
            onClick={() => openUpgradeModal('no-template-credits')}
            className="flex items-center gap-1 rounded-lg bg-indigo-500 text-white px-3 py-1.5 text-xs font-semibold hover:bg-indigo-600 transition-colors shrink-0"
          >
            <Sparkles className="h-3 w-3" />
            ارتقای طرح
          </button>
        </motion.div>
      )}

      {/* Templates list */}
      {templateError ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-6 shadow-glass text-center"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500 mb-4">
            <FileText className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">قالب‌ها بارگذاری نشدند</p>
          <p className="text-xs text-slate-500 mb-4">لطفاً دوباره تلاش کنید.</p>
          <button
            onClick={() => loadTemplates(search)}
            className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
          >
            تلاش دوباره
          </button>
        </motion.div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" />
        </div>
      ) : filteredTemplates.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {filteredTemplates.length.toLocaleString('fa-IR')} قالب
              {search && ` برای «${search}»`}
            </p>
          </div>
          <div className="space-y-2.5">
            {filteredTemplates.map((template, i) => (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                className="glass rounded-2xl p-4 shadow-glass hover:shadow-glass-lg transition-all"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${categoryColors[template.letterType.category]} text-white shadow-lg`}
                  >
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {template.title}
                      </p>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 shrink-0">
                        {categoryLabels[template.letterType.category]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {template.rawRequest}
                    </p>

                    {/* Creator + date */}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                      {template.creatorName && (
                        <span>توسط {template.creatorName}</span>
                      )}
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {new Date(template.createdAt).toLocaleDateString('fa-IR')}
                      </span>
                    </div>

                    {/* Rating */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => handleRate(template.id, star)}
                            className="transition-transform hover:scale-110"
                          >
                            <Star
                              className={`h-4 w-4 ${
                                star <= (template.myRating ?? 0)
                                  ? 'fill-amber-400 text-amber-400'
                                  : star <= Math.round(template.rating)
                                    ? 'fill-amber-200 text-amber-300'
                                    : 'text-slate-200'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {template.ratingCount > 0
                          ? `${template.rating.toFixed(1)} (${template.ratingCount.toLocaleString('fa-IR')} رای)`
                          : 'بدون امتیاز'}
                      </span>
                      {template.myRating ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                          امتیاز شما: {template.myRating.toLocaleString('fa-IR')}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => handleUseTemplate(template)}
                      className="flex items-center gap-1 rounded-lg bg-sky-50 text-sky-600 px-3 py-1.5 text-xs font-semibold hover:bg-sky-100 transition-colors"
                    >
                      <Zap className="h-3 w-3" />
                      استفاده
                      {canUseTemplate ? (
                        <span className="text-[9px] text-indigo-400">۱ اعتبار</span>
                      ) : (
                        <Lock className="h-3 w-3 text-red-400" />
                      )}
                    </button>
                    <button
                      onClick={() => setPreviewTemplate(template)}
                      className="flex items-center gap-1 rounded-lg bg-slate-50 text-slate-600 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 transition-colors"
                    >
                      <Eye className="h-3 w-3" />
                      پیش‌نمایش
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6 shadow-glass text-center"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-500 mb-4">
            <FileText className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">
            {search ? 'قالبی یافت نشد' : 'هنوز قالبی وجود ندارد'}
          </p>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
            {search
              ? 'با کلمات دیگری جستجو کنید یا قالب جدیدی بسازید.'
              : 'اولین قالب را با کشف هوشمند بسازید تا در اینجا نمایش داده شود.'}
          </p>
          {!search && (
            <button
              onClick={() => setPage('discovery')}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-sky-700 transition-colors shadow-lg shadow-sky-500/30"
            >
              <Zap className="h-4 w-4" />
              شروع کشف هوشمند
            </button>
          )}
        </motion.div>
      )}

      {/* Preview modal */}
      <AnimatePresence>
        {previewTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setPreviewTemplate(null)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="glass rounded-3xl p-6 shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">پیش‌نمایش مکتوب</h3>
                <button onClick={() => setPreviewTemplate(null)} className="flex h-9 w-9 items-center justify-center rounded-xl glass text-slate-500 hover:text-slate-900 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm font-bold text-slate-800 mb-1">{previewTemplate.title}</p>
              <p className="text-xs text-slate-400 mb-3">{previewTemplate.rawRequest}</p>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-4">
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {(previewTemplate.sampleContent || 'پیش‌نمایشی موجود نیست')
                    .split(/(\{\{[^}]+\}\})/g)
                    .map((part, i) =>
                      part.startsWith('{{') && part.endsWith('}}') ? (
                        <span key={i} className="inline-block rounded-md bg-sky-100 text-sky-700 px-1.5 py-0.5 text-[11px] font-semibold mx-0.5 align-middle border border-sky-200">{part}</span>
                      ) : (
                        part
                      ),
                    )}
                </p>
              </div>
              <button
                onClick={() => { handleUseTemplate(previewTemplate); setPreviewTemplate(null); }}
                className="w-full rounded-xl bg-sky-600 text-white py-2.5 text-sm font-semibold hover:bg-sky-700 transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="h-4 w-4" />
                استفاده از این قالب
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile choice modal */}
      <AnimatePresence>
        {profileChoiceTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setProfileChoiceTemplate(null)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="glass rounded-3xl p-6 shadow-2xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-slate-900 mb-2">انتخاب پروفایل</h3>
              <p className="text-sm text-slate-500 mb-5 leading-relaxed">
                می‌خواهید اطلاعات کدام پروفایل در این مکتوب استفاده شود؟
              </p>

              <div className="space-y-2.5 max-h-[40vh] overflow-y-auto">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProfileId(p.id)}
                    className={`w-full flex items-center gap-3 rounded-2xl p-4 transition-colors text-right ${
                      selectedProfileId === p.id
                        ? 'bg-amber-50 hover:bg-amber-100 border-2 border-amber-300'
                        : 'bg-slate-50 hover:bg-slate-100 border-2 border-slate-200'
                    }`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 text-white">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{p.fullName}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {[p.jobTitle, p.organization].filter(Boolean).join(' · ') || 'بدون سمت'}
                      </p>
                    </div>
                    {selectedProfileId === p.id && (
                      <Check className="h-5 w-5 text-amber-600 shrink-0" />
                    )}
                  </button>
                ))}

                <button
                  onClick={() => setSelectedProfileId('')}
                  className={`w-full flex items-center gap-3 rounded-2xl p-4 transition-colors text-right ${
                    selectedProfileId === ''
                      ? 'bg-amber-50 hover:bg-amber-100 border-2 border-amber-300'
                      : 'bg-slate-50 hover:bg-slate-100 border-2 border-slate-200'
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
                    <UserX className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">بدون پروفایل</p>
                    <p className="text-xs text-slate-500 mt-0.5">تمام اطلاعات به‌صورت دستی وارد می‌شود</p>
                  </div>
                  {selectedProfileId === '' && (
                    <Check className="h-5 w-5 text-amber-600 shrink-0" />
                  )}
                </button>
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setProfileChoiceTemplate(null)}
                  className="flex-1 rounded-xl text-slate-500 hover:text-slate-700 py-2.5 text-sm font-medium transition-colors"
                >
                  انصراف
                </button>
                <button
                  onClick={() => {
                    const profile = profiles.find((p) => p.id === selectedProfileId) ?? null;
                    startConversation(profileChoiceTemplate, selectedProfileId !== '', profile);
                  }}
                  className="flex-1 rounded-xl bg-sky-600 text-white py-2.5 text-sm font-semibold hover:bg-sky-700 transition-colors shadow-lg shadow-sky-500/30"
                >
                  شروع مکالمه
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
