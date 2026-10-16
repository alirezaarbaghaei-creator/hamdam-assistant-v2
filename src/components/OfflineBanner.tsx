import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';
import { isOnline } from '@/lib/network';

export function OfflineBanner() {
  const [online, setOnline] = useState(isOnline());
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };
    const handleOffline = () => {
      setOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed top-0 inset-x-0 z-[60] flex flex-col items-center justify-center gap-0.5 bg-red-600 text-white px-4 py-2.5 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0" />
            <p className="text-xs font-bold">اتصال اینترنت برقرار نیست</p>
          </div>
          <p className="text-[11px] text-red-100">
            لطفاً اتصال اینترنت خود را بررسی کنید و دوباره تلاش کنید.
          </p>
        </motion.div>
      )}
      {showReconnected && online && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 shadow-lg"
        >
          <Wifi className="h-4 w-4 shrink-0" />
          <p className="text-xs font-semibold">اتصال اینترنت برقرار شد</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
