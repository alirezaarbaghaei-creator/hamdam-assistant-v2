/*
# Add admin approval and sample content to templates

1. New Columns
- `templates.is_approved` (boolean, default false) — controls whether a template
  is visible to regular users. Admins must approve a template before it appears
  in the public template gallery.
- `templates.sample_content` (text, default '') — stores a preview of the
  generated letter content so users can preview the template before using it.
- `templates.source_template_id` (uuid, nullable) — when a user uses an existing
  approved template and generates a new letter, the new auto-saved template
  records which template it was derived from, so the rating can be updated
  on the original template.

2. Data Backfill
- All existing templates are marked as `is_approved = true` so current
  templates remain visible.

3. Security
- No RLS policy changes needed — the existing SELECT policy (`USING (true)`)
  remains, but the edge function will filter by `is_approved` for non-admin
  users. Admins see all templates.
*/

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS sample_content text NOT NULL DEFAULT '';

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS source_template_id uuid;

-- Backfill: approve all existing templates so they remain visible
UPDATE templates SET is_approved = true WHERE is_approved = false;
