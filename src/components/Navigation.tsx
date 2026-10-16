import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  Archive,
  User,
  PenLine,
  FileEdit,
  LogOut,
  Settings,
  Shield,
  X,
  Phone,
  CheckCircle2,
  Loader2,
  Calendar,
  CheckSquare,
  MessageCircle,
  MoreHorizontal,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import * as api from '@/lib/api';
import { CreditBadge } from '@/components/CreditBadge';
import type { PageId } from '@/types';

interface NavItem {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
}

const baseNavItems: NavItem[] = [
  { id: 'dashboard', label: 'همدم', icon: LayoutDashboard },
  { id: 'calendar', label: 'تقویم', icon: Calendar },
  { id: 'tasks', label: 'کارها', icon: CheckSquare },
  { id: 'assistant', label: 'دستیار', icon: MessageCircle },
  { id: 'more', label: 'بیشتر', icon: MoreHorizontal },
];

const accountNavItem: NavItem = { id: 'account', label: 'حساب کاربری', icon: Settings };
const adminNavItem: NavItem = { id: 'admin', label: 'پنل مدیریت', icon: Shield };

function useNavItems(): NavItem[] {
  const user = useAuthStore((s) => s.user);
  if (user?.is_admin) return [...baseNavItems, adminNavItem];
  return [...baseNavItems, accountNavItem];
}

export function AccountModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const signOut = useAuthStore((s) => s.signOut);
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [saved, setSaved] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const updatedUser = await api.updateAccount(fullName.trim());
      if (updatedUser) setUser(updatedUser);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطای ناشناخته';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordMessage('');
    if (password.length < 4) {
      setPasswordMessage('رمز عبور باید حداقل ۴ کاراکتر باشد.');
      return;
    }
    if (password !== passwordConfirmation) {
      setPasswordMessage('تکرار رمز عبور با رمز جدید یکسان نیست.');
      return;
    }
    setSavingPassword(true);
    try {
      await api.setPassword(password);
      setPassword('');
      setPasswordConfirmation('');
      setPasswordMessage('رمز عبور با موفقیت تغییر کرد.');
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : 'تغییر رمز عبور انجام نشد.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-sky-500" />
            <h3 className="text-lg font-bold text-slate-900">حساب کاربری</h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">شماره موبایل</label>
            <div className="relative">
              <Phone className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
              <input
                type="tel"
                value={user?.phone ?? ''}
                readOnly
                dir="ltr"
                className="w-full rounded-xl border border-sky-100 bg-white py-3 pl-4 pr-11 text-sm font-semibold text-slate-800 text-left outline-none"
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">شماره موبایل قابل ویرایش نیست.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">نام و نام خانوادگی</label>
            <div className="relative">
              <User className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="نام شما"
                dir="rtl"
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <X className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <p className="text-xs text-green-600">اطلاعات حساب با موفقیت به‌روزرسانی شد.</p>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <div className="mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4 text-sky-500" />
              <h4 className="text-sm font-bold text-slate-800">تغییر رمز عبور</h4>
            </div>
            <div className="space-y-2.5">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="رمز عبور جدید"
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus-ring"
              />
              <input
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                placeholder="تکرار رمز عبور جدید"
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus-ring"
              />
              {passwordMessage && (
                <p className={`text-xs ${passwordMessage.includes('موفقیت') ? 'text-emerald-600' : 'text-red-500'}`}>
                  {passwordMessage}
                </p>
              )}
              <button
                onClick={handlePasswordChange}
                disabled={savingPassword}
                className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition-colors hover:bg-sky-700 disabled:opacity-50"
              >
                {savingPassword ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'تغییر رمز عبور'}
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-3 text-sm font-semibold hover:bg-sky-700 transition-colors shadow-lg shadow-sky-500/30 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              'ذخیره تغییرات'
            )}
          </button>

          <button
            onClick={() => { signOut(); onClose(); }}
            className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-red-500 transition-colors py-2"
          >
            <LogOut className="h-4 w-4" />
            خروج از حساب
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function MobileAccountDrawer({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const setUser = useAuthStore((s) => s.setUser);
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [saved, setSaved] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [error, setError] = useState('');
  const displayName = user?.full_name || user?.phone || 'کاربر';

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updatedUser = await api.updateAccount(fullName.trim());
      if (updatedUser) setUser(updatedUser);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطای ناشناخته');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordMessage('');
    if (password.length < 4) {
      setPasswordMessage('رمز عبور باید حداقل ۴ کاراکتر باشد.');
      return;
    }
    if (password !== passwordConfirmation) {
      setPasswordMessage('تکرار رمز عبور با رمز جدید یکسان نیست.');
      return;
    }
    setSavingPassword(true);
    try {
      await api.setPassword(password);
      setPassword('');
      setPasswordConfirmation('');
      setPasswordMessage('رمز عبور با موفقیت تغییر کرد.');
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'تغییر رمز عبور انجام نشد.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-0 top-0 flex h-full w-[min(86vw,360px)] flex-col overflow-hidden bg-white text-slate-900 shadow-2xl"
        style={{ backgroundColor: '#ffffff' }}
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-[72px] shrink-0 items-center justify-between border-b border-slate-100 px-5 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white font-bold">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{displayName}</p>
              <p className="truncate text-xs text-slate-400" dir="ltr">{user?.phone ?? 'حساب کاربری'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
            aria-label="بستن منو"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-2.5 overflow-hidden bg-white px-4 py-3" style={{ backgroundColor: '#ffffff' }}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">شماره موبایل</label>
            <div className="relative">
              <Phone className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
              <input
                type="tel"
                value={user?.phone ?? ''}
                readOnly
                dir="ltr"
                className="w-full rounded-xl border border-sky-100 bg-white py-2 pl-4 pr-11 text-sm font-semibold text-slate-800 text-left outline-none"
              />
            </div>
            <p className="mt-0.5 text-[10px] text-slate-400">شماره موبایل قابل ویرایش نیست.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">نام و نام خانوادگی</label>
            <div className="relative">
              <User className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="نام شما"
                dir="rtl"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2">
              <X className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <p className="text-xs text-green-600">اطلاعات حساب با موفقیت به‌روزرسانی شد.</p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-2.5 text-sm font-semibold hover:bg-sky-700 transition-colors shadow-lg shadow-sky-500/30 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'ذخیره تغییرات'}
          </button>

          <div className="border-t border-slate-100 pt-2.5">
            <div className="mb-2 flex items-center gap-2">
              <Settings className="h-4 w-4 text-sky-500" />
              <h4 className="text-sm font-bold text-slate-800">تغییر رمز عبور</h4>
            </div>
            <div className="space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="رمز عبور جدید"
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-ring"
              />
              <input
                type="password"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                placeholder="تکرار رمز عبور جدید"
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-ring"
              />
              {passwordMessage && (
                <p className={`text-xs ${passwordMessage.includes('موفقیت') ? 'text-emerald-600' : 'text-red-500'}`}>
                  {passwordMessage}
                </p>
              )}
              <button
                onClick={handlePasswordChange}
                disabled={savingPassword}
                className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition-colors hover:bg-sky-700 disabled:opacity-50"
              >
                {savingPassword ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'تغییر رمز عبور'}
              </button>
            </div>
          </div>

          <button
            onClick={() => { signOut(); onClose(); }}
            className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-red-500 transition-colors py-2"
          >
            <LogOut className="h-4 w-4" />
            خروج از حساب
          </button>
        </div>
      </motion.aside>
    </motion.div>
  );
}

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setPage = useAppStore((s) => s.setPage);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const navItems = useNavItems();

  const displayName = user?.full_name || user?.phone || 'کاربر';

  return (
    <>
      <aside className="hidden lg:flex fixed top-0 right-0 h-screen w-64 flex-col border-l border-slate-200/60 glass z-40">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
            <PenLine className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">همدم</h1>
            <p className="text-xs text-slate-500">همدم تقویم و برنامه‌ات</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100/60'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                {item.label}
                {active && <span className="mr-auto h-2 w-2 rounded-full bg-indigo-500" />}
              </button>
            );
          })}
        </nav>

        <div className="px-3 pb-6 space-y-3">
          <CreditBadge />

          <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 p-4 text-white">
            <MessageSquare className="h-6 w-6 mb-2" />
            <p className="text-sm font-semibold">ثبت با یک جمله</p>
            <p className="text-xs text-indigo-100 mt-1">
              بگو «فردا ساعت ۱۰ کلاس زبان دارم»؛ همدم خودش ثبتش می‌کند
            </p>
            <button
              onClick={() => setPage('assistant')}
              className="mt-3 w-full rounded-lg bg-white/20 hover:bg-white/30 transition-colors py-2 text-xs font-medium"
            >
              شروع کنید
            </button>
          </div>

          {user && (
            <div className="rounded-2xl glass p-3 space-y-2">
              <button
                onClick={() => setPage(user?.is_admin ? 'admin' : 'account')}
                className="w-full flex items-center gap-3 text-right hover:bg-slate-100/60 rounded-xl p-2 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white text-sm font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">
                    {displayName}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{user?.is_admin ? 'پنل مدیریت' : 'حساب کاربری'}</p>
                </div>
                {user?.is_admin ? <Shield className="h-4 w-4 text-slate-400 shrink-0" /> : <Settings className="h-4 w-4 text-slate-400 shrink-0" />}
              </button>

              <button
                onClick={() => signOut()}
                className="w-full flex items-center gap-2 text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                خروج از حساب
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export function BottomNav() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setPage = useAppStore((s) => s.setPage);
  const navItems = useNavItems();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-white/60">
      <div className="flex items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors"
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 ${
                  active
                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 scale-105'
                    : 'text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span
                className={`text-[10px] font-medium ${
                  active ? 'text-indigo-600' : 'text-slate-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
