import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Send,
  Sparkles,
  Loader2,
  User,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Info,
  Star,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useProfileStore } from '@/store/profileStore';
import { useArchiveStore } from '@/store/archiveStore';
import { useDraftsStore } from '@/store/draftsStore';
import { useTemplateStore } from '@/store/templateStore';
import { usePlanStore } from '@/store/planStore';
import { useAuthStore } from '@/store/authStore';
import { generateLetter, aiScoreQuality, aiSuggestProfileFields } from '@/services/deepseek';
import type { Profile } from '@/types';
import {
  generateQuestion,
  validateAnswer,
  anonymizeContent,
  type ConversationState,
} from '@/services/aiEngine';
import { JalaliDatePicker } from '@/components/JalaliDatePicker';
import { normalizeUserInput, hasTextValue } from '@/utils/normalizeInput';
import { getFieldOptions } from '@/data/dataSources';
import { categoryLabels } from '@/data/templates';
import type { GeneratedLetter, LetterField } from '@/types';

export function ChatFlow() {
  const letterType = useAppStore((s) => s.activeLetterType);
  const setPage = useAppStore((s) => s.setPage);
  const fieldValues = useAppStore((s) => s.fieldValues);
  const setFieldValue = useAppStore((s) => s.setFieldValue);
  const resetFieldValues = useAppStore((s) => s.resetFieldValues);
  const chatMessages = useAppStore((s) => s.chatMessages);
  const addMessage = useAppStore((s) => s.addMessage);
  const resetChat = useAppStore((s) => s.resetChat);
  const setGeneratedContent = useAppStore((s) => s.setGeneratedContent);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const setIsGenerating = useAppStore((s) => s.setIsGenerating);
  const setEditingLetterId = useAppStore((s) => s.setEditingLetterId);
  const includeOptional = useAppStore((s) => s.includeOptional);
  const discoveredLetter = useAppStore((s) => s.discoveredLetter);
  const useProfileForLetter = useAppStore((s) => s.useProfileForLetter);
  const cachedChatPhase = useAppStore((s) => s.chatPhase);
  const setChatPhase = useAppStore((s) => s.setChatPhase);
  const cachedQualityResult = useAppStore((s) => s.cachedQualityResult);
  const setCachedQualityResult = useAppStore((s) => s.setCachedQualityResult);
  const cachedProfileSaveFields = useAppStore((s) => s.cachedProfileSaveFields);
  const setCachedProfileSaveFields = useAppStore((s) => s.setCachedProfileSaveFields);
  const cachedChatStep = useAppStore((s) => s.cachedChatStep);
  const setCachedChatStep = useAppStore((s) => s.setCachedChatStep);
  const cachedChatInput = useAppStore((s) => s.cachedChatInput);
  const setCachedChatInput = useAppStore((s) => s.setCachedChatInput);
  const resumingDraft = useAppStore((s) => s.resumingDraft);
  const setResumingDraft = useAppStore((s) => s.setResumingDraft);

  const profiles = useProfileStore((s) => s.profiles);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const addProfile = useProfileStore((s) => s.addProfile);
  const defaultProfile = profiles.find((p) => p.isDefault) ?? profiles[0];
  const addLetter = useArchiveStore((s) => s.addLetter);
  const updateLetter = useArchiveStore((s) => s.updateLetter);

  const upsertDraft = useDraftsStore((s) => s.upsertDraft);
  const removeDraft = useDraftsStore((s) => s.removeDraft);
  const setCurrentDraftId = useDraftsStore((s) => s.setCurrentDraftId);
  const currentDraftId = useDraftsStore((s) => s.currentDraftId);

  const addTemplate = useTemplateStore((s) => s.addTemplate);
  const updateRating = useTemplateStore((s) => s.updateRating);
  const sourceTemplateId = useAppStore((s) => s.sourceTemplateId);
  const setSourceTemplateId = useAppStore((s) => s.setSourceTemplateId);
  const savedTemplateId = useAppStore((s) => s.savedTemplateId);
  const setSavedTemplateId = useAppStore((s) => s.setSavedTemplateId);
  const canUseTemplate = usePlanStore((s) => s.canUseTemplate());
  const incrementTemplate = usePlanStore((s) => s.incrementTemplate);
  const openUpgradeModal = usePlanStore((s) => s.openUpgradeModal);
  const authUser = useAuthStore((s) => s.user);

  const [step, setStep] = useState(cachedChatStep);
  const [input, setInput] = useState(cachedChatInput);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [phase, setPhase] = useState<'chat' | 'profile-save' | 'scoring' | 'rating' | 'done'>(
    cachedChatPhase === 'chat' && chatMessages.length > 0 ? 'chat' : cachedChatPhase,
  );
  const [qualityResult, setQualityResult] = useState<{ score: number; feedback: string } | null>(
    cachedQualityResult,
  );
  const [profileSaveFields, setProfileSaveFields] = useState<{ key: string; label: string; value: string }[]>(
    cachedProfileSaveFields,
  );
  const [selectedSaveFields, setSelectedSaveFields] = useState<Set<string>>(new Set());
  const [saveTargetProfileId, setSaveTargetProfileId] = useState<string>(
    defaultProfile?.id ?? '',
  );
  const [saveMode, setSaveMode] = useState<'existing' | 'new'>('existing');
  const [newProfileName, setNewProfileName] = useState('');
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [templateRating, setTemplateRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const needsProfile = discoveredLetter?.needsProfile ?? useProfileForLetter ?? true;

  // Build ordered fields list, skipping fields already in profile
  const orderedFields: LetterField[] = letterType
    ? [
        ...letterType.fields.filter((f) => f.required),
        ...(includeOptional ? letterType.fields.filter((f) => f.optional) : []),
      ].filter((f) => {
        if (f.profileKey && defaultProfile && needsProfile) {
          const profileVal = defaultProfile.extraFields?.[f.profileKey] ??
            (f.profileKey === 'fullName' ? defaultProfile.fullName :
             f.profileKey === 'nationalId' ? defaultProfile.nationalId :
             f.profileKey === 'employeeCode' ? defaultProfile.employeeCode :
             f.profileKey === 'organization' ? defaultProfile.organization :
             f.profileKey === 'jobTitle' ? defaultProfile.jobTitle : '');
          if (profileVal) return false;
        }
        return true;
      })
    : [];

  // Initialize chat when a new letterType is set (from Discovery or Templates)
  const initializedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!letterType) return;
    if (initializedRef.current === letterType.id) return;
    initializedRef.current = letterType.id;

    // If resuming a draft, skip the reset — the Drafts page already restored state
    if (resumingDraft) {
      setResumingDraft(false);
      setConvState({
        step: cachedChatStep,
        fields: {
          required: letterType.fields.filter((f) => f.required),
          optional: includeOptional ? letterType.fields.filter((f) => f.optional) : [],
        },
        collectedValues: fieldValues,
        isComplete: false,
      });
      return;
    }

      // Always reset — covers both fresh starts and leftover state from prior sessions
      resetChat();
      resetFieldValues();
      setStep(0);
      setError('');
      setShowDatePicker(false);
      setPhase('chat');
      setQualityResult(null);
      setProfileSaveFields([]);
      setSelectedSaveFields(new Set());

      setConvState({
        step: 0,
        fields: {
          required: letterType.fields.filter((f) => f.required),
          optional: includeOptional ? letterType.fields.filter((f) => f.optional) : [],
        },
        collectedValues: {},
        isComplete: false,
      });

      const firstField = orderedFields[0];
      if (firstField) {
        const localQ = generateQuestion(firstField, defaultProfile, letterType, {});
        addMessage({ role: 'assistant', text: localQ, fieldId: firstField.id });
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterType]);

  // Sync step/phase/input to cache
  useEffect(() => { setCachedChatStep(step); }, [step, setCachedChatStep]);
  useEffect(() => { setChatPhase(phase); }, [phase, setChatPhase]);
  useEffect(() => { setCachedChatInput(input); }, [input, setCachedChatInput]);
  useEffect(() => { setCachedQualityResult(qualityResult); }, [qualityResult, setCachedQualityResult]);
  useEffect(() => { setCachedProfileSaveFields(profileSaveFields); }, [profileSaveFields, setCachedProfileSaveFields]);

  // Auto-scroll — deferred to next paint so new messages are in the DOM
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [chatMessages, phase, step, isGenerating]);

  // Auto-save draft when step or fieldValues change during chat
  const saveDraft = useCallback(async () => {
    if (phase !== 'chat' || !letterType) return;
    if (chatMessages.length === 0) return;

    await upsertDraft({
      id: currentDraftId ?? undefined,
      title: letterType.title,
      letter_type: letterType,
      discovered_letter: discoveredLetter ?? null,
      field_values: fieldValues,
      chat_messages: chatMessages,
      step,
      phase,
      use_profile: needsProfile,
      include_optional: includeOptional,
    });
  }, [phase, letterType, chatMessages, fieldValues, step, currentDraftId, upsertDraft, discoveredLetter, needsProfile, includeOptional]);

  useEffect(() => {
    if (phase === 'chat' && chatMessages.length > 1) {
      const timer = setTimeout(() => saveDraft(), 1000);
      return () => clearTimeout(timer);
    }
  }, [step, fieldValues, phase, chatMessages, saveDraft]);

  const [convState, setConvState] = useState<ConversationState | null>(null);

  if (!letterType) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
        <p className="text-sm text-slate-500 mb-4">قالبی انتخاب نشده است</p>
        <button
          onClick={() => setPage('templates')}
          className="rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold"
        >
          انتخاب قالب
        </button>
      </div>
    );
  }

  if (needsProfile && !defaultProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 mb-4">
          <User className="h-8 w-8" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-1">پروفایلی وجود ندارد</p>
        <p className="text-xs text-slate-400 mb-5">
          برای نوشتن این مکتوب ابتدا یک پروفایل ایجاد کنید
        </p>
        <button
          onClick={() => setPage('profile')}
          className="rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold"
        >
          ساخت پروفایل
        </button>
      </div>
    );
  }

  const currentField = orderedFields[step];
  const isLastStep = step >= orderedFields.length - 1;
  const hasInputValue = currentField?.type === 'select' || hasTextValue(normalizeUserInput(input));

  const handleSend = (skipped = false) => {
    if (!currentField) return;
    const currentInput = input;
    const normalizedInput = normalizeUserInput(currentInput);
    const hasValue = hasTextValue(normalizedInput);
    if (!skipped && !hasValue && currentField.type !== 'select') return;
    setError('');

    const value = skipped ? '' : normalizedInput.trim();

    if (currentField.required && !hasValue) {
      setError('این فیلد اجباری است.');
      return;
    }

    if (!skipped && hasValue) {
      const validation = validateAnswer(currentField, value);
      if (!validation.valid) {
        setError(validation.error ?? 'ورودی نامعتبر است.');
        return;
      }
    }

    if (hasValue) {
      setFieldValue(currentField.id, value);
    }

    const displayText = skipped ? '— رد شد —' : value;

    // If we're editing a previous step, update the existing user message instead of adding a new one
    if (editingStep !== null) {
      const userMsgIndex = chatMessages.findIndex(
        (m) => m.role === 'user' && m.fieldId === currentField.id,
      );
      if (userMsgIndex >= 0) {
        const newMessages = chatMessages.slice(0, userMsgIndex);
        newMessages.push({ id: crypto.randomUUID(), role: 'user', text: displayText, fieldId: currentField.id });
        useAppStore.getState().setChatMessages(newMessages);
      }
      setEditingStep(null);
    } else {
      addMessage({ role: 'user', text: displayText, fieldId: currentField.id });
    }
    setInput('');
    setCachedChatInput('');
    setShowDatePicker(false);

    const allValues = { ...fieldValues, [currentField.id]: value };

    if (isLastStep) {
      handleGenerate(allValues);
    } else {
      const nextField = orderedFields[step + 1];
      setTimeout(() => {
        setStep((s) => s + 1);
        const localQ = generateQuestion(nextField, defaultProfile, letterType, allValues);
        addMessage({ role: 'assistant', text: localQ, fieldId: nextField.id });
      }, 400);
    }
  };

  const handleSkip = () => {
    if (!currentField) return;
    if (currentField.required) {
      setError('این فیلد اجباری است و نمی‌توان آن را رد کرد.');
      return;
    }
    handleSend(true);
  };

  const handleStepBack = () => {
    if (step === 0) return;
    const prevStep = step - 1;
    const prevField = orderedFields[prevStep];
    setStep(prevStep);
    setEditingStep(prevStep);
    const prevValue = fieldValues[prevField?.id ?? ''] ?? '';
    setInput(prevValue);
    setError('');
    setShowDatePicker(false);
  };

  const handleEditStep = (targetStep: number) => {
    if (targetStep >= step) return;
    const targetField = orderedFields[targetStep];
    if (!targetField) return;
    setStep(targetStep);
    setEditingStep(targetStep);
    const prevValue = fieldValues[targetField.id] ?? '';
    setInput(prevValue);
    setError('');
    setShowDatePicker(false);
  };

  const handleGenerate = async (allValues: Record<string, string>) => {
    if (!canUseTemplate) {
      openUpgradeModal('no-template-credits');
      return;
    }
    setIsGenerating(true);
    addMessage({
      role: 'assistant',
      text: 'عالی! اکنون با کمک هوش مصنوعی متن نهایی را نگارش می‌کنم...',
    });

    try {
      const content = await generateLetter({
        letterType,
        profile: needsProfile ? defaultProfile : null,
        fieldValues: allValues,
      });

      const letter: GeneratedLetter = {
        id: crypto.randomUUID(),
        letterTypeId: letterType.id,
        templateId: letterType.id,
        templateTitle: letterType.title,
        profileId: needsProfile ? defaultProfile!.id : null,
        title: `${letterType.title} - ${new Date().toLocaleDateString('fa-IR')}`,
        content,
        fieldValues: allValues,
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const savedLetter = await addLetter(letter);
      setGeneratedContent(content);
      setEditingLetterId(savedLetter.id);

      if (authUser?.id) {
        await incrementTemplate(authUser.id);
      }

      addMessage({
        role: 'assistant',
        text: 'متن نهایی با موفقیت تولید شد!',
      });

      // Delete the draft since the conversation is now complete
      if (currentDraftId) {
        try { await removeDraft(currentDraftId); } catch { /* ignore */ }
        setCurrentDraftId(null);
      }

      // Quality scoring
      setPhase('scoring');
      const scoreResult = await aiScoreQuality(letterType, content, allValues);
      if (scoreResult) {
        setQualityResult(scoreResult);
        updateLetter(savedLetter.id, {
          qualityScore: scoreResult.score,
          qualityFeedback: scoreResult.feedback,
        });
      }

      // Auto-save template (not approved yet; admin must approve)
      try {
        const newId = await addTemplate({
          letterType,
          title: letterType.title,
          rawRequest: discoveredLetter?.rawRequest ?? letterType.title,
          rating: 0,
          ratingCount: 0,
          myRating: 0,
          creatorName: '',
          isOwner: true,
          sampleContent: anonymizeContent(content, letterType, needsProfile ? defaultProfile : null, allValues),
          sourceTemplateId: sourceTemplateId ?? null,
        } as any);
        if (newId) setSavedTemplateId(newId);
      } catch { /* ignore save errors */ }

      // Profile save suggestion
      const saveSuggestion = await aiSuggestProfileFields(allValues, letterType);
      if (saveSuggestion && saveSuggestion.fields.length > 0) {
        setProfileSaveFields(saveSuggestion.fields);
        setSelectedSaveFields(new Set(saveSuggestion.fields.map((f) => f.key)));
        setSaveTargetProfileId(defaultProfile?.id ?? '');
        setPhase('profile-save');
      } else if (sourceTemplateId) {
        setPhase('rating');
      } else {
        setPhase('done');
      }
    } catch {
      addMessage({
        role: 'assistant',
        text: 'خطا در تولید متن. لطفاً دوباره تلاش کنید.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectOption = (option: string) => {
    setInput(option);
  };

  const handleBack = () => {
    // Save draft before leaving if there's progress
    if (phase === 'chat' && chatMessages.length > 1 && letterType) {
      saveDraft();
    }
    resetChat();
    resetFieldValues();
    setCachedChatStep(0);
    setCachedChatInput('');
    setChatPhase('chat');
    setCachedQualityResult(null);
    setCachedProfileSaveFields([]);
    setCurrentDraftId(null);
    setPage('discovery');
  };

  const handleSaveProfileFields = async () => {
    if (saveMode === 'new') {
      if (!newProfileName.trim()) return;
      const newExtra: Record<string, string> = {};
      for (const field of profileSaveFields) {
        if (selectedSaveFields.has(field.key)) {
          newExtra[field.key] = field.value;
        }
      }
      const newProfile: Omit<Profile, 'id' | 'createdAt'> = {
        fullName: newProfileName.trim(),
        nationalId: '',
        employeeCode: '',
        organization: '',
        jobTitle: '',
        extraFields: newExtra,
        isDefault: profiles.length === 0,
      };
      await addProfile(newProfile);
      addMessage({
        role: 'assistant',
        text: `پروفایل جدید «${newProfileName.trim()}» با اطلاعات انتخاب‌شده ایجاد شد.`,
      });
      setPhase('done');
      return;
    }

    const targetProfile = profiles.find((p) => p.id === saveTargetProfileId);
    if (!targetProfile) {
      setPhase('done');
      return;
    }
    const newExtra: Record<string, string> = { ...targetProfile.extraFields };
    for (const field of profileSaveFields) {
      if (selectedSaveFields.has(field.key)) {
        newExtra[field.key] = field.value;
      }
    }
    await updateProfile(targetProfile.id, { extraFields: newExtra });
    addMessage({
      role: 'assistant',
      text: `اطلاعات انتخاب‌شده در پروفایل «${targetProfile.fullName}» ذخیره شد.`,
      });
    setPhase('done');
  };

  const handleSkipProfileSave = () => {
    if (sourceTemplateId) {
      setPhase('rating');
    } else {
      setPhase('done');
    }
  };

  const handleSubmitRating = async () => {
    if (!sourceTemplateId || templateRating < 1) return;
    await updateRating(sourceTemplateId, templateRating);
    setRatingSubmitted(true);
    setPhase('done');
  };

  // Get options for current select field
  const currentOptions = currentField
    ? getFieldOptions(currentField.dataSource, currentField.options)
    : [];

  return (
    <div className="flex flex-col h-[calc(100dvh-12rem)] lg:h-[calc(100dvh-5rem)] min-h-[420px]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4">
        <button
          onClick={handleBack}
          className="flex h-10 w-10 items-center justify-center rounded-xl glass text-slate-600 hover:text-slate-900 shadow-glass"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">{letterType.title}</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 truncate whitespace-nowrap overflow-hidden">
            {categoryLabels[letterType.category]}
            {phase === 'chat' && currentField
              ? ` · مرحله ${Math.min(step + 1, orderedFields.length)} از ${orderedFields.length}`
              : phase === 'scoring' ? ' · در حال ارزیابی کیفیت'
              : phase === 'profile-save' ? ' · ذخیره در پروفایل' : ''}
          </p>
        </div>
        {phase === 'chat' && orderedFields.length > 0 && (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {step > 0 && (
              <button
                onClick={handleStepBack}
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl glass text-slate-500 hover:text-indigo-600 shadow-glass transition-colors"
                title="مرحله قبل"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            <div className="flex gap-1 max-w-[120px] sm:max-w-none overflow-x-auto no-scrollbar">
              {orderedFields.map((f, i) => (
                <button
                  key={i}
                  onClick={() => i < step && handleEditStep(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 shrink-0 ${
                    i < step ? 'w-4 sm:w-6 bg-green-400 cursor-pointer hover:bg-green-500'
                      : i === step ? 'w-4 sm:w-6 bg-indigo-500'
                      : 'w-1.5 bg-slate-200'
                  }`}
                  title={f.label}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-4">
        {/* Profile reuse / no-profile notice */}
        {needsProfile && defaultProfile && (
          <div className="flex items-center gap-2 rounded-xl bg-indigo-50/60 border border-indigo-100 px-3 py-2 mb-2">
            <Info className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
            <p className="text-[11px] text-indigo-600">
              اطلاعات پروفایل «{defaultProfile.fullName}» به‌طور خودکار در متن استفاده می‌شود.
            </p>
          </div>
        )}
        {!needsProfile && (
          <div className="flex items-center gap-2 rounded-xl bg-cyan-50/60 border border-cyan-100 px-3 py-2 mb-2">
            <Info className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
            <p className="text-[11px] text-cyan-600">
              این مکتوب نیازی به اطلاعات پروفایل ندارد.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {chatMessages.map((msg) => {
            const isEditable = msg.role === 'user' && msg.fieldId && orderedFields.findIndex((f) => f.id === msg.fieldId) < step;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div className={`flex items-start gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      msg.role === 'assistant'
                        ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <Sparkles className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={`group/msg rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                      msg.role === 'assistant'
                        ? 'glass text-slate-800 shadow-glass'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {msg.text}
                    {isEditable && editingStep === null && phase === 'chat' && (
                      <button
                        onClick={() => {
                          const targetStep = orderedFields.findIndex((f) => f.id === msg.fieldId);
                          if (targetStep >= 0) handleEditStep(targetStep);
                        }}
                        className="opacity-0 group-hover/msg:opacity-100 transition-opacity inline-flex items-center gap-1 mr-2 text-indigo-200 hover:text-white"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Generating indicator */}
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end"
          >
            <div className="flex items-center gap-2 glass rounded-2xl px-4 py-3 shadow-glass">
              <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" />
              <span className="text-sm text-slate-600">در حال تولید متن نهایی ...</span>
            </div>
          </motion.div>
        )}

        {/* Scoring loading indicator */}
        {phase === 'scoring' && !qualityResult && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end"
          >
            <div className="flex items-center gap-2 glass rounded-2xl px-4 py-3 shadow-glass">
              <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" />
              <span className="text-sm text-slate-600">در حال ارزیابی کیفیت ...</span>
            </div>
          </motion.div>
        )}

        {/* Quality scoring result */}
        {phase === 'scoring' && qualityResult && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end"
          >
            <div className="glass rounded-2xl p-4 shadow-glass max-w-[85%]">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
                  <Star className="h-5 w-5 fill-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    امتیاز کیفیت: {qualityResult.score} از ۱۰۰
                  </p>
                  <p className="text-xs text-slate-500">{qualityResult.feedback}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Profile save suggestion */}
        {phase === 'profile-save' && profileSaveFields.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end"
          >
            <div className="glass rounded-2xl p-4 shadow-glass max-w-[85%]">
              <div className="flex items-center gap-2 mb-3">
                <Save className="h-4 w-4 text-indigo-500" />
                <p className="text-sm font-semibold text-slate-900">
                  ذخیره در پروفایل
                </p>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                این اطلاعات می‌تواند برای متن‌های بعدی ذخیره شود:
              </p>

              {/* Mode toggle: existing vs new */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setSaveMode('existing')}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                    saveMode === 'existing'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  پروفایل موجود
                </button>
                <button
                  onClick={() => setSaveMode('new')}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                    saveMode === 'new'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  پروفایل جدید
                </button>
              </div>

              {/* Existing profile selector */}
              {saveMode === 'existing' && profiles.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-slate-600 mb-1.5">ذخیره در پروفایل:</p>
                  <select
                    value={saveTargetProfileId}
                    onChange={(e) => setSaveTargetProfileId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus-ring"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName} {p.isDefault ? '(پیش‌فرض)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* New profile name input */}
              {saveMode === 'new' && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-slate-600 mb-1.5">نام پروفایل جدید:</p>
                  <input
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="مثلاً: پروفایل کاری"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-ring"
                    dir="rtl"
                  />
                </div>
              )}

              <div className="space-y-2 mb-4">
                {profileSaveFields.map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <button
                      onClick={() => {
                        setSelectedSaveFields((prev) => {
                          const next = new Set(prev);
                          if (next.has(field.key)) next.delete(field.key);
                          else next.add(field.key);
                          return next;
                        });
                      }}
                      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${
                        selectedSaveFields.has(field.key)
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {selectedSaveFields.has(field.key) && <CheckCircle2 className="h-3 w-3" />}
                    </button>
                    <span className="text-xs text-slate-700">
                      {field.label}: <span className="font-medium">{field.value}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveProfileFields}
                  className="flex-1 rounded-xl bg-indigo-600 text-white py-2.5 text-sm font-semibold hover:bg-indigo-700"
                >
                  ذخیره در پروفایل
                </button>
                <button
                  onClick={handleSkipProfileSave}
                  className="rounded-xl glass text-slate-500 px-4 py-2.5 text-sm font-medium hover:text-slate-900"
                >
                  رد کردن
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Rating phase: rate the source template */}
        {phase === 'rating' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end"
          >
            <div className="glass rounded-2xl p-5 shadow-glass max-w-[85%]">
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-5 w-5 text-amber-500" />
                <p className="text-sm font-bold text-slate-900">امتیازدهی به قالب</p>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                از این قالب استفاده کردید. لطفاً به آن امتیاز دهید تا میانگین به‌روزرسانی شود:
              </p>
              <div className="flex items-center justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setTemplateRating(star)}
                    className="transition-transform hover:scale-125"
                  >
                    <Star
                      className={`h-8 w-8 ${
                        star <= templateRating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-200'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSubmitRating}
                  disabled={templateRating < 1}
                  className="flex-1 rounded-xl bg-amber-500 text-white py-2.5 text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-40"
                >
                  ثبت امتیاز
                </button>
                <button
                  onClick={() => setPhase('done')}
                  className="rounded-xl glass text-slate-500 px-4 py-2.5 text-sm font-medium hover:text-slate-900"
                >
                  رد کردن
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Done phase: go to preview */}
        {phase === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end"
          >
            <div className="glass rounded-2xl p-5 shadow-glass max-w-[85%]">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <p className="text-sm font-bold text-slate-900">متن آماده است!</p>
              </div>

              {/* Go to preview */}
              <button
                onClick={() => setPage('preview')}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white py-3 text-sm font-semibold hover:bg-slate-800 transition-colors shadow-lg"
              >
                مشاهده متن نهایی
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input area — only during chat phase */}
      {phase === 'chat' && !isGenerating && currentField && (
        <div className="pt-3 border-t border-slate-200/60">
          {editingStep !== null && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
              <Pencil className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700">
                در حال ویرایش مرحله {editingStep + 1}. بعد از ثبت، مراحل بعدی مجدداً پرسیده می‌شوند.
              </p>
              <button
                onClick={() => {
                  setEditingStep(null);
                  setInput('');
                  setStep(orderedFields.length > 0 ? Math.min(step, orderedFields.length - 1) : 0);
                }}
                className="mr-auto text-amber-600 hover:text-amber-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {/* Date picker popover */}
          <AnimatePresence>
            {showDatePicker && currentField.type === 'date' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-3"
              >
                <JalaliDatePicker
                  value={input}
                  onChange={(v) => setInput(v)}
                  onClose={() => setShowDatePicker(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Select options (inline or from data source) */}
          {currentField.type === 'select' && currentOptions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 max-h-32 overflow-y-auto">
              {currentOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleSelectOption(opt)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                    input === opt
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                      : 'glass text-slate-600 hover:text-slate-900 shadow-glass'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* Default options for text/textarea/number fields — quick-pick buttons */}
          {currentField.type !== 'select' && currentField.type !== 'date' &&
           currentField.defaultOptions && currentField.defaultOptions.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-slate-400 mb-1.5">پاسخ‌های پیشنهادی (یا پاسخ خود را بنویسید):</p>
              <div className="flex flex-wrap gap-2">
                {currentField.defaultOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleSelectOption(opt)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-medium transition-all ${
                      input === opt
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                        : 'glass text-slate-600 hover:text-slate-900 shadow-glass'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 mb-2 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}

          {/* Input row */}
          <div className="flex items-end gap-2">
            {currentField.type === 'date' && (
              <button
                onClick={() => setShowDatePicker((v) => !v)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl glass text-indigo-600 shadow-glass hover:scale-105 transition-transform"
              >
                <Calendar className="h-5 w-5" />
              </button>
            )}
            {currentField.type === 'text' || currentField.type === 'textarea' || currentField.type === 'number' ? (
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={(e) => {
                  setIsComposing(false);
                  setInput((e.target as HTMLTextAreaElement).value);
                }}
                placeholder={currentField.placeholder ?? currentField.label}
                rows={1}
                className="flex-1 glass rounded-2xl py-3.5 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring shadow-glass resize-none min-h-[3rem] max-h-32 overflow-y-auto"
                dir="rtl"
                style={{ unicodeBidi: 'plaintext' }}
              />
            ) : (
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={(e) => {
                  setIsComposing(false);
                  setInput((e.target as HTMLInputElement).value);
                }}
                placeholder={
                  currentField.type === 'select'
                    ? 'یک گزینه انتخاب کنید'
                    : 'تاریخ شمسی (مثلاً ۱۴۰۵/۰۵/۱۵) یا تقویم را باز کنید'
                }
                type="text"
                disabled={currentField.type === 'select'}
                className="flex-1 glass rounded-2xl py-3.5 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring shadow-glass disabled:opacity-60"
                dir={currentField.type === 'date' ? 'ltr' : 'rtl'}
                style={{ unicodeBidi: 'plaintext' }}
              />
            )}
            <button
              onClick={() => handleSend()}
              disabled={!hasInputValue || isComposing}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30 disabled:opacity-40"
            >
              {isLastStep ? <CheckCircle2 className="h-5 w-5" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
          {!currentField.required && !isLastStep && (
            <button
              onClick={handleSkip}
              className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              این فیلد اختیاری است — رد کردن
            </button>
          )}
        </div>
      )}
    </div>
  );
}
