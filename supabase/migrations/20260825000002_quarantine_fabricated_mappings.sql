-- ============================================================================
-- Migration 20260825000002: quarantine fabricated framework crosswalks
--
-- On 2026-08-25 an audit proved that 5 of the 7 framework mappings in
-- scf_framework_mappings were manufactured locally by string-prefixing the two
-- real ones, not sourced from any crosswalk:
--
--   soc2, nist_800_53, HI-2013  <- iso27001's mapping with a prefix glued on
--   EU-GDPR, BR-LGPD            <- iso27701's mapping, same method
--
-- Evidence: after stripping the prefix, ZERO target_control_ids differ from the
-- source framework's, and each group shares a byte-identical SCF control set
-- (582 for the security group, 390 for privacy). The fabricated ids name
-- controls that do not exist in the target standards — SOC 2 has no control
-- "5.0.1" (its criteria are CC1.1-CC9.2), NIST 800-53 uses AC-1/AU-2/SC-7,
-- HIPAA uses 45 CFR §164.308, GDPR uses Articles. A report citing
-- "gap at SOC2-5.0.1" cites something that does not exist.
--
-- MOVE, do not delete: the rows are evidence of how this happened, and a move
-- is reversible. Rollback is at the bottom of this file.
--
-- Idempotent: re-running is a no-op.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.scf_framework_mappings_quarantine (
    id                 BIGINT      NOT NULL,
    framework_code     VARCHAR     NOT NULL,
    target_control_id  VARCHAR     NOT NULL,
    scf_control_code   VARCHAR     NOT NULL,
    synced_at          TIMESTAMPTZ NULL,
    quarantined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    quarantine_reason  TEXT        NOT NULL
);

COMMENT ON TABLE public.scf_framework_mappings_quarantine IS
  'Framework mappings withdrawn from service because they were fabricated rather than sourced from a real crosswalk. Kept as evidence and to make the removal reversible. See migration 20260825000002.';

CREATE INDEX IF NOT EXISTS idx_mappings_quarantine_framework
    ON public.scf_framework_mappings_quarantine (framework_code);

-- Move the fabricated rows. INSERT then DELETE in one transaction; the
-- NOT EXISTS guard makes a second run insert nothing.
INSERT INTO public.scf_framework_mappings_quarantine
    (id, framework_code, target_control_id, scf_control_code, synced_at, quarantine_reason)
SELECT m.id, m.framework_code, m.target_control_id, m.scf_control_code, m.synced_at,
       CASE
         WHEN m.framework_code IN ('soc2', 'nist_800_53', 'HI-2013')
           THEN 'Fabricated: iso27001 mapping with a framework-specific prefix glued onto target_control_id. Zero ids differ after stripping the prefix.'
         ELSE 'Fabricated: iso27701 mapping with a framework-specific prefix glued onto target_control_id. Zero ids differ after stripping the prefix.'
       END
FROM public.scf_framework_mappings m
WHERE m.framework_code IN ('soc2', 'nist_800_53', 'HI-2013', 'EU-GDPR', 'BR-LGPD')
  AND NOT EXISTS (
    SELECT 1 FROM public.scf_framework_mappings_quarantine q WHERE q.id = m.id
  );

DELETE FROM public.scf_framework_mappings
WHERE framework_code IN ('soc2', 'nist_800_53', 'HI-2013', 'EU-GDPR', 'BR-LGPD');

ALTER TABLE public.scf_framework_mappings_quarantine ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'scf_framework_mappings_quarantine' AND policyname = 'mappings_quarantine_internal_read'
  ) THEN
    CREATE POLICY mappings_quarantine_internal_read
      ON public.scf_framework_mappings_quarantine
      FOR SELECT USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user'))
      );
  END IF;
END $$;

COMMIT;

-- ── Rollback (run manually only if the quarantine must be undone) ────────────
-- BEGIN;
-- INSERT INTO public.scf_framework_mappings (id, framework_code, target_control_id, scf_control_code, synced_at)
-- SELECT id, framework_code, target_control_id, scf_control_code, synced_at
--   FROM public.scf_framework_mappings_quarantine
--  WHERE NOT EXISTS (
--    SELECT 1 FROM public.scf_framework_mappings m WHERE m.id = scf_framework_mappings_quarantine.id
--  );
-- DELETE FROM public.scf_framework_mappings_quarantine;
-- COMMIT;
