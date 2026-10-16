import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Sparkles,
  Search,
  Check,
  Loader2,
  FileText,
  Lightbulb,
  ChevronLeft,
  AlertCircle,
  User,
  UserX,
  Lock,
  LayoutTemplate,
  Star,
  Calendar,
  PenLine,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useProfileStore } from '@/store/profileStore';
import { useAuthStore } from '@/store/authStore';
import { useTemplateStore } from '@/store/templateStore';
import { usePlanStore } from '@/store/planStore';
import { aiDiscoverLetterType, type AIDiscoveryResult, NetworkOfflineError, NetworkRequestError } from '@/services/deepseek';
import { isOnline } from '@/lib/network';
import { categoryLabels, categoryColors } from '@/data/templates';
import type { LetterType, LetterField, SavedTemplate } from '@/types';

export function Discovery() {
  const setPage = useAppStore((s) => s.setPage);
  const setActiveLetterType = useAppStore((s) => s.setActiveLetterType);
  const setDiscoveredLetter = useAppStore((s) => s.setDiscoveredLetter);
  const setIncludeOptional = useAppStore((s) => s.setIncludeOptional);
  const setUseProfileForLetter = useAppStore((s) => s.setUseProfileForLetter);
  const setSourceTemplateId = useAppStore((s) => s.setSourceTemplateId);

  const cachedDiscovery = useAppStore((s) => s.cachedDiscovery);
  const setCachedDiscovery = useAppStore((s) => s.setCachedDiscovery);
  const cachedQuery = useAppStore((s) => s.cachedDiscoveryQuery);
  const setCachedQuery = useAppStore((s) => s.setCachedDiscoveryQuery);

  const profiles = useProfileStore((s) => s.profiles);
  const defaultProfile = profiles.find((p) => p.isDefault) ?? profiles[0];

  const templates = useTemplateStore((s) => s.templates);
  const loadTemplates = useTemplateStore((s) => s.loadTemplates);

  const user = useAuthStore((s) => s.user);
  const aiAssistantUsage = usePlanStore((s) => s.aiAssistantUsage);
  const templateUsage = usePlanStore((s) => s.templateUsage);
  const canUseAiAssistant = usePlanStore((s) => s.canUseAiAssistant());
  const canUseTemplate = usePlanStore((s) => s.canUseTemplate());
  const getAiAssistantLimit = usePlanStore((s) => s.getAiAssistantLimit);
  const getTemplateLimit = usePlanStore((s) => s.getTemplateLimit);
  const openUpgradeModal = usePlanStore((s) => s.openUpgradeModal);
  const incrementAiAssistant = usePlanStore((s) => s.incrementAiAssistant);
  const incrementTemplate = usePlanStore((s) => s.incrementTemplate);
  const [query, setQuery] = useState(cachedQuery);
  const queryRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AIDiscoveryResult | null>(cachedDiscovery);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [showProfileChoice, setShowProfileChoice] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [matchedTemplates, setMatchedTemplates] = useState<SavedTemplate[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aiRemaining = getAiAssistantLimit() - aiAssistantUsage;
  const templateRemaining = getTemplateLimit() - templateUsage;

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim() || query.trim().length < 3) {
      setMatchedTemplates([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      const q = query.trim().toLowerCase();
      const matches = templates.filter((t) => {
        const title = t.title.toLowerCase();
        const raw = t.rawRequest.toLowerCase();
        const cat = t.letterType.category.toLowerCase();
        const kw = (t.letterType.keywords ?? []).join(' ').toLowerCase();
        return title.includes(q) || raw.includes(q) || cat.includes(q) || kw.includes(q);
      }).slice(0, 4);
      setMatchedTemplates(matches);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, templates]);

  const examples = [
    'میخوام مرخصی بگیرم',
    'درخواست انتقال به بخش فروش دارم',
    'یه نامه برای پیگیری حقوق میخوام',
    'قرارداد اجاره مغازه میخوام',
    'قولنامه فروش ماشین میخوام',
    'استعفا میدم',
  ];

  const handleAnalyze = async () => {
    const currentQuery = query;
    if (!currentQuery.trim()) return;
    if (!canUseAiAssistant) {
      openUpgradeModal('no-ai-credits');
      return;
    }

    if (!isOnline()) {
      setError('اتصال اینترنت برقرار نیست. برای ارسال درخواست به هوش مصنوعی، ابتدا اتصال اینترنت خود را بررسی کنید.');
      return;
    }

    setIsAnalyzing(true);
    setResult(null);
    setCachedDiscovery(null);
    setError('');
    setRetryCount(0);

    let aiResult: AIDiscoveryResult | null = null;
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        setRetryCount(attempt);
        aiResult = await aiDiscoverLetterType(currentQuery);
        if (aiResult) break;
      }
    } catch (err) {
      if (err instanceof NetworkOfflineError) {
        setError('اتصال اینترنت برقرار نیست. لطفاً اتصال اینترنت خود را بررسی کنید و دوباره تلاش کنید.');
      } else if (err instanceof NetworkRequestError) {
        setError('ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت خود را بررسی کنید و دوباره تلاش کنید.');
      } else {
        setError('متأسفانه هوش مصنوعی پس از ۳ بار تلاش نتوانست درخواست شما را تحلیل کند. لطفاً با جزئیات بیشتری بنویسید.');
      }
      setIsAnalyzing(false);
      return;
    }

    if (aiResult) {
      if (user?.id) {
        await incrementAiAssistant(user.id);
      }
      setResult(aiResult);
      setCachedDiscovery(aiResult);
      setCachedQuery(currentQuery);
    } else {
      setError('متأسفانه هوش مصنوعی پس از ۳ بار تلاش نتوانست درخواست شما را تحلیل کند. لطفاً با جزئیات بیشتری بنویسید.');
    }

    setIsAnalyzing(false);
  };

  const handleConfirm = () => {
    if (!result) return;
    setSelectedProfileId(defaultProfile?.id ?? '');
    setShowProfileChoice(true);
  };

  const startConversation = (useProfile: boolean) => {
    if (!result) return;

    const fields: LetterField[] = result.fields.map((f) => ({
      ...f,
      required: f.required ?? false,
      optional: f.optional ?? !f.required,
    }));

    const letterType: LetterType = {
      id: crypto.randomUUID(),
      title: result.title,
      category: result.category,
      description: result.description,
      icon: 'FileText',
      fields,
      keywords: [],
      promptHint: '',
      needsProfile: useProfile,
      tone: result.tone,
    };

    setActiveLetterType(letterType);
    setUseProfileForLetter(useProfile);
    setDiscoveredLetter({
      letterType,
      title: `${result.title} - ${new Date().toLocaleDateString('fa-IR')}`,
      category: result.category,
      requiredFields: fields.filter((f) => f.required),
      optionalFields: fields.filter((f) => f.optional),
      confidence: result.confidence,
      rawRequest: query,
      needsProfile: useProfile,
      tone: result.tone,
    });
    setIncludeOptional(true);
    setShowProfileChoice(false);
    setPage('chat');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPage('dashboard')}
          className="flex h-10 w-10 items-center justify-center rounded-xl glass text-slate-600 hover:text-slate-900 shadow-glass"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900">کشف هوشمند مکتوب</h2>
          <p className="text-sm text-slate-500">درخواست خود را به زبان طبیعی بنویسید</p>
        </div>
        <div className="mr-auto flex items-center gap-1.5 rounded-xl bg-cyan-50 border border-cyan-100 px-3 py-2 shrink-0">
          <Zap className="h-4 w-4 text-cyan-500" />
          <span className="text-sm font-bold text-cyan-700">{aiRemaining.toLocaleString('fa-IR')} اعتبار هوشمند</span>
        </div>
      </div>

      {/* Input card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-5 shadow-glass"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">دستیار هوشمند</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              نوع مکتوب، فیلدهای مورد نیاز و روند مکالمه به‌طور خودکار توسط هوش مصنوعی طراحی می‌شود.
            </p>
            <p className="text-[10px] text-cyan-600 mt-1 flex items-center gap-1">
              <Zap className="h-3 w-3" /> ۱ اعتبار هوشمند برای هر تحلیل
            </p>
          </div>
        </div>

        {!canUseAiAssistant && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
            <Lock className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600 flex-1">
              اعتبار کافی ندارید. برای کشف هوشمند به اعتبار نیاز دارید.
            </p>
            <button
              onClick={() => setPage('pricing')}
              className="flex items-center gap-1 rounded-lg bg-indigo-500 text-white px-3 py-1.5 text-xs font-semibold hover:bg-indigo-600 transition-colors shrink-0"
            >
              <Sparkles className="h-3 w-3" />
              ارتقای طرح
            </button>
          </div>
        )}

        <textarea
          ref={queryRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(e) => {
            setIsComposing(false);
            setQuery((e.target as HTMLTextAreaElement).value);
          }}
          placeholder="مثلاً: میخوام از ۱۵ مرداد تا ۲۰ مرداد مرخصی استحقاقی بگیرم..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring resize-none min-h-[100px]"
          dir="rtl"
          style={{ unicodeBidi: 'plaintext' }}
        />

        <button
          onClick={handleAnalyze}
          disabled={!query.trim() || isAnalyzing || !canUseAiAssistant || isComposing}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600 text-white py-3 text-sm font-semibold hover:bg-amber-700 transition-colors shadow-lg shadow-amber-500/30 disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {retryCount > 0
                ? `تلاش مجدد (${retryCount}/۳)...`
                : 'در حال تحلیل با هوش مصنوعی...'}
              <span className="text-xs opacity-80">این کار ممکن است طول بکشد، لطفاً صبر کنید.</span>
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              تحلیل درخواست
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600 flex-1">{error}</p>
          </div>
        )}

        {/* Dynamic template matches */}
        {matchedTemplates.length > 0 && !result && !isAnalyzing && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <LayoutTemplate className="h-3.5 w-3.5 text-indigo-500" />
              <p className="text-xs text-slate-500">قالب‌های مشابه یافت‌شده:</p>
            </div>
            <div className="space-y-2">
              {matchedTemplates.map((t) => {
                return (
                  <div
                    key={t.id}
                    className="w-full rounded-xl bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 px-4 py-3 transition-colors text-right group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${categoryColors[t.letterType.category]} text-white`}>
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{t.title}</p>
                        <p className="text-xs text-slate-400 truncate">{t.rawRequest}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 pr-12 flex-wrap">
                      {t.rating > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {t.rating.toLocaleString('fa-IR')}
                          <span className="text-slate-400 font-normal">({t.ratingCount.toLocaleString('fa-IR')})</span>
                        </span>
                      )}
                      {t.createdAt > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Calendar className="h-3 w-3" />
                          {new Date(t.createdAt).toLocaleDateString('fa-IR')}
                        </span>
                      )}
                      {t.creatorName && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <PenLine className="h-3 w-3" />
                          {t.creatorName}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        if (!canUseTemplate) {
                          openUpgradeModal('no-template-credits');
                          return;
                        }
                        if (user?.id) {
                          await incrementTemplate(user.id);
                        }
                        setSourceTemplateId(t.id);
                        setActiveLetterType(t.letterType);
                        setUseProfileForLetter(t.letterType.needsProfile ?? false);
                        setDiscoveredLetter({
                          letterType: t.letterType,
                          title: `${t.letterType.title} - ${new Date().toLocaleDateString('fa-IR')}`,
                          category: t.letterType.category,
                          requiredFields: t.letterType.fields.filter((f) => f.required),
                          optionalFields: t.letterType.fields.filter((f) => f.optional),
                          confidence: 1,
                          rawRequest: t.rawRequest,
                          needsProfile: t.letterType.needsProfile ?? false,
                        });
                        setIncludeOptional(true);
                        setPage('chat');
                      }}
                      disabled={!canUseTemplate}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 text-white py-2 text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40"
                    >
                      <LayoutTemplate className="h-3.5 w-3.5" />
                      {canUseTemplate ? `استفاده از قالب (${templateRemaining.toLocaleString('fa-IR')} اعتبار)` : 'اعتبار قالب کافی نیست'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Example chips */}
        {!result && !isAnalyzing && !error && (
          <div className="mt-4">
            <p className="text-xs text-slate-400 mb-2">یا یک نمونه را انتخاب کنید:</p>
            <div className="flex flex-wrap gap-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setQuery(ex)}
                  className="rounded-lg bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-600 px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Result */}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="glass rounded-2xl p-5 shadow-glass">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">نتیجه تحلیل هوش مصنوعی</h3>
              </div>

              <div className="flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${categoryColors[result.category]} text-white shadow-lg`}
                >
                  <FileText className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900">{result.title}</h4>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                      {categoryLabels[result.category]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{result.description}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200/60">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">فیلدهای ضروری:</p>
                    <ul className="space-y-1">
                      {result.fields.filter((f) => f.required).map((f) => (
                        <li key={f.id} className="text-xs text-slate-500 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          {f.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {result.fields.some((f) => f.optional) && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">اختیاری:</p>
                      <ul className="space-y-1">
                        {result.fields.filter((f) => f.optional).map((f) => (
                          <li key={f.id} className="text-xs text-slate-400 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                            {f.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleConfirm}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white py-3.5 text-sm font-semibold hover:bg-slate-800 transition-colors shadow-lg"
            >
              <Check className="h-4 w-4" />
              تأیید و شروع مکالمه
              <ChevronLeft className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile choice modal */}
      <AnimatePresence>
        {showProfileChoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowProfileChoice(false)}
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
                  onClick={() => setShowProfileChoice(false)}
                  className="flex-1 rounded-xl text-slate-500 hover:text-slate-700 py-2.5 text-sm font-medium transition-colors"
                >
                  انصراف
                </button>
                <button
                  onClick={() => startConversation(selectedProfileId !== '')}
                  className="flex-1 rounded-xl bg-amber-600 text-white py-2.5 text-sm font-semibold hover:bg-amber-700 transition-colors shadow-lg shadow-amber-500/30"
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
