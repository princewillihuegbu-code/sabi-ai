-- ============================================
-- SABI MVP - Supabase Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT UNIQUE NOT NULL,
  preferred_language TEXT DEFAULT 'pidgin' CHECK (
    preferred_language IN ('pidgin', 'yoruba', 'igbo', 'hausa', 'english')
  ),
  state TEXT,
  city TEXT,
  opted_daily_updates BOOLEAN DEFAULT FALSE,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  last_query TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_state ON users(state);
CREATE INDEX idx_users_opted_updates ON users(opted_daily_updates);

-- ============================================
-- CACHE DATA TABLE
-- ============================================
CREATE TABLE cache_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('market_price', 'weather', 'news')),
  location TEXT NOT NULL,
  json_data JSONB NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(type, location)
);

CREATE INDEX idx_cache_type_location ON cache_data(type, location);
CREATE INDEX idx_cache_expires ON cache_data(expires_at);

-- ============================================
-- ANALYTICS TABLE
-- ============================================
CREATE TABLE analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (
    intent IN ('market_price', 'weather', 'government_service', 'news', 'general', 'onboarding')
  ),
  language TEXT NOT NULL,
  input_type TEXT DEFAULT 'text' CHECK (input_type IN ('text', 'voice')),
  query_text TEXT,
  response_time_ms INTEGER,
  cache_hit BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_phone ON analytics(phone);
CREATE INDEX idx_analytics_intent ON analytics(intent);
CREATE INDEX idx_analytics_language ON analytics(language);
CREATE INDEX idx_analytics_timestamp ON analytics(timestamp);

-- ============================================
-- BROADCAST LOG TABLE
-- ============================================
CREATE TABLE broadcast_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_date DATE NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'stopped')),
  sent_at TIMESTAMPTZ,
  UNIQUE(broadcast_date, phone)
);

-- ============================================
-- GOVERNMENT GUIDES TABLE (static content)
-- ============================================
CREATE TABLE government_guides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guide_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content_english TEXT NOT NULL,
  content_pidgin TEXT,
  content_yoruba TEXT,
  content_igbo TEXT,
  content_hausa TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Insert static guides
INSERT INTO government_guides (guide_key, title, content_english, content_pidgin) VALUES
(
  'nin_renewal',
  'NIN Renewal Guide',
  'To renew your NIN: 1. Visit any NIMC enrollment center. 2. Bring valid ID and passport photo. 3. Fill the correction/modification form. 4. Pay N500 fee. 5. Your NIN card ready in 2-4 weeks.',
  'To renew your NIN: 1. Go NIMC office wey dey near you. 2. Carry valid ID and passport photo. 3. Fill the form dem go give you. 4. Pay N500. 5. Card go ready within 2-4 weeks. No stress!'
),
(
  'sim_linking',
  'SIM-NIN Linking Guide',
  'To link SIM to NIN: 1. Dial *996# on your phone. 2. Or visit any telecom service center. 3. Bring your NIN slip or card. 4. Verification takes 24-48 hours.',
  'To link your SIM to NIN: 1. Dial *996# for your phone. 2. Or go any network office. 3. Carry your NIN slip or card. 4. Dem go verify am within 24-48 hours. Simple!'
),
(
  'passport',
  'Passport Application Guide',
  'New passport: 1. Apply online at immigration.gov.ng. 2. Pay processing fee (N15,000-N25,000 depending on type). 3. Book appointment at nearest immigration office. 4. Bring required documents. 5. Ready in 6-8 weeks.',
  'To get passport: 1. Apply online for immigration.gov.ng. 2. Pay processing fee (N15,000-N25,000). 3. Book appointment. 4. Carry your documents go. 5. Ready within 6-8 weeks.'
),
(
  'voters_card',
  'PVC Collection Guide',
  'Collect your Permanent Voter Card: Visit your ward INEC office with valid ID. Check ivrs.inec.gov.ng for collection status.',
  'Collect your voters card: Go your ward INEC office with valid ID. Check ivrs.inec.gov.ng to see if card ready.'
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_data ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend uses service key)
CREATE POLICY "Service role full access users" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access analytics" ON analytics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access cache" ON cache_data FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access guides" ON government_guides FOR SELECT USING (true);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- ADMIN VIEW: Dashboard Stats
-- ============================================
CREATE OR REPLACE VIEW admin_dashboard AS
SELECT
  (SELECT COUNT(*) FROM users) AS total_users,
  (SELECT COUNT(*) FROM users WHERE opted_daily_updates = TRUE) AS opted_in_users,
  (SELECT COUNT(*) FROM analytics WHERE timestamp > NOW() - INTERVAL '24 hours') AS queries_24h,
  (SELECT COUNT(*) FROM analytics WHERE timestamp > NOW() - INTERVAL '7 days') AS queries_7d,
  (SELECT language, COUNT(*) as count FROM analytics GROUP BY language ORDER BY count DESC LIMIT 1) AS top_language,
  (SELECT intent, COUNT(*) as count FROM analytics GROUP BY intent ORDER BY count DESC LIMIT 1) AS top_intent;

-- Language distribution view
CREATE OR REPLACE VIEW language_distribution AS
SELECT
  language,
  COUNT(*) as total_queries,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM analytics
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY language
ORDER BY total_queries DESC;

-- Intent distribution view
CREATE OR REPLACE VIEW intent_distribution AS
SELECT
  intent,
  COUNT(*) as total_queries,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM analytics
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY intent
ORDER BY total_queries DESC;
