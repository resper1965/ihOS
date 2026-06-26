-- Migration: Threat Models table
-- Moved from Python backend runtime initialization to formal migrations.

CREATE TABLE IF NOT EXISTS public.threat_models (
    id TEXT PRIMARY KEY,
    product_version TEXT NOT NULL,
    target_frameworks TEXT[] DEFAULT '{"iso27001","lgpd"}',
    model_data JSONB NOT NULL,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now(),
    reviewed_at TIMESTAMPTZ
);
