/*
# Coins system, public templates with ratings, creator names

## Purpose
1. Each user gets 10 free coins
2. Discovery costs 5 coins, template use costs 1 coin
3. Templates are public — all authenticated users see all templates
4. Users rate templates; average rating and count displayed
5. Prevent duplicate ratings per user per template

## Modified Tables
### kateb_users
- coins (integer, default 10) — coin balance

### templates
- creator_name (text) — display name of template creator
- RLS changed: SELECT is now public to all authenticated users
  INSERT/UPDATE/DELETE remain owner-only

## New Tables
### template_ratings
- id (uuid PK)
- template_id (uuid FK to templates)
- user_id (uuid) — the rater
- rating (integer 1-5)
- created_at (timestamptz)
- UNIQUE(template_id, user_id) — one rating per user per template
*/

ALTER TABLE kateb_users ADD COLUMN IF NOT EXISTS coins integer DEFAULT 10;

ALTER TABLE templates ADD COLUMN IF NOT EXISTS creator_name text DEFAULT '';

-- Make templates publicly readable (all authenticated users can see all templates)
DROP POLICY IF EXISTS "select_own_templates" ON templates;
CREATE POLICY "select_all_templates" ON templates FOR SELECT
  TO authenticated USING (true);

-- template_ratings table
CREATE TABLE IF NOT EXISTS template_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz DEFAULT now(),
  UNIQUE(template_id, user_id)
);

ALTER TABLE template_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_all_ratings" ON template_ratings;
CREATE POLICY "select_all_ratings" ON template_ratings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_rating" ON template_ratings;
CREATE POLICY "insert_own_rating" ON template_ratings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_rating" ON template_ratings;
CREATE POLICY "update_own_rating" ON template_ratings FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_template_ratings_template ON template_ratings(template_id);
CREATE INDEX IF NOT EXISTS idx_template_ratings_user ON template_ratings(user_id);

-- Backfill creator_name for existing templates from kateb_users
UPDATE templates t
SET creator_name = COALESCE(
  (SELECT ku.full_name FROM kateb_users ku WHERE ku.id = t.user_id),
  ''
)
WHERE t.creator_name = '';