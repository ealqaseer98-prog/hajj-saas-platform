-- Add FX columns to account_transfers and update balance trigger.
-- Run on existing Supabase / Postgres after baseline schema.

ALTER TABLE account_transfers ADD COLUMN IF NOT EXISTS to_amount NUMERIC(12,3);
ALTER TABLE account_transfers ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) DEFAULT 1;

UPDATE account_transfers
SET to_amount = COALESCE(to_amount, amount),
    exchange_rate = COALESCE(exchange_rate, 1)
WHERE to_amount IS NULL OR exchange_rate IS NULL;

ALTER TABLE account_transfers ALTER COLUMN to_amount SET NOT NULL;
ALTER TABLE account_transfers ALTER COLUMN exchange_rate SET NOT NULL;
ALTER TABLE account_transfers ALTER COLUMN exchange_rate SET DEFAULT 1;

CREATE OR REPLACE FUNCTION update_account_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
  -- Balances for transfers are updated in the app (AccountsPage) using amount / to_amount.
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
