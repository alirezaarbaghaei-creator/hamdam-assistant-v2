/*
# Zarinpal payments + coin packages

## Purpose
- Users buy coins via Zarinpal payment gateway
- Admin configures Zarinpal merchant ID
- Track payment orders

## New Tables
### coin_orders
- id (uuid PK)
- user_id (uuid)
- amount_toman (integer) — payment amount in Toman
- coins (integer) — coins to credit
- status (text: pending/paid/failed)
- authority (text) — Zarinpal authority code
- ref_id (text, nullable) — Zarinpal reference ID on success
- created_at, paid_at

## Modified Tables
### kateb_settings
- zarinpal_merchant_id (text)
- zarinpal_sandbox (boolean, default true)
*/

ALTER TABLE kateb_settings ADD COLUMN IF NOT EXISTS zarinpal_merchant_id text DEFAULT '';
ALTER TABLE kateb_settings ADD COLUMN IF NOT EXISTS zarinpal_sandbox boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS coin_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_toman integer NOT NULL,
  coins integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  authority text DEFAULT '',
  ref_id text,
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE coin_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_orders" ON coin_orders;
CREATE POLICY "select_own_orders" ON coin_orders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_orders" ON coin_orders;
CREATE POLICY "insert_own_orders" ON coin_orders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_coin_orders_user ON coin_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_orders_authority ON coin_orders(authority);