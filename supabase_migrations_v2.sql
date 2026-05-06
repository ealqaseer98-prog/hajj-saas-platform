-- ============================================================
--  حملة العمار للحج والعمرة - مهاجرات الإصدار الثاني
--  Hajj Agent System - V2 Migrations
--  Run this AFTER running supabase_schema.sql
-- ============================================================

-- -------------------------------------------------------
-- 1. Add gender column to travellers
-- -------------------------------------------------------
ALTER TABLE travellers
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female'));


-- -------------------------------------------------------
-- 2. VISA HISTORY (سجل التأشيرة)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS visa_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  traveller_id  UUID REFERENCES travellers(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  notes         TEXT,
  changed_by    TEXT,           -- username of who changed it
  changed_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-log visa status changes on travellers table
CREATE OR REPLACE FUNCTION log_visa_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.visa_status IS DISTINCT FROM NEW.visa_status THEN
    INSERT INTO visa_history (traveller_id, status, changed_at)
    VALUES (NEW.id, NEW.visa_status, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS travellers_visa_log ON travellers;
CREATE TRIGGER travellers_visa_log
  AFTER UPDATE ON travellers
  FOR EACH ROW EXECUTE FUNCTION log_visa_change();


-- -------------------------------------------------------
-- 3. TRAVELLER DOCUMENTS (مستندات المسافر)
--    Files stored in Supabase Storage bucket: traveller-docs
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS traveller_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  traveller_id  UUID REFERENCES travellers(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL DEFAULT 'passport',
                -- 'passport' | 'visa' | 'id_card' | 'other'
  file_name     TEXT NOT NULL,
  file_url      TEXT NOT NULL,    -- public URL from Supabase Storage
  storage_path  TEXT NOT NULL,    -- internal path for deletion
  notes         TEXT,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);


-- -------------------------------------------------------
-- 4. WHATSAPP LOG (سجل واتساب)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  traveller_id  UUID REFERENCES travellers(id) ON DELETE SET NULL,
  phone         TEXT NOT NULL,
  message       TEXT NOT NULL,
  status        TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);


-- -------------------------------------------------------
-- 5. PAYMENT REMINDERS (تذكيرات الدفع)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_reminders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id    UUID REFERENCES invoices(id) ON DELETE CASCADE,
  traveller_id  UUID REFERENCES travellers(id) ON DELETE CASCADE,
  reminder_date DATE NOT NULL,
  method        TEXT DEFAULT 'whatsapp', -- 'whatsapp' | 'email' | 'manual'
  status        TEXT DEFAULT 'pending',  -- 'pending' | 'sent' | 'dismissed'
  notes         TEXT,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- -------------------------------------------------------
-- 6. Supabase Storage: create the bucket (run in dashboard or via API)
--    This SQL is for reference; bucket creation is done in the Storage UI
-- -------------------------------------------------------
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('traveller-docs', 'traveller-docs', false)
-- ON CONFLICT DO NOTHING;

-- Storage policy: allow authenticated users to upload/read
-- CREATE POLICY "Authenticated users can upload docs"
--   ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'traveller-docs');
-- CREATE POLICY "Authenticated users can read docs"
--   ON storage.objects FOR SELECT TO authenticated
--   USING (bucket_id = 'traveller-docs');


-- -------------------------------------------------------
-- Update traveller_summary view to include gender
-- -------------------------------------------------------
CREATE OR REPLACE VIEW traveller_summary AS
SELECT
  t.id,
  t.cpr_number,
  t.full_name_ar,
  t.full_name_en,
  t.gender,
  t.phone,
  t.email,
  t.passport_number,
  t.visa_status,
  COALESCE(SUM(i.amount), 0)       AS total_invoiced,
  COALESCE(SUM(i.amount_paid), 0)  AS total_paid,
  COALESCE(SUM(i.amount) - SUM(i.amount_paid), 0) AS balance_due,
  COUNT(DISTINCT tt.trip_id)       AS trip_count
FROM travellers t
LEFT JOIN invoices i         ON i.traveller_id = t.id
LEFT JOIN traveller_trips tt ON tt.traveller_id = t.id
GROUP BY t.id;
