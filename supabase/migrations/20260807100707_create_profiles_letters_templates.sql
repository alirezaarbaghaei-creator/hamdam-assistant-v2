/*
# Create per-user tables: profiles, generated_letters, templates

## Purpose
Each authenticated user must have their own isolated data for:
- Sender profiles (name, national ID, org, job title, extra fields)
- Generated letters (archive of completed documents)
- Saved templates (reusable letter types with user ratings)

All tables are owner-scoped via user_id with RLS policies.

## New Tables

### 1. profiles
- id (uuid PK)
- user_id (uuid, defaults to auth.uid(), FK to auth.users)
- full_name (text)
- national_id (text)
- employee_code (text)
- organization (text)
- job_title (text)
- extra_fields (jsonb, for AI-suggested additional fields)
- is_default (boolean)
- created_at (timestamptz)

### 2. generated_letters
- id (uuid PK)
- user_id (uuid, defaults to auth.uid(), FK to auth.users)
- letter_type_id (text)
- template_id (text)
- template_title (text)
- profile_id (text, nullable)
- title (text)
- content (text)
- field_values (jsonb)
- status (text, default 'draft')
- quality_score (integer, nullable)
- quality_feedback (text, nullable)
- created_at (timestamptz)
- updated_at (timestamptz)

### 3. templates
- id (uuid PK)
- user_id (uuid, defaults to auth.uid(), FK to auth.users)
- letter_type (jsonb)
- title (text)
- raw_request (text)
- rating (numeric, default 0)
- rating_count (integer, default 0)
- created_at (timestamptz)

## Security
- RLS enabled on all tables
- Owner-scoped CRUD policies (auth.uid() = user_id) for each table
- user_id columns default to auth.uid() so inserts without explicit user_id succeed
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  national_id text DEFAULT '',
  employee_code text DEFAULT '',
  organization text DEFAULT '',
  job_title text DEFAULT '',
  extra_fields jsonb DEFAULT '{}'::jsonb,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profiles" ON profiles;
CREATE POLICY "select_own_profiles" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_profiles" ON profiles;
CREATE POLICY "insert_own_profiles" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_profiles" ON profiles;
CREATE POLICY "update_own_profiles" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_profiles" ON profiles;
CREATE POLICY "delete_own_profiles" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS generated_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  letter_type_id text DEFAULT '',
  template_id text DEFAULT '',
  template_title text DEFAULT '',
  profile_id text,
  title text NOT NULL DEFAULT '',
  content text DEFAULT '',
  field_values jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'draft',
  quality_score integer,
  quality_feedback text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE generated_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_letters" ON generated_letters;
CREATE POLICY "select_own_letters" ON generated_letters FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_letters" ON generated_letters;
CREATE POLICY "insert_own_letters" ON generated_letters FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_letters" ON generated_letters;
CREATE POLICY "update_own_letters" ON generated_letters FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_letters" ON generated_letters;
CREATE POLICY "delete_own_letters" ON generated_letters FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  letter_type jsonb NOT NULL DEFAULT '{}'::jsonb,
  title text NOT NULL DEFAULT '',
  raw_request text DEFAULT '',
  rating numeric DEFAULT 0,
  rating_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_templates" ON templates;
CREATE POLICY "select_own_templates" ON templates FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_templates" ON templates;
CREATE POLICY "insert_own_templates" ON templates FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_templates" ON templates;
CREATE POLICY "update_own_templates" ON templates FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_templates" ON templates;
CREATE POLICY "delete_own_templates" ON templates FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_letters_user_id ON generated_letters(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);