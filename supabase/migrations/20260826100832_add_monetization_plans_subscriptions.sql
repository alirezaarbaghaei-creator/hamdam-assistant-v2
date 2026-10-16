/*
# Add Monetization & Pricing System

## Overview
This migration adds a complete subscription and plan-based monetization system to the Kateb app.
It introduces pricing plans (Free, Pay-As-You-Go, Pro, Business), tracks active subscriptions
per user, and records plan purchase transactions.

## New Tables

### `subscriptions`
Tracks each user's active or expired subscription to a pricing plan.
- `id` (uuid PK)
- `user_id` (uuid, references kateb_users)
- `plan_id` (text: 'free' | 'payg' | 'pro' | 'business')
- `status` (text: 'active' | 'expired' | 'cancelled')
- `credits_remaining` (integer, remaining letter credits for this subscription)
- `credits_total` (integer, total credits purchased with this plan)
- `price_toman` (integer, amount paid in Tomans)
- `started_at` (timestamptz, when the subscription began)
- `expires_at` (timestamptz, when it expires — NULL for payg/no-expiry plans)
- `authority` (text, ZarinPal authority for payment tracking)
- `ref_id` (text, ZarinPal reference ID after successful payment)
- `created_at` (timestamptz)

### `plan_transactions`
Records every plan purchase attempt (success or failure).
- `id` (uuid PK)
- `user_id` (uuid, references kateb_users)
- `plan_id` (text)
- `amount_toman` (integer)
- `status` (text: 'pending' | 'paid' | 'failed')
- `authority` (text, ZarinPal authority)
- `ref_id` (text, ZarinPal reference ID)
- `created_at` (timestamptz)
- `paid_at` (timestamptz)

## Modified Tables

### `kateb_users`
- Added `plan_type` column (text, default 'free') — current active plan
- Added `credits_remaining` column (integer, default 3) — free credits on signup

## Security
- RLS enabled on both new tables.
- Policies: users can CRUD only their own subscriptions and transactions.
- 4 separate policies per table (SELECT, INSERT, UPDATE, DELETE).
*/

-- ─── Add columns to kateb_users ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kateb_users' AND column_name = 'plan_type') THEN
    ALTER TABLE kateb_users ADD COLUMN plan_type text NOT NULL DEFAULT 'free';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kateb_users' AND column_name = 'credits_remaining') THEN
    ALTER TABLE kateb_users ADD COLUMN credits_remaining integer NOT NULL DEFAULT 3;
  END IF;
END $$;

-- ─── subscriptions table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES kateb_users(id) ON DELETE CASCADE,
  plan_id text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  credits_remaining integer NOT NULL DEFAULT 0,
  credits_total integer NOT NULL DEFAULT 0,
  price_toman integer NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  authority text DEFAULT '',
  ref_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscriptions" ON subscriptions;
CREATE POLICY "select_own_subscriptions" ON subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_subscriptions" ON subscriptions;
CREATE POLICY "insert_own_subscriptions" ON subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_subscriptions" ON subscriptions;
CREATE POLICY "update_own_subscriptions" ON subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_subscriptions" ON subscriptions;
CREATE POLICY "delete_own_subscriptions" ON subscriptions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ─── plan_transactions table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES kateb_users(id) ON DELETE CASCADE,
  plan_id text NOT NULL,
  amount_toman integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  authority text DEFAULT '',
  ref_id text,
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE plan_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_plan_transactions" ON plan_transactions;
CREATE POLICY "select_own_plan_transactions" ON plan_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_plan_transactions" ON plan_transactions;
CREATE POLICY "insert_own_plan_transactions" ON plan_transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_plan_transactions" ON plan_transactions;
CREATE POLICY "update_own_plan_transactions" ON plan_transactions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_plan_transactions" ON plan_transactions;
CREATE POLICY "delete_own_plan_transactions" ON plan_transactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_plan_transactions_user_id ON plan_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_transactions_status ON plan_transactions(status);
