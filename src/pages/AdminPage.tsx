import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Settings, BarChart3, MessageSquare, Cpu, Trash2, Plus, Shield,
  CheckCircle2, AlertCircle, Loader2, Search, Edit2, X, Save, Phone, KeyRound,
  CreditCard, FileText, Star, Eye, Database, Crown, Zap, Gift, Receipt, Download,
  LogOut, PartyPopper, Trash2 as TrashIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import { getStoredApiUrl, setApiUrl } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { PLANS, formatToman, type PlanId } from '@/data/plans';
import type { AdminUserRow, AdminSettings, AdminStats, AdminTemplateRow } from '@/lib/api';
import { exportToExcel } from '@/lib/excelExport';

type Tab = 'stats' | 'users' | 'subs' | 'sms' | 'ai' | 'payments' | 'transactions' | 'templates' | 'database' | 'occasions';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const signOut = useAuthStore((s) => s.signOut);

  const loadStats = useCallback(async () => {
    const s = await api.adminStatsGet();
    setStats(s);
  }, []);

  const loadUsers = useCallback(async () => {
    const u = await api.adminUsersList();
    setUsers(u);
  }, []);

  const loadSettings = useCallback(async () => {
    const s = await api.adminSettingsGet();
    setSettings(s);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadStats(), loadUsers(), loadSettings()]);
      setLoading(false);
    })();
  }, [loadStats, loadUsers, loadSettings]);

  const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'stats', label: 'آمار', icon: BarChart3 },
    { id: 'users', label: 'کاربران', icon: Users },
    { id: 'subs', label: 'اشتراک‌ها', icon: Crown },
    { id: 'transactions', label: 'پرداخت‌ها', icon: Receipt },
    { id: 'sms', label: 'پنل پیامک', icon: MessageSquare },
    { id: 'ai', label: 'هوش مصنوعی', icon: Cpu },
    { id: 'payments', label: 'درگاه پرداخت', icon: CreditCard },
    { id: 'templates', label: 'قالب‌ها', icon: FileText },
    { id: 'occasions', label: 'مناسبت‌ها', icon: PartyPopper },
    { id: 'database', label: 'دیتابیس', icon: Database },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 shadow-lg">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">پنل مدیریت</h1>
            <p className="text-sm text-slate-500">مدیریت کاربران و تنظیمات سیستم</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 text-red-600 px-4 py-2.5 text-sm font-medium hover:bg-red-100 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          خروج از حساب
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-slate-100/80 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
                active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          {tab === 'stats' && <StatsTab stats={stats} />}
          {tab === 'users' && <UsersTab users={users} onReload={loadUsers} />}
          {tab === 'subs' && <SubsTab />}
          {tab === 'transactions' && <TransactionsTab />}
          {tab === 'sms' && settings && <SmsTab settings={settings} onSave={loadSettings} />}
          {tab === 'ai' && settings && <AiTab settings={settings} onSave={loadSettings} />}
          {tab === 'payments' && settings && <PaymentsTab settings={settings} onSave={loadSettings} />}
          {tab === 'templates' && <TemplatesTab />}
          {tab === 'occasions' && <OccasionsTab />}
          {tab === 'database' && <DatabaseTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Stats Tab ─────────────────────────────────────────────────
function StatsTab({ stats }: { stats: AdminStats | null }) {
  const cards = [
    { label: 'کاربران', value: stats?.users ?? 0, icon: Users, color: 'from-sky-500 to-sky-600', bg: 'bg-sky-50', text: 'text-sky-600' },
    { label: 'رویدادها', value: stats?.events ?? 0, icon: PartyPopper, color: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50', text: 'text-emerald-600' },
    { label: 'کارها', value: stats?.tasks ?? 0, icon: Edit2, color: 'from-amber-500 to-amber-600', bg: 'bg-amber-50', text: 'text-amber-600' },
    { label: 'مناسبت‌ها', value: stats?.occasions ?? 0, icon: Star, color: 'from-cyan-500 to-cyan-600', bg: 'bg-cyan-50', text: 'text-cyan-600' },
    { label: 'مکتوب‌ها (قدیمی)', value: stats?.letters ?? 0, icon: PenIcon, color: 'from-violet-500 to-violet-600', bg: 'bg-violet-50', text: 'text-violet-600' },
    { label: 'کشف هوشمند (قدیمی)', value: stats?.discovery ?? 0, icon: Search, color: 'from-rose-500 to-rose-600', bg: 'bg-rose-50', text: 'text-rose-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="glass rounded-2xl p-5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.bg} mb-3`}>
              <Icon className={`h-5 w-5 ${c.text}`} />
            </div>
            <p className="text-3xl font-bold text-slate-900">{c.value.toLocaleString('fa-IR')}</p>
            <p className="text-sm text-slate-500 mt-1">{c.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function PenIcon(props: { className?: string }) {
  return <Edit2 {...props} />;
}

// ─── Occasions Tab (Hamdam) ────────────────────────────────────
interface OccasionRow {
  id?: string;
  title: string;
  jalali_date: string;
  gregorian_date: string;
  type: string;
  is_official_holiday: number | boolean;
}

function OccasionsTab() {
  const [rows, setRows] = useState<OccasionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [jdate, setJdate] = useState('');
  const [type, setType] = useState('cultural');
  const [official, setOfficial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api.holidaysAllApi()) as unknown as OccasionRow[]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleSave = async () => {
    if (!title.trim() || !/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(jdate.trim())) {
      showToast('عنوان و تاریخ جلالی به شکل ۱۴۰۵/۰۱/۰۱ لازم است');
      return;
    }
    setSaving(true);
    try {
      await api.adminOccasionSaveApi({
        title: title.trim(),
        jalali_date: jdate.trim().replace(/\//g, '-'),
        type,
        is_official_holiday: official,
      });
      setTitle('');
      setJdate('');
      setOfficial(false);
      await load();
      showToast('مناسبت ذخیره شد');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id || !confirm('حذف این مناسبت؟')) return;
    try {
      await api.adminOccasionDeleteApi(id);
      await load();
      showToast('حذف شد');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در حذف');
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
          <PartyPopper className="h-4 w-4 text-indigo-500" />
          افزودن مناسبت جدید
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">عنوان مناسبت</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً روز ولنتاین"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus-ring" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">تاریخ جلالی (YYYY/MM/DD)</label>
            <input value={jdate} onChange={(e) => setJdate(e.target.value)} placeholder="۱۴۰۵/۱۱/۲۴" dir="ltr"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 text-left focus-ring" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">نوع</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus-ring">
              <option value="cultural">مناسبت فرهنگی</option>
              <option value="religious">مذهبی</option>
              <option value="national">ملی</option>
              <option value="official">رسمی</option>
              <option value="occasional">فصلی/مناسبت</option>
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600">
            <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
            تعطیل رسمی است
          </label>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="mt-4 flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          ذخیره مناسبت
        </button>
        {toast && <p className="mt-2 text-xs text-indigo-600">{toast}</p>}
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-800">مناسبت‌های ثبت‌شده</h3>
        {loading ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">هنوز مناسبتی ثبت نشده</p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto pl-1">
            {rows.map((r) => (
              <div key={r.id ?? r.jalali_date + r.title} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{r.title}</p>
                  <p className="text-[11px] text-slate-400" dir="ltr" style={{ textAlign: 'right' }}>
                    {r.jalali_date} · {r.gregorian_date} {Number(r.is_official_holiday) === 1 ? '· تعطیل رسمی' : ''}
                  </p>
                </div>
                <button onClick={() => handleDelete(r.id)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label="حذف">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Users Tab ─────────────────────────────────────────────────
function UsersTab({ users, onReload }: { users: AdminUserRow[]; onReload: () => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [subEdit, setSubEdit] = useState<AdminUserRow | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newAdmin, setNewAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [planFilter, setPlanFilter] = useState<'all' | PlanId>('all');

  const planOf = (u: AdminUserRow): PlanId => {
    if (u.plan_type === 'basic') return 'basic';
    if (u.plan_type === 'pro') return 'pro';
    return 'free';
  };

  const filtered = users.filter((u) => {
    if (!(u.phone.includes(search) || (u.full_name ?? '').includes(search))) return false;
    if (roleFilter === 'admin' && !u.is_admin) return false;
    if (roleFilter === 'user' && u.is_admin) return false;
    if (planFilter !== 'all' && planOf(u) !== planFilter) return false;
    return true;
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^09\d{9}$/.test(newPhone)) { setError('شماره نامعتبر'); return; }
    if (newPass.length < 4) { setError('رمز حداقل ۴ کاراکتر'); return; }
    setSaving(true);
    try {
      await api.adminUserCreate({ phone: newPhone, password: newPass, full_name: newName, is_admin: newAdmin });
      await onReload();
      setShowAdd(false);
      setNewPhone(''); setNewName(''); setNewPass(''); setNewAdmin(false);
      showToast('کاربر جدید ساخته شد');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('آیا از حذف این کاربر مطمئن هستید؟')) return;
    try {
      await api.adminUserDelete(id);
      await onReload();
      showToast('کاربر حذف شد');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا');
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      showToast('کاربری برای خروجی وجود ندارد');
      return;
    }
    exportToExcel({
      filename: `kateb-users-${new Date().toISOString().slice(0, 10)}`,
      name: 'کاربران',
      headers: ['نام', 'شماره موبایل', 'نقش', 'طرح', 'سکه', 'تاریخ عضویت'],
      rows: filtered.map((u) => {
        const created = new Date(u.created_at);
        return [
          u.full_name || '—',
          u.phone,
          u.is_admin ? 'مدیر' : 'کاربر عادی',
          PLANS.find((p) => p.id === planOf(u))?.name ?? 'آزمایشی',
          u.coins ?? 0,
          Number.isNaN(created.getTime()) ? '—' : created.toLocaleDateString('fa-IR'),
        ];
      }),
      widths: [22, 16, 13, 13, 9, 15],
      rtl: true,
    });
    showToast(`خروجی اکسل برای ${filtered.length.toLocaleString('fa-IR')} کاربر ساخته شد`);
  };

  const handleSaveEdit = async (patch: { full_name?: string; is_admin?: boolean; password?: string }) => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.adminUserUpdate(editing.id, patch);
      await onReload();
      setEditing(null);
      showToast('اطلاعات کاربر به‌روزرسانی شد');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو بر اساس شماره یا نام..."
            className="w-full rounded-xl border border-slate-200 bg-white/80 py-2.5 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring"
          />
        </div>
        <select value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'user')}
          aria-label="فیلتر نقش کاربر"
          className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-700 focus-ring">
          <option value="all">همه نقش‌ها</option>
          <option value="admin">مدیران</option>
          <option value="user">کاربران عادی</option>
        </select>
        <select value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as 'all' | PlanId)}
          aria-label="فیلتر طرح اشتراک"
          className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-700 focus-ring">
          <option value="all">همه طرح‌ها</option>
          {PLANS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button onClick={handleExport} disabled={filtered.length === 0}
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-2.5 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <Download className="h-4 w-4" />
          خروجی اکسل
        </button>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl bg-sky-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-sky-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" />
          کاربر جدید
        </button>
      </div>

      {error && <ErrorBox text={error} />}

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/60 text-slate-500 text-xs">
                <th className="text-right font-medium px-4 py-3">نام</th>
                <th className="text-right font-medium px-4 py-3">شماره موبایل</th>
                <th className="text-right font-medium px-4 py-3">نقش</th>
                <th className="text-right font-medium px-4 py-3">طرح</th>
                <th className="text-right font-medium px-4 py-3">تاریخ عضویت</th>
                <th className="text-center font-medium px-4 py-3">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-slate-100/60 hover:bg-slate-50/40 transition-colors">
                  <td className="px-4 py-3 text-slate-800 font-medium">{u.full_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600" dir="ltr">{u.phone}</td>
                  <td className="px-4 py-3">
                    {u.is_admin ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 text-sky-600 px-2 py-1 text-xs font-medium">
                        <Shield className="h-3 w-3" /> مدیر
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">کاربر عادی</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSubEdit(u)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                        u.plan_type === 'pro' ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' :
                        u.plan_type === 'basic' ? 'bg-cyan-50 text-cyan-600 hover:bg-cyan-100' :
                        'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>
                      {u.plan_type === 'pro' && <Crown className="h-3 w-3" />}
                      {u.plan_type === 'basic' && <Zap className="h-3 w-3" />}
                      {u.plan_type === 'free' && <Gift className="h-3 w-3" />}
                      {PLANS.find((p) => p.id === (u.plan_type ?? 'free'))?.name ?? 'آزمایشی'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(u.created_at).toLocaleDateString('fa-IR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setEditing(u)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => setSubEdit(u)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                        <Crown className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(u.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-slate-400 py-8 text-sm">کاربری یافت نشد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        نمایش {filtered.length.toLocaleString('fa-IR')} از {users.length.toLocaleString('fa-IR')} کاربر کل
        {(roleFilter !== 'all' || planFilter !== 'all' || search) && ' (با اعمال فیلترها)'}
      </p>

      {/* Add user modal */}
      <AnimatePresence>
        {showAdd && (
          <Modal onClose={() => setShowAdd(false)} title="کاربر جدید">
            <form onSubmit={handleAdd} className="space-y-4">
              <Field label="شماره موبایل" icon={Phone}>
                <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="09123456789" required dir="ltr"
                  className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none text-left" />
              </Field>
              <Field label="نام و نام خانوادگی" icon={Edit2}>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="نام کاربر" dir="rtl"
                  className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none" />
              </Field>
              <Field label="رمز عبور" icon={KeyRound}>
                <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)}
                  placeholder="••••••" required dir="ltr"
                  className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none text-left" />
              </Field>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newAdmin} onChange={(e) => setNewAdmin(e.target.checked)}
                  className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500" />
                <span className="text-sm text-slate-700">دسترسی مدیر</span>
              </label>
              {error && <ErrorBox text={error} />}
              <button type="submit" disabled={saving}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-3 text-sm font-semibold hover:bg-sky-700 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-4 w-4" />}
                ساخت کاربر
              </button>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* Edit user modal */}
      <AnimatePresence>
        {editing && (
          <EditUserModal user={editing} onSave={handleSaveEdit} onClose={() => setEditing(null)} saving={saving} />
        )}
      </AnimatePresence>

      {/* Subscription management modal */}
      <AnimatePresence>
        {subEdit && (
          <SubEditModal user={subEdit} onClose={() => setSubEdit(null)} onSaved={async () => { await onReload(); setSubEdit(null); showToast('اشتراک کاربر به‌روزرسانی شد'); }} />
        )}
      </AnimatePresence>

      {toast && <Toast text={toast} />}
    </div>
  );
}

function EditUserModal({
  user, onSave, onClose, saving,
}: {
  user: AdminUserRow;
  onSave: (patch: { full_name?: string; is_admin?: boolean; password?: string }) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(user.full_name ?? '');
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pass && pass.length < 4) { setError('رمز حداقل ۴ کاراکتر'); return; }
    const patch: { full_name?: string; is_admin?: boolean; password?: string } = {};
    if (name !== user.full_name) patch.full_name = name;
    if (isAdmin !== user.is_admin) patch.is_admin = isAdmin;
    if (pass) patch.password = pass;
    if (Object.keys(patch).length === 0) { onClose(); return; }
    try {
      await onSave(patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا');
    }
  };

  return (
    <Modal onClose={onClose} title={`ویرایش ${user.full_name || user.phone}`}>
      <form onSubmit={handleSave} className="space-y-4">
        <Field label="نام" icon={Edit2}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} dir="rtl"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 focus:outline-none" />
        </Field>
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <Phone className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-500" dir="ltr">{user.phone}</span>
        </div>
        <Field label="رمز عبور جدید (اختیاری)" icon={KeyRound}>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
            placeholder="خالی بگذارید اگر تغییر نمی‌کند" dir="ltr"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none text-left" />
        </Field>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)}
            className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500" />
          <span className="text-sm text-slate-700 flex items-center gap-1">
            <Shield className="h-4 w-4 text-sky-500" /> دسترسی مدیر
          </span>
        </label>
        {error && <ErrorBox text={error} />}
        <button type="submit" disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-3 text-sm font-semibold hover:bg-sky-700 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-4 w-4" />}
          ذخیره تغییرات
        </button>
      </form>
    </Modal>
  );
}

// ─── Subscription Management Modal ─────────────────────────────
function SubEditModal({ user, onClose, onSaved }: { user: AdminUserRow; onClose: () => void; onSaved: () => void }) {
  const [planId, setPlanId] = useState<PlanId>((user.plan_type as PlanId) ?? 'free');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.adminUserSetPlan(user.id, planId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`مدیریت اشتراک — ${user.full_name || user.phone}`}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <Crown className="h-5 w-5 text-indigo-500" />
          <div className="flex-1">
            <p className="text-xs text-slate-500">طرح فعلی</p>
            <p className="text-sm font-bold text-slate-700">
              {PLANS.find((p) => p.id === (user.plan_type ?? 'free'))?.name ?? 'آزمایشی'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setPlanId(plan.id)}
              className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 transition-all text-right ${
                planId === plan.id
                  ? plan.id === 'pro' ? 'border-indigo-400 bg-indigo-50/50'
                    : plan.id === 'basic' ? 'border-cyan-400 bg-cyan-50/50'
                    : 'border-slate-300 bg-slate-50'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${plan.gradient} text-white`}>
                {plan.id === 'pro' ? <Crown className="h-4 w-4" /> : plan.id === 'basic' ? <Zap className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">{plan.name}</p>
                <p className="text-xs text-slate-500">
                  {plan.aiAssistantLimit.toLocaleString('fa-IR')} هوش + {plan.templateLimit.toLocaleString('fa-IR')} قالب
                </p>
              </div>
              {planId === plan.id && <CheckCircle2 className="h-5 w-5 text-indigo-500" />}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600">با تغییر طرح، شمارش‌گرهای ماهانه صفر می‌شوند.</p>
        </div>

        {error && <ErrorBox text={error} />}
        <button type="submit" disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white py-3 text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crown className="h-4 w-4" />}
          ذخیره طرح
        </button>
      </form>
    </Modal>
  );
}

// ─── Subscriptions Tab ─────────────────────────────────────────
function SubsTab() {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.adminSubsListApi();
        setSubs(data);
      } catch { setSubs([]); }
      setLoading(false);
    })().catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>;
  }

  const planIcons: Record<PlanId, typeof Gift> = { free: Gift, basic: Zap, pro: Crown };

  return (
    <div className="space-y-3">
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/60 text-slate-500 text-xs">
                <th className="text-right font-medium px-4 py-3">کاربر</th>
                <th className="text-right font-medium px-4 py-3">طرح</th>
                <th className="text-right font-medium px-4 py-3">وضعیت</th>
                <th className="text-right font-medium px-4 py-3">استفاده</th>
                <th className="text-right font-medium px-4 py-3">انقضا</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => {
                const plan = PLANS.find((p) => p.id === s.plan_id);
                const Icon = planIcons[s.plan_id as PlanId] ?? Gift;
                return (
                  <tr key={s.id} className="border-b border-slate-100/60 hover:bg-slate-50/40">
                    <td className="px-4 py-3 text-slate-800 font-medium">
                      {s.kateb_users?.full_name || s.kateb_users?.phone || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                        <Icon className="h-3 w-3" />
                        {plan?.name ?? s.plan_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
                        s.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
                        s.status === 'expired' ? 'bg-red-50 text-red-500' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {s.status === 'active' ? 'فعال' : s.status === 'expired' ? 'منقضی' : 'لغو شده'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {(s.ai_assistant_usage ?? 0).toLocaleString('fa-IR')} / {(s.ai_assistant_limit ?? 0).toLocaleString('fa-IR')} هوش
                      <br />
                      {(s.template_usage ?? 0).toLocaleString('fa-IR')} / {(s.template_limit ?? 0).toLocaleString('fa-IR')} قالب
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {s.expires_at ? new Date(s.expires_at).toLocaleDateString('fa-IR') : '—'}
                    </td>
                  </tr>
                );
              })}
              {subs.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-400 py-8 text-sm">اشتراکی یافت نشد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Transactions Tab ──────────────────────────────────────────
function TransactionsTab() {
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.adminTransactionsListApi();
        setTxs(data);
      } catch { setTxs([]); }
      setLoading(false);
    })().catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>;
  }

  const totalRevenue = txs
    .filter((t) => t.status === 'paid')
    .reduce((sum, t) => sum + (t.amount_toman ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-slate-500">درآمد کل</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{formatToman(totalRevenue)} ت</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-slate-500">پرداخت‌های موفق</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{txs.filter((t) => t.status === 'paid').length.toLocaleString('fa-IR')}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-4 w-4 text-sky-500" />
            <span className="text-xs text-slate-500">کل تراکنش‌ها</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{txs.length.toLocaleString('fa-IR')}</p>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/60 text-slate-500 text-xs">
                <th className="text-right font-medium px-4 py-3">کاربر</th>
                <th className="text-right font-medium px-4 py-3">طرح</th>
                <th className="text-right font-medium px-4 py-3">مبلغ</th>
                <th className="text-right font-medium px-4 py-3">وضعیت</th>
                <th className="text-right font-medium px-4 py-3">کد پیگیری</th>
                <th className="text-right font-medium px-4 py-3">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => {
                const plan = PLANS.find((p) => p.id === t.plan_id);
                const isPaid = t.status === 'paid';
                return (
                  <tr key={t.id} className="border-b border-slate-100/60 hover:bg-slate-50/40">
                    <td className="px-4 py-3 text-slate-800 font-medium text-xs">
                      {t.kateb_users?.full_name || t.kateb_users?.phone || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{plan?.name ?? t.plan_id}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                      {formatToman(t.amount_toman ?? 0)} ت
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-1 rounded-lg ${
                        isPaid ? 'bg-emerald-50 text-emerald-600' :
                        t.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                        'bg-red-50 text-red-500'
                      }`}>
                        {isPaid ? 'موفق' : t.status === 'pending' ? 'در انتظار' : 'ناموفق'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[10px] text-slate-400" dir="ltr">
                      {t.ref_id ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(t.created_at).toLocaleDateString('fa-IR')}
                    </td>
                  </tr>
                );
              })}
              {txs.length === 0 && (
                <tr><td colSpan={6} className="text-center text-slate-400 py-8 text-sm">تراکنشی یافت نشد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Payments Settings Tab ─────────────────────────────────────
function PaymentsTab({ settings, onSave }: { settings: AdminSettings; onSave: () => Promise<void> }) {
  const [merchantId, setMerchantId] = useState(settings.zarinpal_merchant_id ?? '');
  const [sandbox, setSandbox] = useState(settings.zarinpal_sandbox ?? true);
  const [bazaarClientId, setBazaarClientId] = useState(settings.bazaar_client_id ?? '');
  const [bazaarClientSecret, setBazaarClientSecret] = useState(settings.bazaar_client_secret ?? '');
  const [bazaarRefreshToken, setBazaarRefreshToken] = useState(settings.bazaar_refresh_token ?? '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.adminSettingsUpdate({
        zarinpal_merchant_id: merchantId,
        zarinpal_sandbox: sandbox,
        bazaar_client_id: bazaarClientId,
        bazaar_client_secret: bazaarClientSecret,
        bazaar_refresh_token: bazaarRefreshToken,
      });
      await onSave();
      setToast('تنظیمات پرداخت ذخیره شد');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-lg">
      <SettingsCard title="تنظیمات درگاه پرداخت زرین‌پال">
        <Field label="کد پذیرنده (Merchant ID)" icon={KeyRound}>
          <input type="text" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} dir="ltr"
            placeholder="00000000-0000-0000-0000-000000000000"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none text-left font-mono" />
        </Field>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)}
            className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500" />
          <span className="text-sm text-slate-700">حالت تست (Sandbox)</span>
        </label>
        {sandbox && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-600">
              در حالت تست، پرداخت‌ها واقعی نیستند. کد پذیرنده پیش‌فرض برای تست کافی است.
            </p>
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="تنظیمات کافه‌بازار (پرداخت درون‌برنامه‌ای Android)">
        <Field label="Client ID" icon={KeyRound}>
          <input type="text" value={bazaarClientId} onChange={(e) => setBazaarClientId(e.target.value)} dir="ltr"
            placeholder="Bazaar Developer Client ID"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none text-left font-mono" />
        </Field>
        <Field label="Client Secret" icon={KeyRound}>
          <input type="password" value={bazaarClientSecret} onChange={(e) => setBazaarClientSecret(e.target.value)} dir="ltr"
            placeholder="Bazaar Developer Client Secret"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none text-left font-mono" />
        </Field>
        <Field label="Refresh Token" icon={KeyRound}>
          <input type="password" value={bazaarRefreshToken} onChange={(e) => setBazaarRefreshToken(e.target.value)} dir="ltr"
            placeholder="Bazaar OAuth Refresh Token"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none text-left font-mono" />
        </Field>
        <div className="flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-100 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-sky-500 shrink-0" />
          <p className="text-xs text-sky-700">
            این اطلاعات از پنل توسعه‌دهندگان کافه‌بازار دریافت می‌شود و فقط در سرور ذخیره می‌شود.
          </p>
        </div>
      </SettingsCard>

      <button type="submit" disabled={saving}
        className="flex items-center gap-2 rounded-xl bg-sky-600 text-white px-6 py-3 text-sm font-semibold hover:bg-sky-700 transition-colors disabled:opacity-50">
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-4 w-4" />}
        ذخیره تنظیمات
      </button>
      {toast && <Toast text={toast} />}
    </form>
  );
}

// ─── SMS Settings Tab ──────────────────────────────────────────
function SmsTab({ settings, onSave }: { settings: AdminSettings; onSave: () => Promise<void> }) {
  const [apiKey, setApiKey] = useState(settings.sms_api_key);
  const [pattern, setPattern] = useState(settings.sms_pattern_code);
  const [line, setLine] = useState(settings.sms_line_number);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.adminSettingsUpdate({
        sms_api_key: apiKey, sms_pattern_code: pattern, sms_line_number: line,
      });
      await onSave();
      setToast('تنظیمات پیامک ذخیره شد');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-lg">
      <SettingsCard title="تنظیمات پنل پیامک (ایران‌پیامک / فراز)">
        <Field label="API Key" icon={KeyRound}>
          <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} dir="ltr"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 focus:outline-none text-left font-mono" />
        </Field>
        <Field label="کد الگو (Pattern Code)" icon={BarChart3}>
          <input type="text" value={pattern} onChange={(e) => setPattern(e.target.value)} dir="ltr"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 focus:outline-none text-left font-mono" />
        </Field>
        <Field label="شماره خط فرستنده" icon={Phone}>
          <input type="text" value={line} onChange={(e) => setLine(e.target.value)} dir="ltr"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 focus:outline-none text-left font-mono" />
        </Field>
      </SettingsCard>
      <button type="submit" disabled={saving}
        className="flex items-center gap-2 rounded-xl bg-sky-600 text-white px-6 py-3 text-sm font-semibold hover:bg-sky-700 transition-colors disabled:opacity-50">
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-4 w-4" />}
        ذخیره تنظیمات
      </button>
      {toast && <Toast text={toast} />}
    </form>
  );
}

// ─── AI Settings Tab ───────────────────────────────────────────
function AiTab({ settings, onSave }: { settings: AdminSettings; onSave: () => Promise<void> }) {
  const [apiUrl, setApiUrl] = useState(settings.ai_api_url);
  const [apiKey, setApiKey] = useState(settings.ai_api_key);
  const [models, setModels] = useState(settings.ai_models);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; response?: string } | null>(null);
  const [toast, setToast] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.adminSettingsUpdate({
        ai_api_url: apiUrl, ai_api_key: apiKey, ai_models: models,
      });
      await onSave();
      setToast('تنظیمات هوش مصنوعی ذخیره شد');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so the test uses the latest settings
      await api.adminSettingsUpdate({
        ai_api_url: apiUrl, ai_api_key: apiKey, ai_models: models,
      });
      await onSave();
      const result = await api.aiTestApi();
      setTestResult({ ok: result.success, message: result.message, response: result.response });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'خطا در اتصال' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-lg">
      <SettingsCard title="تنظیمات هوش مصنوعی">
        <Field label="آدرس API" icon={Cpu}>
          <input type="text" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} dir="ltr"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 focus:outline-none text-left font-mono" />
        </Field>
        <Field label="API Key" icon={KeyRound}>
          <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} dir="ltr"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 focus:outline-none text-left font-mono" />
        </Field>
        <Field label="مدل‌ها (با کاما جدا کنید)" icon={BarChart3}>
          <input type="text" value={models} onChange={(e) => setModels(e.target.value)} dir="ltr"
            className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 focus:outline-none text-left font-mono" />
        </Field>
      </SettingsCard>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-sky-600 text-white px-6 py-3 text-sm font-semibold hover:bg-sky-700 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-4 w-4" />}
          ذخیره تنظیمات
        </button>
        <button type="button" onClick={handleTest} disabled={testing}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-6 py-3 text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50">
          {testing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-4 w-4" />}
          تست اتصال
        </button>
      </div>

      {testResult && (
        <div className={`rounded-xl border px-4 py-3 ${testResult.ok ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
          <div className="flex items-center gap-2 mb-1">
            {testResult.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            )}
            <p className={`text-sm font-semibold ${testResult.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              {testResult.message}
            </p>
          </div>
          {testResult.response && (
            <div className="mt-2 rounded-lg bg-white/60 p-3 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">پاسخ هوش مصنوعی:</p>
              <p className="text-sm text-slate-800 leading-relaxed">{testResult.response}</p>
            </div>
          )}
        </div>
      )}

      {toast && <Toast text={toast} />}
    </form>
  );
}

// ─── Templates Approval Tab ────────────────────────────────────
function TemplatesTab() {
  const [templates, setTemplates] = useState<AdminTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [preview, setPreview] = useState<AdminTemplateRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.adminTemplatesListApi();
      setTemplates(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleApprove = async (id: string) => {
    await api.adminTemplateApproveApi(id);
    await load();
    showToast('قالب تأیید شد');
  };

  const handleReject = async (id: string) => {
    if (!confirm('این قالب حذف شود؟')) return;
    await api.adminTemplateRejectApi(id);
    await load();
    showToast('قالب رد شد');
  };

  const pending = templates.filter((t) => !t.is_approved);
  const approved = templates.filter((t) => t.is_approved);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>;
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-3">در انتظار تأیید ({pending.length.toLocaleString('fa-IR')})</h3>
          <div className="space-y-2">
            {pending.map((t) => (
              <div key={t.id} className="glass rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{t.title}</p>
                    <p className="text-xs text-slate-400 truncate">{t.raw_request}</p>
                    <p className="text-[10px] text-slate-400 mt-1">توسط {t.creator_name || '—'} · {new Date(t.created_at).toLocaleDateString('fa-IR')}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setPreview(t)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleApprove(t.id)} className="flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-600 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-100 transition-colors">
                      <CheckCircle2 className="h-3.5 w-3.5" /> تأیید
                    </button>
                    <button onClick={() => handleReject(t.id)} className="flex items-center gap-1 rounded-lg bg-red-50 text-red-500 px-3 py-1.5 text-xs font-medium hover:bg-red-100 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" /> رد
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-3">تأیید شده ({approved.length.toLocaleString('fa-IR')})</h3>
        {approved.length > 0 ? (
          <div className="space-y-2">
            {approved.map((t) => (
              <div key={t.id} className="glass rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 truncate">{t.title}</p>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500">
                        <Star className="h-3 w-3 fill-amber-400" /> {(Number(t.rating) || 0).toFixed(1)} ({t.rating_count ?? 0})
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">{t.raw_request}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setPreview(t)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleReject(t.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">قالب تأیید شده‌ای وجود ندارد.</p>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setPreview(null)}>
          <div className="glass rounded-3xl p-6 shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">پیش‌نمایش قالب</h3>
              <button onClick={() => setPreview(null)} className="flex h-9 w-9 items-center justify-center rounded-xl glass text-slate-500 hover:text-slate-900 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm font-bold text-slate-800 mb-1">{preview.title}</p>
            <p className="text-xs text-slate-400 mb-4">{preview.raw_request}</p>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-4">
              <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{preview.sample_content || 'بدون پیش‌نمایش'}</p>
            </div>
            {!preview.is_approved && (
              <button onClick={() => { handleApprove(preview.id); setPreview(null); }} className="w-full rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors">
                تأیید قالب
              </button>
            )}
          </div>
        </div>
      )}

      {toast && <Toast text={toast} />}
    </div>
  );
}

// ─── Shared UI ─────────────────────────────────────────────────
function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="glass rounded-3xl p-6 shadow-2xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl glass text-slate-500 hover:text-slate-900 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof Phone; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <div className="relative flex items-center rounded-xl border border-slate-200 bg-white/80 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all">
        <Icon className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        {children}
      </div>
    </div>
  );
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
      <p className="text-xs text-red-600">{text}</p>
    </div>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-slate-900 text-white px-5 py-3 text-sm shadow-xl">
      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      {text}
    </motion.div>
  );
}

// ─── Database Tab ──────────────────────────────────────────────
function DatabaseTab() {
  const [url, setUrl] = useState(getStoredApiUrl());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setApiUrl(url.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setApiUrl('');
    setUrl('https://app.kateb.site/api/index.php');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ping' }),
      });
      if (res.ok) {
        setTestResult({ ok: true, message: 'اتصال با موفقیت برقرار شد.' });
      } else {
        setTestResult({ ok: false, message: `سرور پاسخ داد اما وضعیت ${res.status} بود.` });
      }
    } catch {
      setTestResult({ ok: false, message: 'اتصال برقرار نشد. آدرس را بررسی کنید.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard title="تنظیمات اتصال به دیتابیس (PHP JSON API)">
        <form onSubmit={handleSave} className="space-y-4">
          <Field label="آدرس فایل PHP API" icon={Database}>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/api/index.php"
              required
              dir="ltr"
              className="w-full bg-transparent py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none text-left"
            />
          </Field>

          <p className="text-xs text-slate-400 leading-relaxed">
            این آدرس برای تمام درخواست‌های دیتابیس ứng dụng استفاده می‌شود — شامل احراز هویت،
            پروفایل‌ها، مکتوب‌ها، پیش‌نویس‌ها، قالب‌ها و خرید سکه. تغییر این آدرس فقط روی این
            مرورگر اعمال می‌شود.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-sky-600 text-white px-5 py-2.5 text-sm font-medium hover:bg-sky-700 transition-colors shadow-sm"
            >
              <Save className="h-4 w-4" />
              ذخیره آدرس
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-xl bg-slate-100 text-slate-600 px-4 py-2.5 text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              بازنشانی به پیش‌فرض
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !url.trim()}
              className="flex items-center gap-2 rounded-xl bg-emerald-50 text-emerald-600 px-4 py-2.5 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              تست اتصال
            </button>
          </div>

          {saved && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-600">آدرس دیتابیس ذخیره شد.</p>
            </div>
          )}

          {testResult && (
            <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${
              testResult.ok
                ? 'bg-emerald-50 border-emerald-100'
                : 'bg-red-50 border-red-100'
            }`}>
              {testResult.ok
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                : <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
              <p className={`text-xs ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                {testResult.message}
              </p>
            </div>
          )}
        </form>
      </SettingsCard>
    </div>
  );
}
