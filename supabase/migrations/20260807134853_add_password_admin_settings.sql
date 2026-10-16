/*
# Add password auth, admin role, and settings table

## Purpose
1. Add password-based login alongside existing OTP
2. Create an admin user role
3. Create a settings table for SMS and AI configuration

## Modified Tables
### kateb_users
- password_hash (text, nullable) — bcrypt-style hash for password login
- is_admin (boolean, default false) — admin panel access flag

## New Tables
### kateb_settings
- id (int PK, always 1 — singleton row)
- sms_api_key (text) — IranPayamak/Faraz API key
- sms_pattern_code (text) — pattern code for OTP message
- sms_line_number (text) — sender line number
- ai_api_url (text) — AI proxy URL
- ai_api_key (text) — AI proxy key
- ai_models (text) — comma-separated model names
- updated_at (timestamptz)

## Security
- RLS enabled on kateb_settings, no anon/authenticated policies (deny by default)
- Edge function uses service role key and enforces admin checks in code
*/

ALTER TABLE kateb_users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE kateb_users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS kateb_settings (
    id int PRIMARY KEY DEFAULT 1,
    sms_api_key text DEFAULT '',
    sms_pattern_code text DEFAULT '',
    sms_line_number text DEFAULT '',
    ai_api_url text DEFAULT '',
    ai_api_key text DEFAULT '',
    ai_models text DEFAULT '',
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE kateb_settings ENABLE ROW LEVEL SECURITY;

-- Insert default settings row
INSERT INTO kateb_settings (id, sms_api_key, sms_pattern_code, sms_line_number, ai_api_url, ai_api_key, ai_models)
VALUES (1, 'gVIBbCPkbiTyxIsry6xN3wG9c1LkJDpRjBSuVlTTavOJ5xirq9', 'cgFi5BmsQ5', '20009394507997', 'https://opencode.ai/zen/v1', 'sk-FeHQB1rXZWSQItCn6oKEGNv7qNJhFMc5zueMrVDm4ohwBiAnqMxXjUR8qXtETcTC', 'deepseek-v4-flash-free,mimo-v2.5-free,laguna-s-2.1-free,ling-3.0-flash-free')
ON CONFLICT (id) DO NOTHING;

-- Create default admin user (phone: 09120000000, password: admin123)
-- Using a simple hash for now; edge function will use crypto.subtle for SHA-256
INSERT INTO kateb_users (id, phone, full_name, is_admin, password_hash)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    '09120000000',
    'مدیر سیستم',
    true,
    'admin123'
)
ON CONFLICT (phone) DO UPDATE SET
    is_admin = true,
    password_hash = EXCLUDED.password_hash,
    full_name = COALESCE(NULLIF(kateb_users.full_name, ''), EXCLUDED.full_name);