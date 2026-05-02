-- ═══════════════════════════════════════════════════════════
-- RestaurantQR — Migración: campaigns + campaign_messages
-- Fecha: 2026-04-08
-- ═══════════════════════════════════════════════════════════

-- ─── TABLA: campaigns ───
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('manual', 'birthday', 'reactivation')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'failed')),
  message_template text NOT NULL,
  filters jsonb,
  total_sent integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── TABLA: campaign_messages ───
CREATE TABLE IF NOT EXISTS campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  twilio_sid text,
  sent_at timestamptz,
  error_message text
);

-- ─── ÍNDICES ───
CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign ON campaign_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_customer ON campaign_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_type_date ON campaigns(type, created_at);

-- ─── RLS ───
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_campaigns" ON campaigns
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "service_select_campaigns" ON campaigns
  FOR SELECT USING (true);

CREATE POLICY "service_insert_campaigns" ON campaigns
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_update_campaigns" ON campaigns
  FOR UPDATE USING (true);

CREATE POLICY "service_insert_campaign_messages" ON campaign_messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_update_campaign_messages" ON campaign_messages
  FOR UPDATE USING (true);

CREATE POLICY "service_select_campaign_messages" ON campaign_messages
  FOR SELECT USING (true);
