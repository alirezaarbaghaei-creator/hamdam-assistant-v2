import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Plus,
  Pencil,
  Trash2,
  Star,
  Check,
  X,
  Briefcase,
  IdCard,
  Building2,
  Hash,
  Crown,
  Gift,
  Zap,
  Receipt,
  CreditCard,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { useProfileStore } from '@/store/profileStore';
import { useAuthStore } from '@/store/authStore';
import { usePlanStore } from '@/store/planStore';
import { useAppStore } from '@/store/appStore';
import { PLANS, formatToman, type PlanId } from '@/data/plans';
import { planTransactionsListApi } from '@/lib/api';
import type { Profile } from '@/types';

const emptyForm = {
  fullName: '',
  nationalId: '',
  employeeCode: '',
  organization: '',
  jobTitle: '',
};

export function ProfilePage() {
  const profiles = useProfileStore((s) => s.profiles);
  const addProfile = useProfileStore((s) => s.addProfile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const deleteProfile = useProfileStore((s) => s.deleteProfile);
  const setDefault = useProfileStore((s) => s.setDefault);

  const user = useAuthStore((s) => s.user);
  const planType = usePlanStore((s) => s.planType);
  const expiresAt = usePlanStore((s) => s.expiresAt);
  const aiAssistantUsage = usePlanStore((s) => s.aiAssistantUsage);
  const templateUsage = usePlanStore((s) => s.templateUsage);
  const getAiAssistantLimit = usePlanStore((s) => s.getAiAssistantLimit);
  const getTemplateLimit = usePlanStore((s) => s.getTemplateLimit);
  const getProfileLimit = usePlanStore((s) => s.getProfileLimit);
  const canAddProfile = usePlanStore((s) => s.canAddProfile);
  const setPage = useAppStore((s) => s.setPage);
  const [transactions, setTransactions] = useState<any[]>([]);

  const currentPlan = PLANS.find((p) => p.id === planType);
  const aiLimit = getAiAssistantLimit();
  const templateLimit = getTemplateLimit();
  const profileLimit = getProfileLimit();
  const profileLimitReached = !canAddProfile(profiles.length);

  const planIcons: Record<PlanId, typeof Gift> = { free: Gift, basic: Zap, pro: Crown };
  const PlanIcon = planIcons[planType];

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const data = await planTransactionsListApi();
        setTransactions(data);
      } catch { setTransactions([]); }
    })();
  }, [user?.id]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (p: Profile) => {
    setForm({
      fullName: p.fullName,
      nationalId: p.nationalId,
      employeeCode: p.employeeCode,
      organization: p.organization,
      jobTitle: p.jobTitle,
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) return;
    if (editingId) {
      updateProfile(editingId, form);
    } else {
      if (!canAddProfile(profiles.length)) return;
      addProfile(form);
    }
    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);
  };

  const fields: { key: keyof typeof form; label: string; icon: typeof User; placeholder: string }[] = [
    { key: 'fullName', label: 'نام و نام خانوادگی', icon: User, placeholder: 'مثلاً: علی محمدی' },
    { key: 'nationalId', label: 'کد ملی', icon: IdCard, placeholder: '۱۰ رقم' },
    { key: 'employeeCode', label: 'کد پرسنلی', icon: Hash, placeholder: 'کد پرسنلی' },
    { key: 'organization', label: 'سازمان / واحد', icon: Building2, placeholder: 'نام سازمان' },
    { key: 'jobTitle', label: 'سمت شغلی', icon: Briefcase, placeholder: 'مثلاً: کارشناس ارشد' },
  ];

  return (
    <div className="space-y-5">
      {/* Subscription card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`glass rounded-2xl p-5 shadow-glass ${planType === 'pro' ? 'ring-2 ring-indigo-300' : ''}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${currentPlan?.gradient ?? 'from-slate-400 to-slate-600'} text-white shadow-lg`}>
              <PlanIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500">نوع اشتراک</p>
              <p className="text-lg font-bold text-slate-900">طرح {currentPlan?.name ?? 'آزمایشی'}</p>
              {expiresAt ? (
                <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" />
                  انقضا: {new Date(expiresAt).toLocaleDateString('fa-IR')}
                </p>
              ) : planType === 'free' && (
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">بدون انقضا</p>
              )}
            </div>
          </div>
          {planType !== 'pro' && (
            <button
              onClick={() => setPage('pricing')}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30"
            >
              <Crown className="h-4 w-4" />
              ارتقای طرح
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="h-3.5 w-3.5 text-cyan-500" />
              <span className="text-xs font-semibold text-cyan-700">دستیار هوشمند</span>
            </div>
            <p className="text-sm font-bold text-cyan-800">
              {(aiLimit - aiAssistantUsage).toLocaleString('fa-IR')} / {aiLimit.toLocaleString('fa-IR')} باقی‌مانده
            </p>
          </div>
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Gift className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-indigo-700">قالب‌ها</span>
            </div>
            <p className="text-sm font-bold text-indigo-800">
              {(templateLimit - templateUsage).toLocaleString('fa-IR')} / {templateLimit.toLocaleString('fa-IR')} باقی‌مانده
            </p>
          </div>
        </div>
      </motion.div>

      {/* Payment history */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-5 shadow-glass"
      >
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-900">تاریخچه پرداخت‌ها</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="text-center py-6">
            <CreditCard className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">هنوز پرداختی ثبت نشده است</p>
            {planType === 'free' && (
              <button
                onClick={() => setPage('pricing')}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                مشاهده طرح‌ها
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const txPlan = PLANS.find((p) => p.id === tx.plan_id);
              const isPaid = tx.status === 'paid';
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isPaid ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'
                    }`}>
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700">طرح {txPlan?.name ?? tx.plan_id}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(tx.created_at).toLocaleDateString('fa-IR')}
                        {tx.ref_id && ` · ${tx.ref_id}`}
                        {tx.payment_provider && ` · ${tx.payment_provider === 'bazaar' ? 'کافه‌بازار' : 'زرین‌پال'}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-700">{formatToman(tx.amount_toman)} ت</p>
                    <span className={`text-[10px] font-medium ${
                      isPaid ? 'text-emerald-600' : tx.status === 'pending' ? 'text-amber-500' : 'text-red-500'
                    }`}>
                      {isPaid ? 'موفق' : tx.status === 'pending' ? 'در انتظار' : 'ناموفق'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">پروفایل‌ها</h2>
          <p className="text-sm text-slate-500">
            {profileLimit === Infinity
              ? `${profiles.length.toLocaleString('fa-IR')} پروفایل · نامحدود`
              : `${profiles.length.toLocaleString('fa-IR')} از ${profileLimit.toLocaleString('fa-IR')} پروفایل`}
          </p>
        </div>
        <button
          onClick={openAdd}
          disabled={profileLimitReached}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">پروفایل جدید</span>
        </button>
      </div>

      {profileLimitReached && planType !== 'pro' && (
        <div className="glass rounded-2xl p-4 shadow-glass flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-indigo-500 shrink-0" />
            <p className="text-xs text-slate-600">
              سقف پروفایل طرح {currentPlan?.name} ({profileLimit === Infinity ? 'نامحدود' : profileLimit.toLocaleString('fa-IR')}) تکمیل شده است.
            </p>
          </div>
          <button
            onClick={() => setPage('pricing')}
            className="shrink-0 rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-semibold hover:bg-indigo-700 transition-colors"
          >
            ارتقای طرح
          </button>
        </div>
      )}

      {profiles.length === 0 && !showForm && (
        <div className="glass rounded-2xl p-10 text-center shadow-glass">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 mb-4">
            <User className="h-8 w-8" />
          </div>
          <p className="text-sm font-semibold text-slate-700">هنوز پروفایلی نساخته‌اید</p>
          <p className="text-xs text-slate-400 mt-1 mb-5">
            برای نوشتن نامه، ابتدا یک پروفایل ایجاد کنید
          </p>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            ساخت پروفایل
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <AnimatePresence mode="popLayout">
          {profiles.map((p, i) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className="glass rounded-2xl p-5 shadow-glass"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white text-xl font-bold">
                  {p.fullName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 truncate">{p.fullName}</h3>
                    {p.isDefault && (
                      <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-600">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        پیش‌فرض
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {p.jobTitle} · {p.organization}
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-slate-400">
                    <p>کد ملی: {p.nationalId || '—'}</p>
                    <p>کد پرسنلی: {p.employeeCode || '—'}</p>
                  </div>

                  {/* Extra fields saved from conversations */}
                  {p.extraFields && Object.keys(p.extraFields).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60">
                      <p className="text-[10px] font-semibold text-slate-400 mb-1.5">فیلدهای ذخیره‌شده:</p>
                      <div className="space-y-1">
                        {Object.entries(p.extraFields).map(([key, val]) => (
                          <p key={key} className="text-xs text-slate-500">
                            <span className="text-slate-400">{key}:</span> {val}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-200/60">
                {!p.isDefault && (
                  <button
                    onClick={() => setDefault(p.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-amber-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-amber-50"
                  >
                    <Star className="h-3.5 w-3.5" />
                    پیش‌فرض
                  </button>
                )}
                <button
                  onClick={() => openEdit(p)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-indigo-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  ویرایش
                </button>
                <button
                  onClick={() => setConfirmDelete(p.id)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف
                </button>
              </div>

              <AnimatePresence>
                {confirmDelete === p.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-3"
                  >
                    <div className="rounded-xl bg-red-50 p-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-red-700">
                        این پروفایل حذف شود؟
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            deleteProfile(p.id);
                            setConfirmDelete(null);
                          }}
                          className="flex items-center gap-1 rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-red-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                          بله
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="flex items-center gap-1 rounded-lg bg-white text-slate-600 px-3 py-1.5 text-xs font-medium border border-slate-200"
                        >
                          <X className="h-3.5 w-3.5" />
                          خیر
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between rounded-t-3xl">
                <h3 className="text-lg font-bold text-slate-900">
                  {editingId ? 'ویرایش پروفایل' : 'پروفایل جدید'}
                </h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {fields.map((f) => {
                  const Icon = f.icon;
                  return (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        {f.label}
                      </label>
                      <div className="relative">
                        <Icon className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400 pointer-events-none" />
                        <input
                          value={form[f.key]}
                          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                          placeholder={f.placeholder}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring transition-all focus:border-indigo-300"
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white py-3 text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30"
                  >
                    <Check className="h-4 w-4" />
                    {editingId ? 'ذخیره تغییرات' : 'ایجاد پروفایل'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-xl border border-slate-200 text-slate-600 px-5 py-3 text-sm font-medium hover:bg-slate-50"
                  >
                    انصراف
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
