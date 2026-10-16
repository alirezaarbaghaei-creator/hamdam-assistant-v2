/**
 * Kateb API client — calls a PHP JSON API endpoint.
 * The base URL is configurable from the admin panel and stored in localStorage.
 */

import { getItem, setItem, removeItem } from './safeStorage';

const DEFAULT_API_URL = 'https://app.kateb.site/api/index.php';
const STORAGE_KEY = 'kateb_api_url';

function getApiUrl(): string {
  return getItem(STORAGE_KEY) || DEFAULT_API_URL;
}

export function setApiUrl(url: string) {
  if (url) setItem(STORAGE_KEY, url);
  else removeItem(STORAGE_KEY);
}

export function getStoredApiUrl(): string {
  return getItem(STORAGE_KEY) || DEFAULT_API_URL;
}

function getToken(): string | null {
  return getItem('kateb_token');
}

function setToken(token: string | null) {
  if (token) setItem('kateb_token', token);
  else removeItem('kateb_token');
}

export class OfflineError extends Error {
  constructor() {
    super('اینترنت شما قطع است. لطفاً اتصال خود را بررسی کنید.');
    this.name = 'OfflineError';
  }
}

export async function apiCall(action: string, body?: Record<string, unknown>): Promise<any> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new OfflineError();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(getApiUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new OfflineError();
    }
    throw new Error('ارتباط با سرور برقرار نشد. لطفاً اینترنت خود را بررسی کنید.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `API error ${res.status}`);
  }
  return data;
}

// ─── Auth ─────────────────────────────────────────────────────
export async function otpSend(phone: string): Promise<{ code?: string; message: string; is_existing_user: boolean }> {
  const data = await apiCall('otp_send', { phone });
  return { code: data.code, message: data.message ?? 'کد ارسال شد', is_existing_user: data.is_existing_user ?? false };
}

export async function otpVerify(
  phone: string,
  code: string,
  fullName?: string,
  password?: string,
): Promise<{ token: string; user: AppUser; is_new_user: boolean }> {
  const data = await apiCall('otp_verify', { phone, code, full_name: fullName, password });
  setToken(data.session.access_token);
  return {
    token: data.session.access_token,
    user: data.session.user,
    is_new_user: data.is_new_user,
  };
}

export async function passwordLogin(
  phone: string,
  password: string,
): Promise<{ token: string; user: AppUser }> {
  const data = await apiCall('password_login', { phone, password });
  setToken(data.session.access_token);
  return { token: data.session.access_token, user: data.session.user };
}

export async function setPassword(password: string): Promise<void> {
  await apiCall('set_password', { password });
}

export async function updateAccount(fullName: string): Promise<AppUser | null> {
  const data = await apiCall('update_account', { full_name: fullName });
  return data.user ?? null;
}

export async function getMe(): Promise<AppUser | null> {
  try {
    const data = await apiCall('me');
    return data.user;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  try { await apiCall('signout'); } catch {}
  setToken(null);
}

export function isAuthed(): boolean {
  return !!getToken();
}

// ─── Profiles ─────────────────────────────────────────────────
export async function fetchProfilesApi() {
  return apiCall('profiles_list').then((d) => d.data ?? []);
}
export async function createProfileApi(p: Record<string, unknown>) {
  return apiCall('profiles_create', p).then((d) => d.data);
}
export async function updateProfileApi(id: string, patch: Record<string, unknown>) {
  return apiCall('profiles_update', { id, ...patch });
}
export async function deleteProfileApi(id: string) {
  return apiCall('profiles_delete', { id });
}

// ─── Letters ──────────────────────────────────────────────────
export async function fetchLettersApi() {
  return apiCall('letters_list').then((d) => d.data ?? []);
}
export async function createLetterApi(l: Record<string, unknown>) {
  return apiCall('letters_create', l).then((d) => d.data);
}
export async function updateLetterApi(id: string, patch: Record<string, unknown>) {
  return apiCall('letters_update', { id, ...patch });
}
export async function deleteLetterApi(id: string) {
  return apiCall('letters_delete', { id });
}
export async function rateLetterApi(id: string, rating: number) {
  return apiCall('letters_rate', { id, rating }).then((d) => d);
}

// ─── Drafts ───────────────────────────────────────────────────
export async function fetchDraftsApi() {
  return apiCall('drafts_list').then((d) => d.data ?? []);
}
export async function saveDraftApi(d: Record<string, unknown>) {
  return apiCall('drafts_save', d).then((r) => r.data);
}
export async function deleteDraftApi(id: string) {
  return apiCall('drafts_delete', { id });
}

// ─── Templates ───────────────────────────────────────────────
export async function fetchTemplatesApi(search?: string, includePending?: boolean) {
  return apiCall('templates_list', { search: search ?? '', include_pending: includePending ?? false }).then((d) => ({ data: d.data ?? [], total: d.total ?? 0 }));
}
export async function createTemplateApi(t: Record<string, unknown>) {
  return apiCall('templates_create', t).then((d) => d.data);
}
export async function rateTemplateApi(templateId: string, rating: number) {
  return apiCall('templates_rate', { template_id: templateId, rating }).then((d) => d.data);
}
export async function updateTemplateRatingApi(templateId: string, rating: number) {
  return apiCall('templates_update_rating', { template_id: templateId, rating }).then((d) => d.data);
}
export async function deleteTemplateApi(id: string) {
  return apiCall('templates_delete', { id });
}

// ─── Admin Templates ───────────────────────────────────────────
export interface AdminTemplateRow {
  id: string;
  title: string;
  raw_request: string;
  creator_name: string;
  is_approved: boolean;
  sample_content: string;
  letter_type: Record<string, unknown>;
  created_at: string;
  rating: number;
  rating_count: number;
}

export async function adminTemplatesListApi(): Promise<{ data: AdminTemplateRow[]; total: number }> {
  return apiCall('admin_templates_list').then((d) => ({ data: (d.data ?? []) as AdminTemplateRow[], total: d.total ?? 0 }));
}
export async function adminTemplateApproveApi(id: string): Promise<void> {
  await apiCall('admin_template_approve', { id });
}
export async function adminTemplateRejectApi(id: string): Promise<void> {
  await apiCall('admin_template_reject', { id });
}

// ─── Coins ─────────────────────────────────────────────────────
export async function coinsBalanceApi(): Promise<number> {
  return apiCall('coins_balance').then((d) => d.coins ?? 0);
}
export async function coinsDeductApi(amount: number, reason: string): Promise<{ coins: number } | null> {
  try {
    const d = await apiCall('coins_deduct', { amount, reason });
    return { coins: d.coins ?? 0 };
  } catch {
    return null;
  }
}

// ─── Discovery Usage ──────────────────────────────────────────
export async function getDiscoveryCountApi() {
  return apiCall('discovery_count').then((d) => d.count ?? 0);
}
export async function recordDiscoveryApi(queryText: string) {
  return apiCall('discovery_record', { query_text: queryText });
}

// ─── Plan Usage ──────────────────────────────────────────────
export async function incrementAiUsageApi(): Promise<number> {
  return apiCall('increment_ai_usage').then((d) => d.ai_assistant_usage_this_month ?? 0);
}
export async function incrementTemplateUsageApi(): Promise<number> {
  return apiCall('increment_template_usage').then((d) => d.template_usage_this_month ?? 0);
}
export async function usageGetApi(): Promise<{ plan_type: string; ai_assistant_usage_this_month: number; template_usage_this_month: number; expires_at: string | null; cycle_start: string | null }> {
  return apiCall('usage_get').then((d) => d);
}

// ─── Admin ────────────────────────────────────────────────────
export interface AppUser {
  id: string;
  phone: string;
  full_name: string;
  is_admin?: boolean;
  coins?: number;
  plan_type?: string;
  credits_remaining?: number;
  ai_assistant_usage_this_month?: number;
  template_usage_this_month?: number;
}

export interface AdminUserRow {
  id: string;
  phone: string;
  full_name: string;
  is_admin: boolean;
  coins: number;
  plan_type?: string;
  created_at: string;
}

export interface AdminSettings {
  sms_api_key: string;
  sms_pattern_code: string;
  sms_line_number: string;
  ai_api_url: string;
  ai_api_key: string;
  ai_models: string;
  zarinpal_merchant_id: string;
  zarinpal_sandbox: boolean;
  bazaar_client_id: string;
  bazaar_client_secret: string;
  bazaar_refresh_token: string;
}

export interface AdminStats {
  users: number;
  letters: number;
  drafts: number;
  templates: number;
  discovery: number;
  /** Hamdam product tables */
  events?: number;
  tasks?: number;
  occasions?: number;
}

export async function adminUsersList(): Promise<AdminUserRow[]> {
  return apiCall('admin_users_list').then((d) => d.data ?? []);
}

export async function adminUserCreate(p: {
  phone: string; password: string; full_name?: string; is_admin?: boolean;
}): Promise<string | null> {
  const d = await apiCall('admin_user_create', p);
  return d.data?.id ?? null;
}

export async function adminUserUpdate(id: string, patch: {
  full_name?: string; is_admin?: boolean; password?: string;
}): Promise<void> {
  await apiCall('admin_user_update', { id, ...patch });
}

export async function adminUserDelete(id: string): Promise<void> {
  await apiCall('admin_user_delete', { id });
}

export async function adminSettingsGet(): Promise<AdminSettings | null> {
  return apiCall('admin_settings_get').then((d) => d.data ?? null);
}

export async function adminSettingsUpdate(patch: Partial<AdminSettings>): Promise<void> {
  await apiCall('admin_settings_update', patch);
}

export async function aiTestApi(): Promise<{ success: boolean; message: string; response?: string }> {
  try {
    const data = await apiCall('ai_test');
    return { success: !!data.success, message: data.message ?? 'پاسخی دریافت نشد', response: data.response };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'خطا در اتصال' };
  }
}

export async function adminStatsGet(): Promise<AdminStats> {
  return apiCall('admin_stats').then((d) => d.data ?? { users: 0, letters: 0, drafts: 0, templates: 0, discovery: 0, events: 0, tasks: 0, occasions: 0 });
}

export async function adminUserSetCoins(id: string, coins: number): Promise<void> {
  await apiCall('admin_user_set_coins', { id, coins });
}

export async function adminUserAddCoins(id: string, amount: number): Promise<void> {
  await apiCall('admin_user_add_coins', { id, amount });
}

export async function adminUserSetPlan(id: string, planId: string): Promise<void> {
  await apiCall('admin_user_set_plan', { id, plan_id: planId });
}

// ─── Zarinpal Payments ─────────────────────────────────────────
export interface CoinPackage {
  id: string;
  coins: number;
  price: number;
  label: string;
  popular?: boolean;
}

const ZARINPAL_CALLBACK_URL =
  import.meta.env.VITE_ZARINPAL_CALLBACK_URL ||
  'https://app.kateb.site/payment/callback';

export async function coinPackagesApi(): Promise<CoinPackage[]> {
  return apiCall('coin_packages').then((d) => d.data ?? []);
}

export async function zarinpalRequestApi(packageId: string): Promise<{ redirect_url: string; authority: string; order_id: string }> {
  const d = await apiCall('zarinpal_request', { package_id: packageId, callback_url: ZARINPAL_CALLBACK_URL });
  if (!d.data) throw new Error('پاسخ درگاه پرداخت نامعتبر است');
  return d.data;
}

export async function zarinpalVerifyApi(authority: string, status: string): Promise<{ success: boolean; coins?: number; added?: number; ref_id?: string; already_paid?: boolean } | null> {
  try {
    const d = await apiCall('zarinpal_verify', { authority, status });
    return d;
  } catch {
    return null;
  }
}

export async function paymentCallbackApi(authority: string, status: string): Promise<{ success: boolean; status: string; order_id?: string; coins?: number; added?: number; ref_id?: string; already_paid?: boolean; message?: string } | null> {
  try {
    const d = await apiCall('payment_callback', { authority, status });
    return d;
  } catch {
    return null;
  }
}

export async function paymentStatusApi(orderId: string): Promise<{ success: boolean; status: string; order_id: string; coins: number; ref_id: string } | null> {
  try {
    const d = await apiCall('payment_status', { order_id: orderId });
    return d;
  } catch {
    return null;
  }
}

export async function coinOrdersListApi(): Promise<any[]> {
  return apiCall('coin_orders_list').then((d) => d.data ?? []);
}

// ─── Plan Purchase via Zarinpal ───────────────────────────────
export async function planPurchaseRequestApi(planId: string, durationMonths: number = 1): Promise<{ redirect_url: string; authority: string; order_id: string }> {
  const d = await apiCall('plan_request', { plan_id: planId, duration_months: durationMonths, callback_url: ZARINPAL_CALLBACK_URL });
  if (!d.data) throw new Error('پاسخ درگاه پرداخت نامعتبر است');
  return d.data;
}

// ─── Plan Transactions (user-facing) ──────────────────────────
export async function planTransactionsListApi(): Promise<any[]> {
  return apiCall('plan_transactions_list').then((d) => d.data ?? []);
}

// ─── Cafe Bazaar Purchase Verification ────────────────────────
export interface BazaarVerifyResult {
  success: boolean;
  plan_id?: string;
  duration_months?: number;
  expires_at?: string;
  already_processed?: boolean;
  message?: string;
}

export async function bazaarPurchaseVerifyApi(
  productId: string,
  purchaseToken: string,
): Promise<BazaarVerifyResult> {
 const d = await apiCall('bazaar_purchase_verify', { product_id: productId, purchase_token: purchaseToken });
  return { success: !!d.success, ...d.data };
}

// ─── Admin Subscriptions & Transactions ───────────────────────
export async function adminSubsListApi(): Promise<any[]> {
  return apiCall('admin_subs_list').then((d) => d.data ?? []);
}
export async function adminTransactionsListApi(): Promise<any[]> {
  return apiCall('admin_transactions_list').then((d) => d.data ?? []);
}

// ─── Hamdam: AI assistant + occasions + manager sync ──────────
/** Structured natural-language parsing through the server AI proxy.
 *  Dates are resolved server-side (Jalali, Asia/Tehran) — the same
 *  kateb_settings credentials and transport as the legacy ai_proxy. */
export async function aiAssistApi(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  opts?: { temperature?: number; max_tokens?: number },
) {
  return apiCall('ai_assist', { messages, ...opts });
}

/** Reference occasions (public — no auth required) */
export async function holidaysAllApi(): Promise<Record<string, unknown>[]> {
  return apiCall('holidays_all').then((d) => d.data ?? []);
}

/** Local-first sync of assistant-created items (server-side durable copy) */
export async function managerEventSaveApi(p: Record<string, unknown>) {
  return apiCall('manager_event_save', p);
}
export async function managerTaskSaveApi(p: Record<string, unknown>) {
  return apiCall('manager_task_save', p);
}
export async function managerTaskDeleteApi(id: string) {
  return apiCall('manager_task_delete', { id });
}
export async function managerEventDeleteApi(id: string) {
  return apiCall('manager_event_delete', { id });
}

// ─── Hamdam admin: occasions management ────────────────────────
export async function adminOccasionSaveApi(p: {
  title: string;
  jalali_date: string;
  type?: string;
  is_official_holiday?: boolean;
  description?: string;
}): Promise<{ id: string; gregorian_date: string }> {
  return apiCall('admin_occasion_save', p).then((d) => d.data);
}
export async function adminOccasionDeleteApi(id: string): Promise<void> {
  await apiCall('admin_occasion_delete', { id });
}
