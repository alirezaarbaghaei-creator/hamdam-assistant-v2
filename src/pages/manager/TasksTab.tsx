import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckSquare, Plus } from 'lucide-react';
import { useManagerStore } from '@/store/managerStore';
import { TaskCard } from '@/components/manager/TaskCard';
import { TaskModal } from '@/components/manager/TaskModal';
import { getTodayISO, dateToJalali, formatJalali, toFaDigits } from '@/utils/jalaliDate';
import type { Task } from '@/types/manager';

type TabKey = 'today' | 'upcoming' | 'completed';

export function TasksTab() {
  const tasks = useManagerStore((s) => s.tasks);
  const addTask = useManagerStore((s) => s.addTask);
  const toggleTask = useManagerStore((s) => s.toggleTask);
  const deleteTask = useManagerStore((s) => s.deleteTask);
  const skipTask = useManagerStore((s) => s.skipTask);
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [modalOpen, setModalOpen] = useState(false);

  const todayISO = getTodayISO();

  const filteredTasks = useMemo(() => {
    if (activeTab === 'today') {
      return tasks.filter((t) => t.dueDate === todayISO && t.status === 'pending');
    }
    if (activeTab === 'upcoming') {
      return tasks
        .filter((t) => t.dueDate > todayISO && t.status === 'pending')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    }
    return tasks.filter((t) => t.status === 'completed');
  }, [tasks, activeTab, todayISO]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    {
      key: 'today',
      label: 'امروز',
      count: tasks.filter((t) => t.dueDate === todayISO && t.status === 'pending').length,
    },
    {
      key: 'upcoming',
      label: 'آینده',
      count: tasks.filter((t) => t.dueDate > todayISO && t.status === 'pending').length,
    },
    { key: 'completed', label: 'انجام‌شده', count: tasks.filter((t) => t.status === 'completed').length },
  ];

  const getTaskDateLabel = (task: Task): string => {
    if (task.dueDate === todayISO) return 'امروز';
    return formatJalali(dateToJalali(new Date(task.dueDate + 'T00:00:00')), 'long');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">کارها</h2>
        <button
          onClick={() => setModalOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 transition-colors hover:bg-indigo-700"
          aria-label="افزودن کار"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-slate-100/80 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] ${
                  activeTab === tab.key ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {toFaDigits(tab.count)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        {filteredTasks.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center">
            <CheckSquare className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              {activeTab === 'today'
                ? 'کاری برای امروز ثبت نشده'
                : activeTab === 'upcoming'
                  ? 'کاری برای آینده ثبت نشده'
                  : 'هنوز کاری انجام نشده'}
            </p>
            <p className="mt-1 text-xs text-slate-400">با دکمه + کار جدید اضافه کن</p>
          </div>
        ) : (
          filteredTasks.map((task, i) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3) }}
            >
              {activeTab === 'upcoming' && (
                <p className="mb-1 mt-2 text-right text-[11px] text-slate-400">
                  {getTaskDateLabel(task)}
                </p>
              )}
              <TaskCard
                task={task}
                onToggle={(t) => toggleTask(t.id)}
                onDelete={deleteTask}
                onSkip={skipTask}
              />
            </motion.div>
          ))
        )}
      </motion.div>

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={addTask} defaultDate={todayISO} />
    </div>
  );
}
