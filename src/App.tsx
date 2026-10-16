import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { App as CapacitorApp } from '@capacitor/app';
import { Sidebar, BottomNav } from '@/components/Navigation';
import { MobileHeader } from '@/components/MobileHeader';
import { Dashboard } from '@/pages/Dashboard';
import { AuthPage } from '@/pages/AuthPage';
import { AdminPage } from '@/pages/AdminPage';
import { AccountPage } from '@/pages/AccountPage';
import { PricingPage } from '@/pages/PricingPage';
import { ManagerPage } from '@/pages/ManagerPage';
import { CalendarTab } from '@/pages/manager/CalendarTab';
import { TasksTab } from '@/pages/manager/TasksTab';
import { AssistantTab } from '@/pages/manager/AssistantTab';
import { MoreTab } from '@/pages/manager/MoreTab';
import { PaymentCallback } from '@/pages/PaymentCallback';
import { PaymentResult } from '@/pages/PaymentResult';
import { OfflineBanner } from '@/components/OfflineBanner';
import { UpgradeModal } from '@/components/UpgradeModal';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { useManagerStore } from '@/store/managerStore';
import { useDeepLinks, parseDeepLink } from '@/hooks/useDeepLinks';
import { initPushNotifications, cleanupPushNotifications } from '@/services/pushNotifications';
import { IntroTour, INTRO_SEEN_KEY } from '@/components/IntroTour';
import { getItem as getStoredItem, setItem as setStoredItem } from '@/lib/safeStorage';
import { installDiagnostics } from '@/services/diagnostics';

// Install the global error capture at module load, before React mounts, so early
// failures are recorded too. Safe to call repeatedly.
installDiagnostics();

function AppShell() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setPage = useAppStore((s) => s.setPage);
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const refreshManager = useManagerStore((s) => s.refresh);
  const managerLoaded = useManagerStore((s) => s.loaded);

  // Track whether we're showing a standalone payment page (not part of the SPA)
  const [paymentView, setPaymentView] = useState<'callback' | 'result' | null>(() => {
    const path = window.location.pathname;
    if (path === '/payment/callback') return 'callback';
    if (path === '/payment/result') return 'result';
    return null;
  });

  // First-run onboarding: shown once before the login page, then remembered
  // in safeStorage (memory fallback on WebViews where localStorage is blocked).
  const [introSeen, setIntroSeen] = useState(() => getStoredItem(INTRO_SEEN_KEY) === '1');

  const handleIntroDone = () => {
    setStoredItem(INTRO_SEEN_KEY, '1');
    setIntroSeen(true);
  };

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Initialize FCM push notifications on native (Android) builds.
  useEffect(() => {
    initPushNotifications().catch((err) => {
      console.error('[Push] Init failed', err);
    });
    return () => {
      cleanupPushNotifications().catch(() => {});
    };
  }, []);

  // Load the manager (calendar + assistant) data when the user signs in
  useEffect(() => {
    if (session && !managerLoaded) {
      void refreshManager();
    }
  }, [session, managerLoaded, refreshManager]);

  // Handle deep links from Capacitor (Android)
  useDeepLinks((url) => {
    const parsed = parseDeepLink(url);
    if (!parsed) return;
    let { pathname, search } = parsed;

    // Normalize kateb://payment/callback → /payment/callback
    if (pathname === '/callback') pathname = '/payment/callback';
    if (pathname === '/result') pathname = '/payment/result';

    if (pathname === '/payment/callback') {
      const queryString = search.toString();
      const newUrl = queryString ? `/payment/callback?${queryString}` : '/payment/callback';
      window.history.replaceState({}, '', newUrl);
      setPaymentView('callback');
    } else if (pathname === '/payment/result') {
      const orderId = search.get('order_id');
      const newUrl = orderId
        ? `/payment/result?order_id=${orderId}`
        : '/payment/result';
      window.history.replaceState({}, '', newUrl);
      setPaymentView('result');
    }
  });

  // Handle Android back button
  useEffect(() => {
    let listener: { remove: () => Promise<void> } | null = null;
    try {
      CapacitorApp.addListener('backButton', () => {
        // If we're on a sub-page, go back to the home dashboard
        if (currentPage !== 'dashboard') {
          setPage('dashboard');
        } else {
          // On dashboard, exit the app
          CapacitorApp.exitApp().catch((error: unknown) => {
            console.error('[Hamdam] app exit failed', error);
          });
        }
      })
        .then((l) => { listener = l; })
        .catch((error: unknown) => {
          console.error('[Hamdam] back-button listener unavailable', error);
        });
    } catch (error) {
      console.error('[Hamdam] back-button initialization failed', error);
    }

    return () => {
      if (listener) listener.remove().catch(() => {});
    };
  }, [currentPage, setPage]);

  // Payment callback route: standalone page, no auth required
  if (paymentView === 'callback') {
    return <PaymentCallback onDone={(oid) => {
      const newUrl = oid ? `/payment/result?order_id=${oid}` : '/payment/result';
      window.history.replaceState({}, '', newUrl);
      setPaymentView('result');
    }} />;
  }

  // Payment result route: standalone page, no auth required
  if (paymentView === 'result') {
    return <PaymentResult onDone={() => {
      window.history.replaceState({}, '', '/');
      setPaymentView(null);
    }} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    // First launch: multi-step intro first, login page only after it's done
    // (or skipped). The seen-flag makes sure it never shows a second time.
    if (!introSeen) {
      return <IntroTour onDone={handleIntroDone} />;
    }
    return <AuthPage />;
  }

  const pages: Record<string, React.ReactNode> = {
    dashboard: <Dashboard />,
    manager: <ManagerPage />,
    calendar: <CalendarTab />,
    tasks: <TasksTab />,
    assistant: <AssistantTab />,
    more: <MoreTab />,
    admin: <AdminPage />,
    account: <AccountPage />,
    pricing: <PricingPage />,
  };

  return (
    <div className="min-h-screen bg-surface">
      <OfflineBanner />
      {/* Ambient background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute top-1/2 -left-40 h-96 w-96 rounded-full bg-cyan-200/20 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-80 w-80 rounded-full bg-indigo-100/40 blur-3xl" />
      </div>

      <Sidebar />
      <MobileHeader />

      <main className="relative lg:mr-64">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 pb-28 lg:pb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {pages[currentPage] ?? <Dashboard />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <BottomNav />
      <UpgradeModal />
    </div>
  );
}

// Kept as a thin wrapper so the root stays a stable mount point.
function App() {
  return <AppShell />;
}

export default App;
