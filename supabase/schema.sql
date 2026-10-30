-- ============================================================================
-- SUPABASE POSTGRESQL SCHEMA FOR KOKPIT LEAD GENERATION & OUTREACH
-- Salin dan jalankan seluruh isi query ini di:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Tabel Utama: leads
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  primary_channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'belum_dihubungi',
  score INTEGER NOT NULL DEFAULT 0,
  score_reasons JSONB DEFAULT '[]'::jsonb,
  phone TEXT,
  whatsapp_url TEXT,
  instagram_url TEXT,
  address TEXT,
  area TEXT,
  maps_url TEXT,
  website_verification_status TEXT DEFAULT 'tidak punya website',
  website_audit_evidence JSONB,
  review_evidence JSONB,
  estimated_value BIGINT DEFAULT 0,
  last_contacted_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  snooze_until TIMESTAMPTZ,
  messages JSONB,
  notes TEXT,
  manual_web_checked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing untuk kecepatan pencarian, filter kategori, dan antrean harian
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads(next_follow_up_at);

-- 2. Tabel Riwayat Interaksi: events
CREATE TABLE IF NOT EXISTS events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_lead_id ON events(lead_id);

-- 3. Row Level Security (RLS)
-- Mengizinkan akses backend via anon key / service role key
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend access to leads" ON leads;
CREATE POLICY "Allow backend access to leads" ON leads FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend access to events" ON events;
CREATE POLICY "Allow backend access to events" ON events FOR ALL USING (true) WITH CHECK (true);
