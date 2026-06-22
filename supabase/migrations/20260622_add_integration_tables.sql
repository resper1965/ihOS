-- Migration: 20260622_add_integration_tables
-- Adds tables for external integration connections, notification channels,
-- DefectDojo findings cache, and sync logging.

-- Integration connections
CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  provider TEXT NOT NULL,
  composio_connection_id TEXT,
  config JSONB DEFAULT '{}',
  sync_frequency TEXT DEFAULT 'daily',
  last_synced_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notification delivery channels
CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('teams', 'email', 'in_app')),
  config JSONB NOT NULL DEFAULT '{}',
  severity_filter TEXT[] DEFAULT '{critical,high}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- DefectDojo findings cache
CREATE TABLE IF NOT EXISTS defectdojo_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dd_finding_id INT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL,
  cwe INT,
  cvssv3 TEXT,
  active BOOLEAN DEFAULT true,
  verified BOOLEAN DEFAULT false,
  risk_accepted BOOLEAN DEFAULT false,
  is_mitigated BOOLEAN DEFAULT false,
  mitigation TEXT,
  sla_days_remaining INT,
  mapped_iso_controls TEXT[],
  mapped_soc_criteria TEXT[],
  mapped_nist_controls TEXT[],
  dd_created_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dd_findings_active ON defectdojo_findings(active, severity);
CREATE INDEX IF NOT EXISTS idx_dd_findings_controls ON defectdojo_findings USING GIN(mapped_iso_controls);

-- Integration sync log
CREATE TABLE IF NOT EXISTS integration_sync_log (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  items_processed INT DEFAULT 0,
  items_created INT DEFAULT 0,
  items_updated INT DEFAULT 0,
  errors JSONB DEFAULT '[]',
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
