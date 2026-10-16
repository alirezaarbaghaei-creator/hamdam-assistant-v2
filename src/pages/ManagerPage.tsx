import { useEffect } from 'react';
import { useManagerStore } from '@/store/managerStore';
import { HomeTab } from './manager/HomeTab';

/**
 * «مدیر من» — full Life Manager module (ported from the life_manager Expo
 * app) running inside Kateb's React + Vite + Tailwind stack.
 *
 * Calendar, Tasks, Assistant and More are now top-level nav items;
 * this page renders the home overview tab.
 */
export function ManagerPage() {
  const refresh = useManagerStore((s) => s.refresh);
  const loaded = useManagerStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  return <HomeTab />;
}
