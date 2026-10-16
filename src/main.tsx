import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[Kateb] render error', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="text-center max-w-sm">
            <h1 className="text-lg font-bold text-slate-800 mb-2">خطایی رخ داد</h1>
            <p className="text-sm text-slate-500 mb-4">برنامه با مشکل مواجه شد. لطفاً برنامه را مجدداً باز کنید.</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold"
            >
              تلاش مجدد
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
