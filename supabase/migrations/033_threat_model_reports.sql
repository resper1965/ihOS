-- Migration: Threat Model Reports table + RLS
-- Stores formal reports generated from threat models

-- 1. Create threat_model_reports table
CREATE TABLE IF NOT EXISTS public.threat_model_reports (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    threat_model_id TEXT        NOT NULL,  -- References threat_models.data->>'model_id'
    title           VARCHAR     NOT NULL DEFAULT 'Threat Model Report',
    product_version VARCHAR     NOT NULL,
    frameworks      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    report_data     JSONB       NOT NULL,  -- Full report payload
    status          VARCHAR     NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'ready', 'archived')),
    generated_by    UUID        NULL REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.threat_model_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_tm_reports"
  ON public.threat_model_reports FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated_insert_tm_reports"
  ON public.threat_model_reports FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_tm_reports"
  ON public.threat_model_reports FOR UPDATE
  TO authenticated USING (true);

-- 3. Ensure threat_models has RLS for ihOS authenticated users
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'threat_models' AND schemaname = 'public') THEN
    ALTER TABLE public.threat_models ENABLE ROW LEVEL SECURITY;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_select_threat_models') THEN
      CREATE POLICY "authenticated_select_threat_models"
        ON public.threat_models FOR SELECT
        TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_insert_threat_models') THEN
      CREATE POLICY "authenticated_insert_threat_models"
        ON public.threat_models FOR INSERT
        TO authenticated WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_tm_reports_threat_model_id
  ON public.threat_model_reports (threat_model_id);

CREATE INDEX IF NOT EXISTS idx_tm_reports_created_at
  ON public.threat_model_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tm_reports_status
  ON public.threat_model_reports (status);
