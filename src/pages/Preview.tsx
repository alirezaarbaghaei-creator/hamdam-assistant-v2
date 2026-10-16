import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Save,
  Pencil,
  Check,
  X,
  FileText,
  Star,
  Copy,
  Share2,
  Bookmark,
  Loader2,
  CheckCircle2,
  ThumbsUp,
  FileDown,
  Lock,
  Sparkles,
} from 'lucide-react';
import { getItem as storageGet, setItem as storageSet } from '@/lib/safeStorage';
import { useAppStore } from '@/store/appStore';
import { useArchiveStore } from '@/store/archiveStore';
import { useTemplateStore } from '@/store/templateStore';
import { useProfileStore } from '@/store/profileStore';
import { usePlanStore } from '@/store/planStore';
import { WATERMARK_TEXT } from '@/data/plans';
import { exportToPDF } from '@/services/pdfExport';
import { isNativeApp } from '@/lib/capacitor';
import { LetterEditor } from '@/components/editor/LetterEditor';
import { looksLikeHtml, htmlToPlainText, plainTextToHtml, sanitizeLetterHtml } from '@/lib/richtext';
import type { GeneratedLetter } from '@/types';

export function Preview() {
  const setPage = useAppStore((s) => s.setPage);
  const generatedContent = useAppStore((s) => s.generatedContent);
  const setGeneratedContent = useAppStore((s) => s.setGeneratedContent);
  const editingLetterId = useAppStore((s) => s.editingLetterId);
  const setEditingLetterId = useAppStore((s) => s.setEditingLetterId);
  const discoveredLetter = useAppStore((s) => s.discoveredLetter);
  const activeLetterType = useAppStore((s) => s.activeLetterType);

  const getLetter = useArchiveStore((s) => s.getLetter);
  const updateLetter = useArchiveStore((s) => s.updateLetter);

  const addTemplate = useTemplateStore((s) => s.addTemplate);
  const rateTemplate = useTemplateStore((s) => s.rateTemplate);
  const templates = useTemplateStore((s) => s.templates);

  const profiles = useProfileStore((s) => s.profiles);
  const defaultProfile = profiles.find((p) => p.isDefault) ?? profiles[0];

  const canEdit = usePlanStore((s) => s.canEdit());
  const hasWatermark = usePlanStore((s) => s.hasWatermark());
  const openUpgradeModal = usePlanStore((s) => s.openUpgradeModal);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(generatedContent);
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [templateRating, setTemplateRating] = useState(0);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [existingTemplateId, setExistingTemplateId] = useState<string | null>(null);
  const [letterRating, setLetterRating] = useState(0);
  const [letterRatingSaved, setLetterRatingSaved] = useState(false);
  const [ratingHover, setRatingHover] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRatingPopup, setShowRatingPopup] = useState(false);
  const [popupRating, setPopupRating] = useState(0);
  const [popupSubmitted, setPopupSubmitted] = useState(false);
  const ratingPopupKey = activeLetterType ? `kateb_rated_${activeLetterType.id}` : '';

  const paperRef = useRef<HTMLDivElement>(null);
  const [letter, setLetter] = useState<GeneratedLetter | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (editingLetterId) {
      const l = getLetter(editingLetterId);
      if (l) {
        setLetter(l);
        setGeneratedContent(l.content);
        setTitle(l.title);
        setEditContent(l.content);
        setLetterRating(l.userRating ?? 0);
      }
    }
  }, [editingLetterId, getLetter, setGeneratedContent]);

  // Check if this letter type was already saved as a template
  useEffect(() => {
    if (activeLetterType) {
      const existing = templates.find((t) => t.letterType.id === activeLetterType.id);
      if (existing) {
        setExistingTemplateId(existing.id);
        setTemplateRating(Math.round(existing.rating));
      }
    }
  }, [activeLetterType, templates]);

  const handleSave = () => {
    if (editingLetterId) {
      updateLetter(editingLetterId, {
        content: isEditing ? editContent : generatedContent,
        title,
        status: 'final',
      });
      setLetter((l) => (l ? { ...l, status: 'final' } : null));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const getOutputText = () => {
    const base = isEditing ? editContent : generatedContent;
    const text = htmlToPlainText(base);
    return hasWatermark ? text + WATERMARK_TEXT : text;
  };

  const handleCopy = async () => {
    const text = getOutputText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const maybeShowRatingPopup = () => {
    if (!activeLetterType || !ratingPopupKey) return;
    if (storageGet(ratingPopupKey) === '1') return;
    setTimeout(() => setShowRatingPopup(true), 800);
  };

  const handleShare = async () => {
    const text = getOutputText();
    const shareTitle = title || 'مکتوب';
    try {
      if (isNativeApp()) {
        const { Share } = await import(/* @vite-ignore */ '@capacitor/share');
        await Share.share({
          title: shareTitle,
          text,
          dialogTitle: 'اشتراک‌گذاری مکتوب',
        });
      } else if (navigator.share) {
        await navigator.share({ title: shareTitle, text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      maybeShowRatingPopup();
    } catch {
      // user cancelled or share failed — silently ignore
    }
  };

  const handleSaveTemplate = async () => {
    if (!activeLetterType || !discoveredLetter) return;
    if (existingTemplateId) {
      if (templateRating > 0) await rateTemplate(existingTemplateId, templateRating);
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 2000);
      return;
    }
    const id = await addTemplate({
      letterType: activeLetterType,
      title: activeLetterType.title,
      rawRequest: discoveredLetter.rawRequest,
      rating: templateRating,
      ratingCount: templateRating > 0 ? 1 : 0,
    });
    if (id) setExistingTemplateId(id);
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 2000);
  };

  const handleRateLetter = async (rating: number) => {
    setLetterRating(rating);
    if (editingLetterId) {
      await updateLetter(editingLetterId, { userRating: rating });
      setLetter((l) => (l ? { ...l, userRating: rating } : null));
    }
    setLetterRatingSaved(true);
    setTimeout(() => setLetterRatingSaved(false), 2500);
  };

  const handleBack = () => {
    setEditingLetterId(null);
    setPage('dashboard');
  };

  const displayContent = isEditing ? editContent : generatedContent;
  const displayHtml = sanitizeLetterHtml(
    looksLikeHtml(displayContent) ? displayContent : plainTextToHtml(displayContent),
  );
  const watermarkText = hasWatermark ? WATERMARK_TEXT : '';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">در حال بارگذاری مکتوب...</p>
        <p className="text-xs text-slate-400 mt-1">لطفاً صبر کنید</p>
      </div>
    );
  }

  if (!generatedContent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText className="h-12 w-12 text-slate-300 mb-4" />
        <p className="text-sm text-slate-500 mb-4">مکتوبی برای نمایش وجود ندارد</p>
        <button
          onClick={() => setPage('discovery')}
          className="rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold"
        >
          ساخت مکتوب جدید
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl glass text-slate-600 hover:text-slate-900 shadow-glass"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان مکتوب"
              className="w-full bg-transparent text-base font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:shrink-0">
          {isEditing ? (
            <>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setGeneratedContent(editContent);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30"
              >
                <Check className="h-4 w-4" />
                <span className="hidden sm:inline">تأیید</span>
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(generatedContent);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl glass text-slate-600 shadow-glass"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          ) : canEdit ? (
            <button
              onClick={() => {
                setEditContent(generatedContent);
                setIsEditing(true);
              }}
              className="flex items-center gap-1.5 rounded-xl glass text-slate-600 px-4 py-2.5 text-sm font-semibold hover:text-slate-900 shadow-glass"
            >
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">ویرایش</span>
            </button>
          ) : (
            <button
              onClick={() => openUpgradeModal('edit-letter')}
              className="flex items-center gap-1.5 rounded-xl glass text-slate-400 px-4 py-2.5 text-sm font-semibold hover:text-slate-600 shadow-glass"
              title="ویرایش متن فقط در طرح‌های پولی"
            >
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">ویرایش</span>
            </button>
          )}

          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-xl glass text-slate-600 px-4 py-2.5 text-sm font-semibold hover:text-slate-900 shadow-glass"
          >
            {saved ? <Check className="h-4 w-4 text-green-500" /> : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline">{saved ? 'ذخیره شد' : 'ذخیره'}</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-xl glass text-slate-600 px-4 py-2.5 text-sm font-semibold hover:text-slate-900 shadow-glass"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            <span className="hidden sm:inline">{copied ? 'کپی شد' : 'کپی'}</span>
          </button>

          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-800 transition-colors shadow-lg"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">اشتراک‌گذاری</span>
          </button>

          <button
            onClick={async () => {
              setIsExporting(true);
              setPdfMessage(null);
              try {
                const rawContent = isEditing ? editContent : generatedContent;
                // Rich (HTML) bodies keep their formatting in PDF — the exporter
                // appends the watermark itself. Legacy plain text keeps the old path.
                const pdfContent = looksLikeHtml(rawContent) ? rawContent : getOutputText();
                const result = await exportToPDF(null, title || 'مکتوب', {
                  content: pdfContent,
                  watermark: hasWatermark ? WATERMARK_TEXT : '',
                });
                if (result.downloaded) {
                  setPdfMessage({
                    ok: true,
                    text: isNativeApp()
                      ? result.opened
                        ? 'PDF در پوشهٔ Download ذخیره و باز شد'
                        : result.shared
                          ? 'PDF آماده است — از پنجره اشتراک‌گذاری، ذخیره یا ارسال کنید'
                          : 'فایل PDF در پوشهٔ Download ذخیره شد'
                      : 'فایل PDF دانلود شد',
                  });
                } else {
                  setPdfMessage({ ok: false, text: 'دانلود PDF ناموفق بود. دوباره تلاش کنید.' });
                }
                maybeShowRatingPopup();
              } catch (err) {
                console.error('[pdf] export failed', err);
                setPdfMessage({ ok: false, text: 'دانلود PDF ناموفق بود. دوباره تلاش کنید.' });
              } finally {
                setIsExporting(false);
                setTimeout(() => setPdfMessage(null), 4000);
              }
            }}
            disabled={isExporting}
            aria-label="دانلود PDF"
            title="دانلود PDF"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FileDown className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* PDF notices — outside the button row so they get the full width */}
      {(hasWatermark || pdfMessage) && (
        <div className="space-y-1 text-center">
          {hasWatermark && (
            <p className="text-[11px] leading-relaxed text-amber-600">
              خروجی PDF در طرح آزمایشی با واترمارک همراه است
            </p>
          )}
          {pdfMessage && (
            <p
              role="status"
              aria-live="polite"
              className={`text-xs leading-relaxed ${pdfMessage.ok ? 'text-green-600' : 'text-red-500'}`}
            >
              {pdfMessage.text}
            </p>
          )}
        </div>
      )}

      {/* Quality badge */}
      {letter?.qualityScore != null && (
        <div className="flex items-center gap-3 glass rounded-2xl px-4 py-3 shadow-glass">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
            <Star className="h-5 w-5 fill-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">
              امتیاز کیفیت: {letter.qualityScore} از ۱۰۰
            </p>
            {letter.qualityFeedback && (
              <p className="text-xs text-slate-500">{letter.qualityFeedback}</p>
            )}
          </div>
          <span className={`text-[10px] font-medium px-2.5 py-1 rounded-md ${
            letter.qualityScore >= 80 ? 'bg-green-50 text-green-600'
              : letter.qualityScore >= 60 ? 'bg-amber-50 text-amber-600'
              : 'bg-red-50 text-red-600'
          }`}>
            {letter.qualityScore >= 80 ? 'عالی' : letter.qualityScore >= 60 ? 'متوسط' : 'ضعیف'}
          </span>
        </div>
      )}

      {/* Template rating + save card */}
      {activeLetterType && (
        <div className="glass rounded-2xl p-4 shadow-glass">
          <div className="flex items-center gap-2 mb-3">
            <Bookmark className="h-4 w-4 text-indigo-500" />
            <p className="text-sm font-bold text-slate-900">امتیازدهی و ذخیره قالب</p>
            {existingTemplateId && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-green-50 text-green-600">
                ذخیره‌شده
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setTemplateRating(star)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-6 w-6 ${
                      star <= templateRating
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <button
              onClick={handleSaveTemplate}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                templateSaved
                  ? 'bg-green-50 text-green-600'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/30'
              }`}
            >
              {templateSaved ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  ذخیره شد
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4" />
                  {existingTemplateId ? 'به‌روزرسانی امتیاز' : 'ذخیره قالب'}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Paper */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex justify-center"
      >
        <div
          ref={paperRef}
          className="paper rounded-2xl w-full max-w-2xl p-4 sm:p-8 md:p-12"
        >
          {isEditing ? (
            <LetterEditor
              value={editContent}
              onChange={setEditContent}
              // Tapping «ویرایش» jumps straight to a full-page editor: on a phone
              // an editor squeezed into a scrolling page leaves no room to type,
              // and the wrapped toolbar only fits full width.
              startFullscreen
              fullscreenTitle={title || 'ویرایش مکتوب'}
              onConfirm={() => {
                setIsEditing(false);
                setGeneratedContent(editContent);
              }}
              onCancel={() => {
                setIsEditing(false);
                setEditContent(generatedContent);
              }}
            />
          ) : (
            <>
              <div
                className="kateb-letter-body text-sm text-slate-800 leading-loose font-sans"
                dir="rtl"
                dangerouslySetInnerHTML={{ __html: displayHtml }}
              />
              {watermarkText && (
                <span className="text-slate-400 text-xs mt-4 block border-t border-slate-200 pt-3">
                  {watermarkText.replace(/^\n+/, '')}
                </span>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* Letter rating card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-2xl p-5 shadow-glass"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
            <ThumbsUp className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">امتیازدهی به مکتوب</p>
            <p className="text-xs text-slate-500 mt-0.5">از کیفیت متن تولیدشده چه فکر می‌کنید؟</p>
          </div>
          {letterRatingSaved && (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              ثبت شد
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 justify-center">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => handleRateLetter(star)}
              onMouseEnter={() => setRatingHover(star)}
              onMouseLeave={() => setRatingHover(0)}
              className="transition-transform hover:scale-125 active:scale-95 p-1"
            >
              <Star
                className={`h-8 w-8 transition-colors ${
                  star <= (ratingHover || letterRating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-slate-300'
                }`}
              />
            </button>
          ))}
        </div>
        {letterRating > 0 && (
          <p className="text-center text-xs text-slate-500 mt-2">
            {letterRating === 5 ? 'عالی' : letterRating === 4 ? 'خوب' : letterRating === 3 ? 'متوسط' : letterRating === 2 ? 'ضعیف' : 'بسیار ضعیف'}
          </p>
        )}
      </motion.div>

      {/* One-time template rating popup — shown after PDF export or share */}
      <AnimatePresence>
        {showRatingPopup && activeLetterType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowRatingPopup(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="glass rounded-3xl p-6 shadow-glass-lg w-full max-w-sm text-center"
              onClick={(e) => e.stopPropagation()}
            >
              {!popupSubmitted ? (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white mx-auto mb-4">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">به این قالب امتیاز دهید</h3>
                  <p className="text-xs text-slate-500 mb-5">
                    از قالب «{activeLetterType.title}» استفاده کردید. امتیاز شما کمک می‌کند قالب‌های بهتر پیدا شوند.
                  </p>
                  <div className="flex items-center justify-center gap-2 mb-5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setPopupRating(star)}
                        className="transition-transform hover:scale-125 active:scale-95"
                      >
                        <Star
                          className={`h-9 w-9 ${
                            star <= popupRating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-200'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (popupRating < 1) return;
                        if (existingTemplateId) {
                          await rateTemplate(existingTemplateId, popupRating);
                        } else {
                          await handleSaveTemplate();
                        }
                        storageSet(ratingPopupKey, '1');
                        setPopupSubmitted(true);
                        setTimeout(() => setShowRatingPopup(false), 2000);
                      }}
                      disabled={popupRating < 1}
                      className="flex-1 rounded-xl bg-amber-500 text-white py-2.5 text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-40"
                    >
                      ثبت امتیاز
                    </button>
                    <button
                      onClick={() => {
                        storageSet(ratingPopupKey, '1');
                        setShowRatingPopup(false);
                      }}
                      className="rounded-xl glass text-slate-500 px-4 py-2.5 text-sm font-medium hover:text-slate-900"
                    >
                      بعدا
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-500 mx-auto mb-4">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">با تشکر از شما!</h3>
                  <p className="text-xs text-slate-500">امتیاز شما ثبت شد.</p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
