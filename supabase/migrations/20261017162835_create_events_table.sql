/*
# Create events table (single-tenant, no sign-in)

1. New Tables
- `events` — calendar events ("رویدادها"). Every event has the three required parameters:
  day, start time, and duration (stored as start_time + end_time so both "از ۹ تا ۱۱"
  and an explicit duration can be represented).
- `id` (uuid, primary key, auto-generated)
- `title` (text, not null) — event title, e.g. "جلسه با علی"
- `event_date` (date, not null) — the day of the event (stored as ISO date)
- `start_time` (time, not null) — start hour, e.g. 09:00
- `end_time` (time, not null) — end hour, e.g. 11:00; duration = end - start
- `notes` (text, nullable) — optional extra description
- `created_at` (timestamptz, default now())

2. Indexes
- Index on `event_date` for fast calendar queries by day/range.

3. Security
- Enable RLS on `events`.
- No sign-in screen in this app, so policies allow `anon` + `authenticated`
  full CRUD (USING/WITH CHECK true) — data is intentionally shared in this
  single-tenant personal planner.
*/

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  event_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_event_date_idx ON events (event_date);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_events" ON events;
CREATE POLICY "anon_select_events" ON events FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_events" ON events;
CREATE POLICY "anon_insert_events" ON events FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_events" ON events;
CREATE POLICY "anon_update_events" ON events FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_events" ON events;
CREATE POLICY "anon_delete_events" ON events FOR DELETE
TO anon, authenticated USING (true);
