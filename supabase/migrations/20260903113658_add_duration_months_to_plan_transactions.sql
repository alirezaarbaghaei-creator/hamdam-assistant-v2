/*
# Add duration_months to plan_transactions

1. Changes
- Adds `duration_months` column (integer, default 1) to `plan_transactions`.
  This records how many months the purchased subscription covers (1, 3, or 6).
- The edge function will use this to calculate the correct expiry date after payment.
2. Security
- No policy changes. Existing RLS on plan_transactions is unchanged.
3. Notes
- 1 month = standard price, 3 months = 10% discount, 6 months = 20% discount.
- The `amount_toman` column already stores the actual paid amount (after discount).
- `duration_months` is informational; expiry is calculated as
  `now + duration_months * 30 days` at activation time.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plan_transactions' AND column_name = 'duration_months'
  ) THEN
    ALTER TABLE plan_transactions ADD COLUMN duration_months integer NOT NULL DEFAULT 1;
  END IF;
END $$;
