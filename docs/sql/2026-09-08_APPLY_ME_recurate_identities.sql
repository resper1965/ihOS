-- Re-curation of all eight framework identities, 2026-09-08.
--
-- Why this file exists: on 2026-09-08 the vendor's re-import changed
-- scf_frameworks.framework_code from a human phrase ("ISO 27001 2022") to a
-- slug ("general-iso-27001-2022"). The human phrase moved to framework_name.
-- Measured that day, all eight curated identities matched ZERO rows in the new
-- catalogue version. Nothing broke visibly: a projection simply summed over an
-- empty set.
--
-- Seven of the eight are NOT new judgements. They are the same decision signed
-- on 2026-08-28, re-expressed in the vocabulary the vendor now publishes. The
-- rationale of each says which earlier decision it carries forward.
--
-- nist_800_53 IS a new decision, because the catalogue offers six NIST rows and
-- our slug names none of them. See its rationale.

INSERT INTO public.framework_identity_curation
  (local_code, vendor_framework_code, confidence, decided_by, decided_against_version, rationale)
VALUES
  ('iso27001', 'general-iso-27001-2022', 'exact',
   'resper@ionic.health', '826a1f05-f065-4feb-9f44-ced8019a6701',
   'Sole candidate matching /27001/ in the 250-framework catalogue. Carries forward the 2026-08-28 decision, which named the same framework as the phrase "ISO 27001 2022".'),

  ('iso27701', 'general-iso-27701-2025', 'probable',
   'resper@ionic.health', '826a1f05-f065-4feb-9f44-ced8019a6701',
   'Sole candidate matching /27701/. Stays probable for the same reason as 2026-08-28: our slug means the 2019 edition and the vendor publishes only 2025. The candidate is unique; the edition is not the one the slug names, and those are different kinds of certainty.'),

  ('BR-LGPD', 'americas-bra-lgpd-2018', 'exact',
   'resper@ionic.health', '826a1f05-f065-4feb-9f44-ced8019a6701',
   'Sole candidate matching /lgpd/. Carries forward the 2026-08-28 decision recorded as "Americas Brazil LGPD".'),

  ('EU-GDPR', 'emea-eu-gdpr-2016', 'exact',
   'resper@ionic.health', '826a1f05-f065-4feb-9f44-ced8019a6701',
   'Sole candidate matching /gdpr/. The Brazilian LGPD row also matches a search on "general data protection" and is explicitly NOT this one. Carries forward the 2026-08-28 decision recorded as "EMEA EU GDPR".'),

  ('EU-DORA', 'emea-eu-dora-2023', 'exact',
   'resper@ionic.health', '826a1f05-f065-4feb-9f44-ced8019a6701',
   'Sole candidate matching /dora/. Carries forward the 2026-08-28 decision recorded as "EMEA EU DORA".'),

  ('soc2', 'general-aicpa-tsc-2017', 'exact',
   'resper@ionic.health', '826a1f05-f065-4feb-9f44-ced8019a6701',
   'Two AICPA rows exist: the Trust Services Criteria (2017) and the Privacy Management Framework (2020). SOC 2 reports against the TSC. Carries forward the 2026-08-28 decision recorded as "AICPA TSC 2017:2022 (used for SOC 2)".'),

  ('TX-LEVEL-2', 'usa-state-tx-txramp-2-0-level-2', 'exact',
   'resper@ionic.health', '826a1f05-f065-4feb-9f44-ced8019a6701',
   'Seven Texas rows match; two are TX-RAMP, at Level 1 and Level 2. Our slug names Level 2, so the level is stated rather than judged. Note the edition moved to TX-RAMP 2.0 since the 2026-08-28 decision, which named plain "US - TX TX-RAMP Level 2".'),

  ('nist_800_53', 'general-nist-800-53-r5-2-high', 'exact',
   'resper@ionic.health', '826a1f05-f065-4feb-9f44-ced8019a6701',
   'Six NIST rows exist in the catalogue: R4, R5 base, and the High, Low, Moderate and Privacy baselines of R5. Our slug names none of them, so this was a real decision rather than a re-expression: resper@ionic.health chose the High baseline on 2026-09-08. It governs which baseline every DefectDojo NIST finding is read against, and the NIST axis has resolved nothing since the 2026-08-25 quarantine.')

ON CONFLICT (local_code) DO UPDATE SET
  vendor_framework_code   = EXCLUDED.vendor_framework_code,
  confidence              = EXCLUDED.confidence,
  decided_by              = EXCLUDED.decided_by,
  decided_against_version = EXCLUDED.decided_against_version,
  rationale               = EXCLUDED.rationale;

-- Verification. Every row must report a non-zero mapping count once the
-- crosswalk walk for this version has finished. A zero means the slug is wrong
-- or the walk has not reached that framework yet — check which before assuming
-- the curation is at fault.
SELECT c.local_code,
       c.vendor_framework_code,
       c.confidence,
       (SELECT count(*)
          FROM public.scf_control_mappings m
         WHERE m.framework_code = c.vendor_framework_code
           AND m.scf_version_id = '826a1f05-f065-4feb-9f44-ced8019a6701') AS mapeamentos
  FROM public.framework_identity_curation c
 ORDER BY c.local_code;
