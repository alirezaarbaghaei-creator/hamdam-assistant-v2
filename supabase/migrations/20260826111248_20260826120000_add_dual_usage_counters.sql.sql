/*
# Add Dual Usage Counters for Subscription System

## Overview
Replaces the single "credits_remaining" counter with two monthly usage counters:
1. ai_assistant_usage_this_month — counts AI assistant discoveries (informal request → template)
2. template_usage_this_month — counts ready/saved template usages (template → letter)

Also adds a usage_cycle_start date to track when the current billing cycle began,
so counters can be automatically reset at the beginning of each new cycle.

## Modified Tables

### `kateb_users`
- Added `ai_assistant_usage_this_month` (integer, default 0)
- Added `template_usage_this_month` (integer, default 0)
- Added `usage_cycle_start` (timestamptz, default now()) — start of current billing cycle

### `subscriptions`
- Added `ai_assistant_limit` (integer) — monthly AI assistant limit for this plan
- Added `template_limit` (integer) — monthly template limit for this plan
- Added `ai_assistant_usage` (integer, default 0) — usage this cycle
- Added `template_usage` (integer, default 0) — usage this cycle
- Added `cycle_start` (timestamptz) — start of current billing cycle

## Security
- RLS already enabled on both tables. No new policies needed; existing ownership policies apply.
*/

-- ─── Add usage columns to kateb_users ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kateb_users' AND column_name = 'ai_assistant_usage_this_month') THEN
    ALTER TABLE kateb_users ADD COLUMN ai_assistant_usage_this_month integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kateb_users' AND column_name = 'template_usage_this_month') THEN
    ALTER TABLE kateb_users ADD COLUMN template_usage_this_month integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kateb_users' AND column_name = 'usage_cycle_start') THEN
    ALTER TABLE kateb_users ADD COLUMN usage_cycle_start timestamptz DEFAULT now();
  END IF;
END $$;

-- ─── Add usage columns to subscriptions ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'ai_assistant_limit') THEN
    ALTER TABLE subscriptions ADD COLUMN ai_assistant_limit integer NOT NULL DEFAULT 3;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'template_limit') THEN
    ALTER TABLE subscriptions ADD COLUMN template_limit integer NOT NULL DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'ai_assistant_usage') THEN
    ALTER TABLE subscriptions ADD COLUMN ai_assistant_usage integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'template_usage') THEN
    ALTER TABLE subscriptions ADD COLUMN template_usage integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'cycle_start') THEN
    ALTER TABLE subscriptions ADD COLUMN cycle_start timestamptz DEFAULT now();
  END IF;
END $$;
