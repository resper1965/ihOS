-- ============================================================================
-- Migration 20260707000005: commercial-context (sales channel) enforcement
-- (NPR v3 "Operating Model — The Two Moments", Moment 1 variable 2).
--
-- Product decision (2026-07-07): the sales channel is one of the three
-- MANDATORY context variables of every documental analysis — including
-- threat modeling, which was previously channel-agnostic. Ionic's privacy
-- ROLE differs by channel (through GEHC ≈ processor / operador; direct ≈
-- controller / controlador — ISO 27701 Annex A vs B), so the channel selects
-- both the contractual documents AND the applicable privacy-control subset.
--
--   1. threat_models.sales_channel — channel context of the analysis
--      (NULL = legacy/aggregate internal analysis).
--   2. channel_control_applicability — which SCF controls are (not)
--      applicable under each channel's privacy role. Fail-closed: the table
--      ships EMPTY; until the GRC team populates it (manually or via the
--      Standard API), assessments keep evaluating the full control set —
--      ihOS never invents applicability.
--
-- Idempotent: re-running is a no-op.
-- ============================================================================

BEGIN;

ALTER TABLE public.threat_models
    ADD COLUMN IF NOT EXISTS sales_channel TEXT NULL
        CHECK (sales_channel IN ('B2B_GEHC', 'B2B_DIRECT'));

COMMENT ON COLUMN public.threat_models.sales_channel IS
  'Commercial context of this analysis (NPR v3 Moment 1). NULL = legacy or internal aggregate run. Baselines/caches only match within the same channel.';

CREATE INDEX IF NOT EXISTS idx_threat_models_channel
    ON public.threat_models (product_version, sales_channel);

CREATE TABLE IF NOT EXISTS public.channel_control_applicability (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_channel     TEXT        NOT NULL CHECK (sales_channel IN ('B2B_GEHC', 'B2B_DIRECT')),
    scf_control_code  VARCHAR     NOT NULL REFERENCES public.scf_controls(control_code),
    applicable        BOOLEAN     NOT NULL,
    rationale         TEXT        NULL,   -- e.g. "27701 Annex A only — controller obligation; Ionic is processor via GEHC"
    source            TEXT        NOT NULL DEFAULT 'manual',  -- manual | grc_api
    created_by        UUID        NULL REFERENCES auth.users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sales_channel, scf_control_code)
);

COMMENT ON TABLE public.channel_control_applicability IS
  'Privacy-role control applicability per sales channel (NPR v3). applicable=false controls are reported NOT_APPLICABLE for that channel (excluded from scoring), never as gaps. Ships empty — populated by the GRC team; ihOS never guesses applicability.';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_channel_applicability_updated_at') THEN
    CREATE TRIGGER trg_channel_applicability_updated_at
        BEFORE UPDATE ON public.channel_control_applicability
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.channel_control_applicability ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channel_control_applicability' AND policyname = 'channel_applicability_read_authenticated') THEN
    CREATE POLICY channel_applicability_read_authenticated ON public.channel_control_applicability
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'channel_control_applicability' AND policyname = 'channel_applicability_internal_write') THEN
    CREATE POLICY channel_applicability_internal_write ON public.channel_control_applicability
      FOR ALL USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user'))
      );
  END IF;
END $$;

COMMIT;
