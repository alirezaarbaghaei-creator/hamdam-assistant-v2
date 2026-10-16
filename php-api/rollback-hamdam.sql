-- ============================================================
--  Hamdam — ROLLBACK script
--  Removes ONLY the three tables added by migration-hamdam.sql.
--  Legacy Kateb tables (kateb_users, kateb_sessions, kateb_settings,
--  kateb_otp_codes, profiles, generated_letters, templates,
--  template_ratings, drafts, discovery_usage, coin_orders, plan_orders)
--  are NOT touched. User data saved into the new tables is lost —
--  export it first if needed:
--    SELECT * FROM calendar_events;
--    SELECT * FROM manager_tasks;
--    SELECT * FROM occasions;
-- ============================================================

DROP TABLE IF EXISTS manager_tasks;
DROP TABLE IF EXISTS calendar_events;
DROP TABLE IF EXISTS occasions;
