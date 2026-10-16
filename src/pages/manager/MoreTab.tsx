import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Bell,
  Clock,
} from 'lucide-react';
import { useManagerStore } from '@/store/managerStore';
import { useAuthStore } from '@/store/authStore';
import { requestNotificationPermissions } from '@/services/manager/notifications';
import { managerAi } from '@/services/manager/managerAi';
import { toFaDigits, getStartOfWeek, getEndOfWeek, getTodayJalali, gregorianToISO, toGregorian } from '@/utils/jalaliDate';

export function MoreTab() {
  const tasks = useManagerStore((s) => s.tasks);
  const preferences = useManagerStore((s) => s.preferences);
  const updatePreferences = useManagerStore((s) => s.updatePreferences);
  const user = useAuthStore((s) => s.user);

  const [notifMessage, setNotifMessage] = useState('');

  const handleToggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermissions();
      updatePreferences({ notificationsEnabled: granted });
      if (!granted) {
        setNotifMessage('مرورگر مجوز اعلان را رد کرد');
      }
    } else {
      updatePreferences({ notificationsEnabled: false });
    }
  };

  // Weekly report
  const start = getStartOfWeek(getTodayJalali());
  const end = getEndOfWeek(getTodayJalali());
  const startISO = gregorianToISO(toGregorian(start.year, start.month, start.day));
  const endISO = gregorianToISO(toGregorian(end.year, end.month, end.day));
  const weekTasks = tasks.filter((t) => t.dueDate >= startISO && t.dueDate <= endISO);
  const completed = weekTasks.filter((t) => t.status === 'completed').length;
  const pending = weekTasks.filter((t) => t.status === 'pending').length;
  const weeklyInsight = managerAi.generateWeeklyInsight(completed, pending);

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-slate-800">بیشتر</h2>

      {/* Weekly report */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-3xl p-5"
      >
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <BarChart3 className="h-4 w-4 text-indigo-500" />
          گزارش هفتگی
        </h3>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-green-50 p-3 text-center">
            <p className="text-lg font-bold text-green-600">{toFaDigits(completed)}</p>
            <p className="text-[11px] text-green-500">انجام‌شده</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-3 text-center">
            <p className="text-lg font-bold text-amber-600">{toFaDigits(pending)}</p>
            <p className="text-[11px] text-amber-500">باقی‌مانده</p>
          </div>
        </div>
        <p className="text-right text-xs leading-6 text-slate-500">{weeklyInsight}</p>
      </motion.section>

      {/* Preferences */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass space-y-4 rounded-3xl p-5"
      >
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Clock className="h-4 w-4 text-teal-600" />
          ساعات کاری و یادآوری
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">شروع کار</label>
            <input
              type="time"
              value={preferences?.workStart ?? '08:00'}
              onChange={(e) => updatePreferences({ workStart: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">پایان کار</label>
            <input
              type="time"
              value={preferences?.workEnd ?? '20:00'}
              onChange={(e) => updatePreferences({ workEnd: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus-ring"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-slate-500">یادآوری پیش‌فرض (دقیقه قبل)</label>
          <select
            value={preferences?.defaultReminder ?? 15}
            onChange={(e) => updatePreferences({ defaultReminder: Number(e.target.value) })}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus-ring"
          >
            {[5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {toFaDigits(m)} دقیقه
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-slate-600">
            <Bell className="h-4 w-4 text-indigo-500" />
            اعلان‌های یادآوری
          </span>
          <input
            type="checkbox"
            checked={preferences?.notificationsEnabled ?? false}
            onChange={(e) => void handleToggleNotifications(e.target.checked)}
            className="h-5 w-5 accent-indigo-600"
          />
        </label>
        {notifMessage && (
          <p className="text-xs text-red-500">{notifMessage}</p>
        )}
      </motion.section>

      {/* Account */}
      <div className="rounded-3xl bg-slate-100/70 p-4 text-center">
        <p className="text-xs text-slate-500">
          وارد شده به‌عنوان{' '}
          <span className="font-semibold text-slate-700">{user?.full_name || 'کاربر'}</span>
        </p>
        <p className="mt-1 text-[10px] text-slate-400">همدم — نسخه ۱.۰</p>
      </div>
    </div>
  );
}
