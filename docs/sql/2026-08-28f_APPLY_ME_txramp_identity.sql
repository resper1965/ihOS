-- TX-LEVEL-2 identity, decided 2026-08-28 by resper@ionic.health.
--
-- Two candidates matched /tx-?ramp|texas/ across the 272 vendor frameworks:
-- "US - TX TX-RAMP Level 1" (232 mappings) and "US - TX TX-RAMP Level 2"
-- (366 mappings). Our slug names Level 2 explicitly, so there is nothing to
-- weigh — the level is in the code itself.

INSERT INTO public.framework_identity_curation
  (local_code, vendor_framework_code, confidence, decided_by, decided_against_version, rationale)
VALUES
  (
    'TX-LEVEL-2', 'US - TX TX-RAMP Level 2', 'exact',
    'resper@ionic.health', '8260df81-979f-4eab-a525-26550ad95d79',
    'Two candidates matched /tx-?ramp|texas/: US - TX TX-RAMP Level 1 (232 mappings) and '
    'US - TX TX-RAMP Level 2 (366 mappings). Our slug names Level 2, so the level is not a '
    'judgement - it is stated in the local code. 366 mappings.'
  )
ON CONFLICT (local_code) DO NOTHING;

SELECT local_code, vendor_framework_code, confidence
FROM public.framework_identity_curation
ORDER BY confidence, local_code;
