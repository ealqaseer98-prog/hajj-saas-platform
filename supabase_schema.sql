-- ============================================================
--  حملة العمار للحج والعمرة - مخطط قاعدة البيانات
--  Hajj Agent System - Database Schema (Supabase / PostgreSQL)
--  Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------
-- 1. USERS (login accounts - manually inserted)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username    TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,        -- store bcrypt hash
  full_name   TEXT,
  role        TEXT DEFAULT 'agent', -- 'admin' | 'agent' | 'coordinator'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Insert a default admin (change password hash before production!)
-- Password below is bcrypt of "admin123" - replace with your own hash
INSERT INTO users (username, password, full_name, role)
VALUES ('admin', '$2b$10$CHANGETHISHASHBEFOREPRODUCTION', 'المدير', 'admin')
ON CONFLICT (username) DO NOTHING;


-- -------------------------------------------------------
-- 2. TRAVELLERS (الحجاج)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS travellers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cpr_number      TEXT UNIQUE NOT NULL,   -- رقم البطاقة الشخصية (المفتاح الأساسي)
  full_name_ar    TEXT NOT NULL,          -- الاسم الكامل بالعربية
  full_name_en    TEXT NOT NULL,          -- Full Name in English
  phone           TEXT,
  email           TEXT,
  passport_number TEXT,
  passport_expiry DATE,
  nationality     TEXT DEFAULT 'بحريني',
  date_of_birth   DATE,
  visa_status     TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- -------------------------------------------------------
-- 3. TRIPS (الرحلات)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS trips (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_name     TEXT NOT NULL,           -- e.g. "رحلة حج 2025"
  year          INT,
  package_type  TEXT DEFAULT 'standard', -- 'economy' | 'standard' | 'vip'
  departure_date DATE,
  return_date    DATE,
  max_travellers INT DEFAULT 50,
  status         TEXT DEFAULT 'upcoming',-- 'upcoming' | 'active' | 'completed'
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);


-- -------------------------------------------------------
-- 4. TRIP LEGS (مراحل الرحلة - legs / segments)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_legs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id       UUID REFERENCES trips(id) ON DELETE CASCADE,
  leg_order     INT NOT NULL,
  transport_type TEXT NOT NULL, -- 'plane' | 'bus' | 'train' | 'private_car'
  from_location  TEXT NOT NULL,
  to_location    TEXT NOT NULL,
  departure_dt   TIMESTAMPTZ,
  arrival_dt     TIMESTAMPTZ,
  flight_number  TEXT,         -- رقم الرحلة (for plane legs)
  airline        TEXT,
  train_number   TEXT,         -- for Haramain train
  notes          TEXT
);


-- -------------------------------------------------------
-- 5. TRAVELLER ↔ TRIP (many-to-many join)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS traveller_trips (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  traveller_id  UUID REFERENCES travellers(id) ON DELETE CASCADE,
  trip_id       UUID REFERENCES trips(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  status        TEXT DEFAULT 'confirmed', -- 'confirmed' | 'cancelled' | 'waitlist'
  UNIQUE(traveller_id, trip_id)
);


-- -------------------------------------------------------
-- 6. ACCOUNTS (الحسابات - Cash, Bank 1, Bank 2, etc.)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,            -- e.g. "الصندوق", "البنك الأهلي"
  account_type  TEXT DEFAULT 'bank',      -- 'cash' | 'bank'
  balance       NUMERIC(12,3) DEFAULT 0,  -- BHD (3 decimal places)
  currency      TEXT DEFAULT 'BHD',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Default accounts
INSERT INTO accounts (name, account_type) VALUES
  ('الصندوق', 'cash'),
  ('البنك 1',  'bank'),
  ('البنك 2',  'bank')
ON CONFLICT DO NOTHING;


-- -------------------------------------------------------
-- 7. INVOICES (الفواتير)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  TEXT UNIQUE,           -- INV-2025-001
  traveller_id    UUID REFERENCES travellers(id),
  trip_id         UUID REFERENCES trips(id),
  account_id      UUID REFERENCES accounts(id),
  amount          NUMERIC(12,3) NOT NULL,
  amount_paid     NUMERIC(12,3) DEFAULT 0,
  currency        TEXT DEFAULT 'BHD',
  description     TEXT,
  issue_date      DATE DEFAULT CURRENT_DATE,
  due_date        DATE,
  status          TEXT DEFAULT 'unpaid',  -- 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'cancelled'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- -------------------------------------------------------
-- 8. RECEIPTS (إيصالات الدفع)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_number  TEXT UNIQUE,            -- RCP-2025-001
  invoice_id      UUID REFERENCES invoices(id),
  traveller_id    UUID REFERENCES travellers(id),
  account_id      UUID REFERENCES accounts(id),
  amount          NUMERIC(12,3) NOT NULL,
  payment_method  TEXT DEFAULT 'cash',    -- 'cash' | 'bank_transfer' | 'cheque'
  payment_date    DATE DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- -------------------------------------------------------
-- 9. EXPENSES (المصروفات)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_number  TEXT UNIQUE,            -- EXP-2025-001
  account_id      UUID REFERENCES accounts(id),
  traveller_id    UUID REFERENCES travellers(id), -- optional link
  trip_id         UUID REFERENCES trips(id),       -- optional link
  amount          NUMERIC(12,3) NOT NULL,
  currency        TEXT DEFAULT 'BHD',
  category        TEXT,  -- 'hotel' | 'transport' | 'food' | 'visa' | 'other'
  description     TEXT NOT NULL,
  expense_date    DATE DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- -------------------------------------------------------
-- 10. ACCOUNT TRANSFERS (التحويل بين الحسابات)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_transfers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_account_id UUID REFERENCES accounts(id),
  to_account_id   UUID REFERENCES accounts(id),
  amount          NUMERIC(12,3) NOT NULL,   -- deducted from source account (source currency)
  to_amount       NUMERIC(12,3) NOT NULL,  -- credited to destination account (destination currency)
  exchange_rate   NUMERIC(18,6) NOT NULL DEFAULT 1, -- to_amount = amount × exchange_rate (1 when same currency)
  transfer_date   DATE DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- -------------------------------------------------------
-- 11. HOTELS (الفنادق)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS hotels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID REFERENCES trips(id) ON DELETE CASCADE,
  hotel_name      TEXT NOT NULL,
  city            TEXT NOT NULL,    -- 'مكة المكرمة' | 'المدينة المنورة'
  check_in_date   DATE,
  check_out_date  DATE,
  address         TEXT,
  phone           TEXT,
  notes           TEXT
);


-- -------------------------------------------------------
-- 12. ROOMS (الغرف)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id        UUID REFERENCES hotels(id) ON DELETE CASCADE,
  room_number     TEXT NOT NULL,
  room_type       TEXT DEFAULT 'quad', -- 'single' | 'double' | 'triple' | 'quad' | 'quint' | 'sextuple'
  capacity        INT DEFAULT 4,
  floor           TEXT,
  notes           TEXT
);


-- -------------------------------------------------------
-- 13. ROOM ASSIGNMENTS (توزيع الغرف)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id         UUID REFERENCES rooms(id) ON DELETE CASCADE,
  traveller_id    UUID REFERENCES travellers(id) ON DELETE CASCADE,
  check_in_date   DATE,
  check_out_date  DATE,
  UNIQUE(room_id, traveller_id)
);


-- -------------------------------------------------------
-- TRIGGERS: auto-update 'updated_at' columns
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER travellers_updated_at BEFORE UPDATE ON travellers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- -------------------------------------------------------
-- TRIGGER: auto-update account balances on receipts
-- -------------------------------------------------------
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
    -- Account balance: same account → delta; else reverse old and apply new
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
    -- Invoice amount_paid + status (overpaid when paid > amount)
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
CREATE TRIGGER receipt_balance_update AFTER INSERT OR UPDATE OR DELETE ON receipts
  FOR EACH ROW EXECUTE FUNCTION update_account_on_receipt();


-- -------------------------------------------------------
-- TRIGGER: auto-update account balances on expenses
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_account_on_expense()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE accounts SET balance = balance - NEW.amount WHERE id = NEW.account_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE accounts SET balance = balance + OLD.amount WHERE id = OLD.account_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expense_balance_update AFTER INSERT OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_account_on_expense();


-- -------------------------------------------------------
-- TRIGGER: auto-update balances on transfers
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_account_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
  -- Balances for transfers are updated in the app (AccountsPage) using amount / to_amount
  -- so this trigger does not modify accounts (avoids double-counting with client updates).
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transfer_balance_update AFTER INSERT OR DELETE ON account_transfers
  FOR EACH ROW EXECUTE FUNCTION update_account_on_transfer();


-- -------------------------------------------------------
-- VIEWS: convenient read views
-- -------------------------------------------------------

-- Full traveller summary including financial and trip info
CREATE OR REPLACE VIEW traveller_summary AS
SELECT
  t.id,
  t.cpr_number,
  t.full_name_ar,
  t.full_name_en,
  t.phone,
  t.email,
  t.passport_number,
  t.visa_status,
  COALESCE(SUM(i.amount), 0)       AS total_invoiced,
  COALESCE(SUM(i.amount_paid), 0)  AS total_paid,
  COALESCE(SUM(i.amount) - SUM(i.amount_paid), 0) AS balance_due,
  COUNT(DISTINCT tt.trip_id)       AS trip_count
FROM travellers t
LEFT JOIN invoices i       ON i.traveller_id = t.id
LEFT JOIN traveller_trips tt ON tt.traveller_id = t.id
GROUP BY t.id;


-- Account balances overview
CREATE OR REPLACE VIEW account_overview AS
SELECT
  a.*,
  COALESCE(SUM(r.amount), 0)  AS total_income,
  COALESCE(SUM(e.amount), 0)  AS total_expenses
FROM accounts a
LEFT JOIN receipts r ON r.account_id = a.id
LEFT JOIN expenses e ON e.account_id = a.id
GROUP BY a.id;
