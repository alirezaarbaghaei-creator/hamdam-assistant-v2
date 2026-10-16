import { CalendarCheck, User, Shield } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { CreditBadge } from '@/components/CreditBadge';

export function MobileHeader() {
  const user = useAuthStore((s) => s.user);
  const setPage = useAppStore((s) => s.setPage);
  const displayName = user?.full_name || user?.phone || 'کاربر';

  return (
    <header className="lg:hidden sticky top-0 z-30 glass border-b border-white/60">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Logo + title on the left */}
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-md shadow-indigo-500/30">
            <CalendarCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-none text-slate-900">همدم</h1>
            <p className="mt-0.5 text-[10px] text-slate-500">همدم تقویم و برنامه‌ات</p>
          </div>
        </div>

        {/* Credit badge + Account button on the right */}
        <div className="flex items-center gap-2">
          <CreditBadge compact />
          <button
            onClick={() => setPage(user?.is_admin ? 'admin' : 'account')}
            className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-slate-100/70"
            aria-label={user?.is_admin ? 'پنل مدیریت' : 'حساب کاربری'}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white text-sm font-bold">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 text-right hidden sm:block">
              <p className="max-w-[92px] truncate text-xs font-semibold text-slate-700">{displayName}</p>
              <p className="max-w-[110px] truncate text-[10px] text-slate-400" dir="ltr">{user?.phone || 'حساب کاربری'}</p>
            </div>
            {user?.is_admin ? <Shield className="h-4 w-4 shrink-0 text-slate-400" /> : <User className="h-4 w-4 shrink-0 text-slate-400" />}
          </button>
        </div>
      </div>
    </header>
  );
}
