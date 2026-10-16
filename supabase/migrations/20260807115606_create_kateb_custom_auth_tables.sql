/*
# Create custom auth tables for phone-based OTP authentication

## Purpose
The Kateb app uses phone-based OTP authentication (IranPayamak/Faraz SMS),
NOT Supabase's built-in email/password auth. The existing tables have FK
constraints to auth.users(id) which don't work with custom phone auth.

This migration:
1. Creates kateb_users, kateb_otp_codes, kateb_sessions tables
2. Drops existing RLS policies (they use auth.uid() which won't work)
3. Drops auth.users FK constraints from existing tables (no new FK added
   to avoid breaking existing rows; edge function enforces ownership)

## New Tables
### kateb_users — phone-based users (id, phone, full_name, created_at)
### kateb_otp_codes — OTP codes (id, phone, code, expires_at, used, created_at)
### kateb_sessions — auth tokens (token, user_id, phone, created_at, expires_at)

## Modified Tables
- profiles, generated_letters, templates, drafts, discovery_usage:
  auth.users FK constraint dropped; user_id remains a plain uuid column

## Security
- RLS enabled on all tables, no anon/authenticated policies (deny by default)
- Edge function uses service role key (bypasses RLS) and enforces
  ownership checks via session token lookup in application code
*/

-- ─── Step 1: Create custom auth tables FIRST ──────────────────

CREATE TABLE IF NOT EXISTS kateb_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text UNIQUE NOT NULL,
    full_name text DEFAULT '',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kateb_otp_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text NOT NULL,
    code text NOT NULL,
    expires_at timestamptz NOT NULL,
    used boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kateb_sessions (
    token text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES kateb_users(id) ON DELETE CASCADE,
    phone text NOT NULL,
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz NOT NULL
);

ALTER TABLE kateb_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE kateb_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kateb_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_kateb_otp_phone ON kateb_otp_codes(phone, created_at);
CREATE INDEX IF NOT EXISTS idx_kateb_sessions_user ON kateb_sessions(user_id);

-- ─── Step 2: Drop ALL existing RLS policies ───────────────────

DROP POLICY IF EXISTS "select_own_profiles" ON profiles;
DROP POLICY IF EXISTS "insert_own_profiles" ON profiles;
DROP POLICY IF EXISTS "update_own_profiles" ON profiles;
DROP POLICY IF EXISTS "delete_own_profiles" ON profiles;

DROP POLICY IF EXISTS "select_own_letters" ON generated_letters;
DROP POLICY IF EXISTS "insert_own_letters" ON generated_letters;
DROP POLICY IF EXISTS "update_own_letters" ON generated_letters;
DROP POLICY IF EXISTS "delete_own_letters" ON generated_letters;

DROP POLICY IF EXISTS "select_own_templates" ON templates;
DROP POLICY IF EXISTS "insert_own_templates" ON templates;
DROP POLICY IF EXISTS "update_own_templates" ON templates;
DROP POLICY IF EXISTS "delete_own_templates" ON templates;

DROP POLICY IF EXISTS "select_own_drafts" ON drafts;
DROP POLICY IF EXISTS "insert_own_drafts" ON drafts;
DROP POLICY IF EXISTS "update_own_drafts" ON drafts;
DROP POLICY IF EXISTS "delete_own_drafts" ON drafts;

DROP POLICY IF EXISTS "select_own_discovery_usage" ON discovery_usage;
DROP POLICY IF EXISTS "insert_own_discovery_usage" ON discovery_usage;
DROP POLICY IF EXISTS "update_own_discovery_usage" ON discovery_usage;
DROP POLICY IF EXISTS "delete_own_discovery_usage" ON discovery_usage;

-- ─── Step 3: Drop auth.users FK constraints ───────────────────
-- Don't add new FK to kateb_users (existing rows would violate it).
-- Edge function enforces ownership via session token lookup.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE profiles ALTER COLUMN user_id DROP DEFAULT;

ALTER TABLE generated_letters DROP CONSTRAINT IF EXISTS generated_letters_user_id_fkey;
ALTER TABLE generated_letters ALTER COLUMN user_id DROP DEFAULT;

ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_user_id_fkey;
ALTER TABLE templates ALTER COLUMN user_id DROP DEFAULT;

ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_user_id_fkey;
ALTER TABLE drafts ALTER COLUMN user_id DROP DEFAULT;

ALTER TABLE discovery_usage DROP CONSTRAINT IF EXISTS discovery_usage_user_id_fkey;
ALTER TABLE discovery_usage ALTER COLUMN user_id DROP DEFAULT;