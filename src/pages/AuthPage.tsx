import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PenLine, Phone, Loader2, AlertCircle, Sparkles, KeyRound, ArrowRight, Lock, Eye, EyeOff, User, FileText, X } from 'lucide-react';
import * as api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { ensureSmsAutofillPlugin, getSmsAutofillPluginSync } from '@/services/smsAutofillPlugin';
import type { SmsCodeEvent } from '@/services/smsAutofillPlugin';

type Step = 'phone' | 'otp' | 'register';
type Mode = 'otp' | 'password';

export function AuthPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const [mode, setMode] = useState<Mode>('otp');
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  /**
   * Mirror of isExistingUser for the SMS listener.
   *
   * The listener is registered once when the OTP step opens, which is BEFORE
   * otpSend() has answered whether this phone number is known. State captured
   * then would keep the stale initial `false` forever and every autofill would
   * be treated as a new user (code filled in, never submitted). A ref lets the
   * same listener always read the current answer without being torn down and
   * rebuilt — see the autofill effect for why re-running it is unsafe.
   */
  const isExistingUserRef = useRef(false);
  isExistingUserRef.current = isExistingUser;

  /**
   * Whether the user has granted notification access, probed on the phone step.
   *
   * State, not a ref, because the OTP screen renders a different block depending
   * on it and that block must disappear the moment access is granted: the user
   * leaves for Settings, flips the toggle, and comes back, so this has to re-probe
   * on resume and re-render without them reloading anything.
   */
  const [accessGranted, setAccessGranted] = useState(false);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setInterval(() => setTimer((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [timer]);

  /**
   * Checks notification access once when the phone step opens.
   *
   * Notification access is a Settings toggle rather than a runtime permission, so
   * there is no dialog to pre-empt and nothing to ask for here — this only reads
   * state. The first login shows a hint on the OTP screen with a button that calls
   * openSettings(); every login after that finds enabled=true and shows nothing.
   *
   * Fire-and-forget: no plugin (browser) or a failed probe leaves it false, which
   * just means manual code entry — autofill must never be able to block a login.
   */
  useEffect(() => {
    if (step !== 'phone') return;

    void (async () => {
      const ok = await ensureSmsAutofillPlugin();
      if (!ok) return;
      const plugin = getSmsAutofillPluginSync();
      if (!plugin) return;
      try {
        const res = await plugin.isEnabled();
        setAccessGranted(!!(res && res.enabled));
      } catch (err) {
        console.warn('[sms-autofill] isEnabled failed', err);
      }
    })();
  }, [step]);

  /**
   * Re-probes when the app comes back to the foreground.
   *
   * Needed because granting access happens OUTSIDE the app: the user taps the
   * button, lands in Settings, flips the toggle, and returns. Without this the OTP
   * screen would keep showing "enable autofill" with access already granted, and
   * the hint would only clear on the next login.
   *
   * visibilitychange rather than Capacitor's appStateChange, to avoid pulling in a
   * second plugin for one boolean; it fires on resume in the Android WebView, which
   * is the only case that matters here.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const plugin = getSmsAutofillPluginSync();
      if (!plugin) return;
      void (async () => {
        try {
          const res = await plugin.isEnabled();
          setAccessGranted(!!(res && res.enabled));
        } catch (err) {
          console.warn('[sms-autofill] isEnabled on resume failed', err);
        }
      })();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  /**
   * SMS autofill — active ONLY while the OTP step is on screen.
   *
   * Why the effect keys on [step] alone: the native plugin is a singleton
   * listener, so starting it once for the whole page would leave it reading
   * notifications during the phone, register and password steps too. Re-keying on
   * step makes "enter OTP step -> arm -> leave -> disarm" exact, and the plugin
   * drops every code that arrives while disarmed.
   *
   * Unlike the old RECEIVE_SMS version there is no registration race at all: the
   * system binds OtpNotificationListener for as long as notification access is
   * granted, so there is no window in which the code can arrive before anything is
   * listening. That was the entire reason autofill looked broken on device.
   *
   * isExistingUser is deliberately NOT a dependency, even though the handler
   * needs it. React batches the setIsExistingUser()/setStep() pair from
   * otpSend() into one commit, so today there would be no intermediate render —
   * but if that ever changed, the extra commit would run cleanup and the effect
   * body concurrently, and a stop() landing after the next start() would leave the
   * plugin disarmed and autofill silently dead. Reading the flag from a ref keeps
   * the handler current without re-running the effect, so there is exactly one
   * arm/disarm per OTP step and no ordering hazard.
   *
   * Everything is best-effort: no plugin (browser), access not granted, or a
   * failed start all resolve to plain manual entry with no error shown, because
   * autofill is a convenience and must never block a login.
   */
  useEffect(() => {
    if (step !== 'otp') return;

    let handle: { remove: () => void } | null = null;
    let cancelled = false;

    const run = async () => {
      const ok = await ensureSmsAutofillPlugin();
      if (!ok || cancelled) return;

      const plugin = getSmsAutofillPluginSync();
      if (!plugin) return;

      // addListener() must be awaited BEFORE start(): a code can arrive between
      // the two calls, and a listener armed ahead of its JS handler would read
      // the code and drop it on the floor.
      handle = await plugin.addListener('code', (data: SmsCodeEvent) => {
        if (!data || typeof data.code !== 'string') return;
        setCode(data.code);
        // Auto-submit only for a returning user. A new user still has to enter a
        // name and password, so their code is only filled in and the form waits.
        if (isExistingUserRef.current) {
          void runVerifyOtp(data.code);
        }
      });

      if (cancelled) {
        await handle.remove();
        return;
      }
      await plugin.start();
    };

    void run();

    return () => {
      cancelled = true;
      void handle?.remove();
      const plugin = getSmsAutofillPluginSync();
      if (plugin) void plugin.stop();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^09\d{9}$/.test(phone)) {
      setError('شماره موبایل نامعتبر است. مثال: 09123456789');
      return;
    }
    setLoading(true);
    try {
      const res = await api.otpSend(phone);
      setIsExistingUser(res.is_existing_user);
      setStep('otp');
      setTimer(120);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ارسال کد');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Single verification path for BOTH the submit button and SMS autofill.
   * Taking the code as an argument is what lets autofill reuse it: the 'code'
   * event arrives asynchronously, long after the closure over `code` state was
   * created, so reading `code` from state there would always verify a stale
   * (usually still empty) value.
   *
   * Autofill only auto-submits for a returning user. A new user still has to
   * enter a name and password first, so their code is only filled in and the
   * form is left waiting for the tap.
   */
  const runVerifyOtp = async (value: string) => {
    setError('');
    if (value.length !== 6) {
      setError('کد تایید باید ۶ رقم باشد');
      return;
    }
    // If new user, go to registration step to collect name + password
    if (!isExistingUser) {
      setStep('register');
      return;
    }
    // Existing user: verify and log in directly
    setLoading(true);
    try {
      const res = await api.otpVerify(phone, value);
      setSession(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'کد اشتباه است');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    void runVerifyOtp(code);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) {
      setError('نام و نام خانوادگی الزامی است');
      return;
    }
    if (password.length < 4) {
      setError('رمز عبور باید حداقل ۴ کاراکتر باشد');
      return;
    }
    if (!acceptedTerms) {
      setError('برای ثبت‌نام باید قوانین استفاده از اپلیکیشن را بپذیرید');
      return;
    }
    setLoading(true);
    try {
      const res = await api.otpVerify(phone, code, fullName, password);
      setSession(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت‌نام');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^09\d{9}$/.test(phone)) {
      setError('شماره موبایل نامعتبر است. مثال: 09123456789');
      return;
    }
    if (!password) {
      setError('رمز عبور را وارد کنید');
      return;
    }
    setLoading(true);
    try {
      const res = await api.passwordLogin(phone, password);
      setSession(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ورود');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.otpSend(phone);
      setIsExistingUser(res.is_existing_user);
      setTimer(120);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ارسال مجدد');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-surface">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute top-1/2 -left-40 h-96 w-96 rounded-full bg-cyan-200/20 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-80 w-80 rounded-full bg-sky-100/40 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="glass rounded-3xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 shadow-lg shadow-sky-500/30 mb-4">
              <PenLine className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">همدم</h1>
            <p className="text-sm text-slate-500 mt-1">همدم تقویم و برنامه‌ات</p>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-2 p-1 rounded-xl bg-slate-100/80 mb-6">
            <button
              onClick={() => { setMode('otp'); setStep('phone'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${
                mode === 'otp' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Phone className="h-4 w-4" />
              کد یکبار مصرف
            </button>
            <button
              onClick={() => { setMode('password'); setStep('phone'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${
                mode === 'password' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Lock className="h-4 w-4" />
              رمز عبور
            </button>
          </div>

          <AnimatePresence mode="wait">
            {/* ─── OTP MODE: PHONE STEP ─── */}
            {mode === 'otp' && step === 'phone' && (
              <motion.div key="otp-phone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-lg font-semibold text-slate-800 mb-2">ورود / ثبت‌نام</h2>
                <p className="text-sm text-slate-500 mb-6">شماره موبایل خود را وارد کنید تا کد تایید ارسال شود.</p>
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">شماره موبایل</label>
                    <div className="relative">
                      <Phone className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="tel" value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        placeholder="09123456789" required dir="ltr"
                        className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring text-left"
                      />
                    </div>
                  </div>
                  {error && <ErrorBox text={error} />}
                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-3.5 text-sm font-semibold hover:bg-sky-700 transition-colors shadow-lg shadow-sky-500/30 disabled:opacity-50">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'ارسال کد تایید'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ─── OTP MODE: OTP VERIFY STEP ─── */}
            {mode === 'otp' && step === 'otp' && (
              <motion.div key="otp-verify" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <button onClick={() => setStep('phone')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-4">
                  <ArrowRight className="h-3 w-3" /> تغییر شماره
                </button>
                <h2 className="text-lg font-semibold text-slate-800 mb-2">کد تایید</h2>
                <p className="text-sm text-slate-500 mb-6">کد ۶ رقمی ارسال شده به <span dir="ltr" className="font-medium">{phone}</span> را وارد کنید.</p>
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">کد تایید</label>
                    <div className="relative">
                      <KeyRound className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input type="text" inputMode="numeric" value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="------" required dir="ltr" autoComplete="one-time-code"
                        className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pr-11 pl-4 text-lg font-mono tracking-[0.5em] text-slate-900 placeholder:text-slate-300 focus-ring text-center"
                      />
                    </div>
                    {/* Two different messages depending on whether the user has
                        already enabled notification access. The probe runs on the
                        phone step, before the SMS was sent, so on every login
                        after the first it is already true and this whole block is
                        replaced by the quiet one-liner. */}
                    {!accessGranted && (
                      <div className="mt-2 rounded-lg bg-amber-50 border border-amber-100 p-2.5">
                        <p className="text-[11px] leading-relaxed text-amber-800 mb-2">
                          برای خواندن خودکار کد، دسترسی «اعلان‌ها» را برای همدم فعال کنید.
                          هیچ مجوز پیامکی درخواست نمی‌شود.
                        </p>
                        <button type="button"
                          onClick={async () => {
                            const plugin = getSmsAutofillPluginSync();
                            if (!plugin) return;
                            try {
                              await plugin.openSettings();
                            } catch (err) {
                              console.warn('[sms-autofill] openSettings failed', err);
                            }
                          }}
                          className="text-[11px] font-medium text-amber-700 underline">
                          فعال‌سازی خواندن خودکار
                        </button>
                      </div>
                    )}
                    {/* Covers the paths the listener cannot: a browser, a device
                        where the messaging app does not post the SMS as a
                        notification, or a ROM that hides notification bodies.
                        Kept subtle — the field above is the same one autofill
                        writes into, so a user who saw it fill itself in never
                        reads this line. */}
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                      کد به‌صورت خودکار خوانده می‌شود؛ در غیر این صورت می‌توانید از پیامک کپی کنید.
                    </p>
                  </div>
                  {error && <ErrorBox text={error} />}
                  <button type="submit" disabled={loading || code.length !== 6}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-3.5 text-sm font-semibold hover:bg-sky-700 transition-colors shadow-lg shadow-sky-500/30 disabled:opacity-50">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (isExistingUser ? 'تایید و ورود' : 'ادامه')}
                  </button>
                  <div className="flex items-center justify-between text-xs">
                    {timer > 0 ? (
                      <span className="text-slate-400">ارسال مجدد در {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}</span>
                    ) : (
                      <button onClick={handleResend} className="text-sky-600 hover:text-sky-700 font-medium">ارسال مجدد کد</button>
                    )}
                  </div>
                </form>
              </motion.div>
            )}

            {/* ─── OTP MODE: REGISTER STEP (new users only) ─── */}
            {mode === 'otp' && step === 'register' && (
              <motion.div key="otp-register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <button onClick={() => setStep('otp')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-4">
                  <ArrowRight className="h-3 w-3" /> بازگشت
                </button>
                <h2 className="text-lg font-semibold text-slate-800 mb-2">تکمیل ثبت‌نام</h2>
                <p className="text-sm text-slate-500 mb-6">نام و رمز عبور خود را برای ورود در دفعات بعدی وارد کنید.</p>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">نام و نام خانوادگی</label>
                    <div className="relative">
                      <User className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                        placeholder="مثلاً: علی محمدی" required dir="rtl"
                        className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">رمز عبور</label>
                    <div className="relative">
                      <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••" required dir="ltr"
                        className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pr-11 pl-11 text-sm text-slate-900 placeholder:text-slate-400 focus-ring text-left"
                      />
                      <button type="button" onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
                        tabIndex={-1}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-600">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {error && <ErrorBox text={error} />}
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                    />
                    <span className="text-xs text-slate-600 leading-relaxed">
                      قوانین استفاده از اپلیکیشن را خوانده و می‌پذیرم.{' '}
                      <button
                        type="button"
                        onClick={() => setShowTerms(true)}
                        className="text-sky-600 hover:text-sky-700 font-medium underline"
                      >
                        مشاهده قوانین
                      </button>
                    </span>
                  </label>
                  <button type="submit" disabled={loading || !acceptedTerms}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-3.5 text-sm font-semibold hover:bg-sky-700 transition-colors shadow-lg shadow-sky-500/30 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'ثبت‌نام و ورود'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ─── TERMS MODAL ─── */}
            {showTerms && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                onClick={() => setShowTerms(false)}
              >
                <motion.div
                  initial={{ scale: 0.92, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.92, y: 20 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="glass rounded-3xl p-6 shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-sky-500" />
                      قوانین استفاده از اپلیکیشن
                    </h3>
                    <button onClick={() => setShowTerms(false)} className="flex h-9 w-9 items-center justify-center rounded-xl glass text-slate-500 hover:text-slate-900 transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="overflow-y-auto flex-1 space-y-3 text-sm text-slate-700 leading-relaxed pl-2">
                    <p>۱. این اپلیکیشن برای کمک به نگارش مکتوب‌های رسمی و اداری طراحی شده است. محتوای تولیدشده توسط هوش مصنوعی باید پیش از استفاده توسط کاربر بررسی و تأیید شود.</p>
                    <p>۲. کاربر مسئولیت محتوای نهایی مکتوب‌ها را بر عهده دارد و اپلیکیشن هیچ مسئولیتی در قبال عواقب استفاده از متن‌های تولیدشده نمی‌پذیرد.</p>
                    <p>۳. اطلاعات شخصی کاربر (نام، سمت، سازمان) تنها برای نگارش مکتوب‌ها استفاده می‌شود و بدون رضایت کاربر با اشخاص ثالث به اشتراک گذاشته نمی‌شود.</p>
                    <p>۴. استفاده از اپلیکیشن برای مقاصد غیرقانونی، توهین‌آمیز، یا مخدوشننده نظم عمومی ممنوع است.</p>
                    <p>۵. حساب کاربری شخصی است و انتقال آن به شخص دیگر مجاز نیست. کاربر موظف است رمز عبور خود را محرمانه نگه دارد.</p>
                    <p>۶. اپلیکیشن حق محدود کردن یا قطع دسترسی کاربران در صورت تخلف از قوانین را برای خود محفوظ می‌دارد.</p>
                    <p>۷. طرح‌های اشتراک و اعتبارهای اختصاص‌یافته دارای محدودیت زمانی یا تعداد استفاده هستند و پس از انقضا غیرقابل استفاده می‌باشند.</p>
                    <p>۸. ادامه استفاده از اپلیکیشن به منزله پذیرش قوانین فوق تلقی می‌شود.</p>
                  </div>
                  <button
                    onClick={() => {
                      setAcceptedTerms(true);
                      setShowTerms(false);
                    }}
                    className="mt-4 w-full rounded-xl bg-sky-600 text-white py-2.5 text-sm font-semibold hover:bg-sky-700 transition-colors shadow-lg shadow-sky-500/30"
                  >
                    می‌پذیرم
                  </button>
                </motion.div>
              </motion.div>
            )}

            {/* ─── PASSWORD MODE ─── */}
            {mode === 'password' && (
              <motion.div key="password" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-lg font-semibold text-slate-800 mb-2">ورود با رمز عبور</h2>
                <p className="text-sm text-slate-500 mb-6">شماره موبایل و رمز عبور خود را وارد کنید.</p>
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">شماره موبایل</label>
                    <div className="relative">
                      <Phone className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input type="tel" value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        placeholder="09123456789" required dir="ltr"
                        className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pr-11 pl-4 text-sm text-slate-900 placeholder:text-slate-400 focus-ring text-left"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">رمز عبور</label>
                    <div className="relative">
                      <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input type={showPassword ? 'text' : 'password'} value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••" required dir="ltr"
                        className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pr-11 pl-11 text-sm text-slate-900 placeholder:text-slate-400 focus-ring text-left"
                      />
                      <button type="button" onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
                        tabIndex={-1}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-600">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {error && <ErrorBox text={error} />}
                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-3.5 text-sm font-semibold hover:bg-sky-700 transition-colors shadow-lg shadow-sky-500/30 disabled:opacity-50">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'ورود'}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 flex items-center gap-2 rounded-xl bg-amber-50/60 border border-amber-100 px-4 py-3">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">با ثبت‌نام، طرح آزمایشی رایگان دریافت کنید و بلافاصله شروع به نوشتن کنید.</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3"
    >
      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
      <p className="text-xs text-red-600">{text}</p>
    </motion.div>
  );
}
