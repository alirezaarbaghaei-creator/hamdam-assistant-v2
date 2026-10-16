/*
# Create discovery_usage and drafts tables

## Overview
Creates two new tables to support user accounts:
1. `discovery_usage` — tracks each user's AI smart-discovery requests (limited to 5 free uses per user)
2. `drafts` — stores incomplete conversations so users can resume them later

## New Tables

### discovery_usage
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users, defaults to auth.uid())
- `query_text` (text, the user's natural language request)
- `created_at` (timestamptz)

### drafts
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users, defaults to auth.uid())
- `title` (text, display name for the draft)
- `letter_type` (jsonb, serialized LetterType object)
- `discovered_letter` (jsonb, serialized DiscoveredLetter or null)
- `field_values` (jsonb, collected field values so far)
- `chat_messages` (jsonb, conversation messages)
- `step` (integer, current step in the conversation)
- `phase` (text, conversation phase)
- `use_profile` (boolean, whether to use profile data)
- `include_optional` (boolean, whether to include optional fields)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

## Security
- RLS enabled on both tables
- Users can only access their own rows (auth.uid() = user_id)
- user_id defaults to auth.uid() so inserts work without explicit user_id
- Four policies per table (SELECT, INSERT, UPDATE, DELETE) scoped to authenticated users

## Indexes
- Index on user_id for both tables for faster queries
*/

-- discovery_usage table
CREATE TABLE IF NOT EXISTS discovery_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE discovery_usage ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_discovery_usage_user_id ON discovery_usage(user_id);

DROP POLICY IF EXISTS "select_own_discovery_usage" ON discovery_usage;
CREATE POLICY "select_own_discovery_usage" ON discovery_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_discovery_usage" ON discovery_usage;
CREATE POLICY "insert_own_discovery_usage" ON discovery_usage
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_discovery_usage" ON discovery_usage;
CREATE POLICY "update_own_discovery_usage" ON discovery_usage
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_discovery_usage" ON discovery_usage;
CREATE POLICY "delete_own_discovery_usage" ON discovery_usage
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- drafts table
CREATE TABLE IF NOT EXISTS drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  letter_type jsonb NOT NULL DEFAULT '{}',
  discovered_letter jsonb,
  field_values jsonb NOT NULL DEFAULT '{}',
  chat_messages jsonb NOT NULL DEFAULT '[]',
  step integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'chat',
  use_profile boolean NOT NULL DEFAULT true,
  include_optional boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);

DROP POLICY IF EXISTS "select_own_drafts" ON drafts;
CREATE POLICY "select_own_drafts" ON drafts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_drafts" ON drafts;
CREATE POLICY "insert_own_drafts" ON drafts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_drafts" ON drafts;
CREATE POLICY "update_own_drafts" ON drafts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_drafts" ON drafts;
CREATE POLICY "delete_own_drafts" ON drafts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
