-- Receipt trigger: invoice amount_paid + status (incl. overpaid) on INSERT / UPDATE / DELETE.
-- invoices.status is TEXT. If you use CHECK(status), extend it to include 'overpaid' (see comments at bottom).

CREATE OR REPLACE FUNCTION update_account_on_receipt()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE accounts SET balance = balance + NEW.amount WHERE id = NEW.account_id;
    IF NEW.invoice_id IS NOT NULL THEN
      UPDATE invoices SET amount_paid = amount_paid + NEW.amount,
        status = CASE
          WHEN (amount_paid + NEW.amount) > amount THEN 'overpaid'
          WHEN (amount_paid + NEW.amount) >= amount THEN 'paid'
          WHEN (amount_paid + NEW.amount) > 0 THEN 'partial'
          ELSE 'unpaid' END
        WHERE id = NEW.invoice_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.account_id IS NOT DISTINCT FROM NEW.account_id THEN
      IF NEW.account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + (NEW.amount - OLD.amount) WHERE id = NEW.account_id;
      END IF;
    ELSE
      IF OLD.account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
      END IF;
      IF NEW.account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + NEW.amount WHERE id = NEW.account_id;
      END IF;
    END IF;
    IF OLD.invoice_id IS NOT DISTINCT FROM NEW.invoice_id AND OLD.invoice_id IS NOT NULL THEN
      UPDATE invoices SET
        amount_paid = GREATEST(0, amount_paid - OLD.amount + NEW.amount),
        status = CASE
          WHEN (amount_paid - OLD.amount + NEW.amount) > amount THEN 'overpaid'
          WHEN (amount_paid - OLD.amount + NEW.amount) >= amount THEN 'paid'
          WHEN (amount_paid - OLD.amount + NEW.amount) > 0 THEN 'partial'
          ELSE 'unpaid' END
        WHERE id = NEW.invoice_id;
    ELSE
      IF OLD.invoice_id IS NOT NULL THEN
        UPDATE invoices SET
          amount_paid = GREATEST(0, amount_paid - OLD.amount),
          status = CASE
            WHEN (amount_paid - OLD.amount) <= 0 THEN 'unpaid'
            WHEN (amount_paid - OLD.amount) < amount THEN 'partial'
            WHEN (amount_paid - OLD.amount) > amount THEN 'overpaid'
            WHEN (amount_paid - OLD.amount) >= amount THEN 'paid'
            ELSE 'unpaid' END
          WHERE id = OLD.invoice_id;
      END IF;
      IF NEW.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
        UPDATE invoices SET amount_paid = amount_paid + NEW.amount,
          status = CASE
            WHEN (amount_paid + NEW.amount) > amount THEN 'overpaid'
            WHEN (amount_paid + NEW.amount) >= amount THEN 'paid'
            WHEN (amount_paid + NEW.amount) > 0 THEN 'partial'
            ELSE 'unpaid' END
          WHERE id = NEW.invoice_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
    IF OLD.invoice_id IS NOT NULL THEN
      UPDATE invoices SET
        amount_paid = GREATEST(0, amount_paid - OLD.amount),
        status = CASE
          WHEN (amount_paid - OLD.amount) <= 0 THEN 'unpaid'
          WHEN (amount_paid - OLD.amount) < amount THEN 'partial'
          WHEN (amount_paid - OLD.amount) > amount THEN 'overpaid'
          WHEN (amount_paid - OLD.amount) >= amount THEN 'paid'
          ELSE 'unpaid' END
        WHERE id = OLD.invoice_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS receipt_balance_update ON receipts;
CREATE TRIGGER receipt_balance_update
  AFTER INSERT OR UPDATE OR DELETE ON receipts
  FOR EACH ROW EXECUTE FUNCTION update_account_on_receipt();

-- Optional CHECK on invoices.status (uncomment if you use constraints):
-- ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
-- ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
--   CHECK (status IN ('unpaid', 'partial', 'paid', 'overpaid', 'cancelled'));
