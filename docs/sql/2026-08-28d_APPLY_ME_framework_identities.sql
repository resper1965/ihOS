-- Five framework identities, decided 2026-08-28 by resper@ionic.health.
--
-- Each row names exactly one of the 272 vendor frameworks. The candidates were
-- produced by matching our local code against framework_code and framework_name
-- across the whole catalogue, then counting the mappings each candidate holds in
-- scf_control_mappings. The count is evidence that a candidate is populated. It
-- is NOT what chose the row. A person chose the row.
--
-- Four of these five local codes were quarantined by 20260825000002, which moved
-- the fabricated rows to scf_framework_mappings_quarantine and deleted them from
-- scf_framework_mappings. Curating an identity here neither restores nor reads
-- those rows: the projection reads scf_control_mappings, walked from the vendor
-- crosswalk on 2026-08-27.
--
-- EU-DORA is a new local code. It has no prior meaning to overwrite.

INSERT INTO public.framework_identity_curation
  (local_code, vendor_framework_code, confidence, decided_by, decided_against_version, rationale)
VALUES
  (
    'BR-LGPD', 'Americas Brazil LGPD', 'exact',
    'resper@ionic.health', '8260df81-979f-4eab-a525-26550ad95d79',
    'Sole candidate across the 272: matching /lgpd|brazil|brasil/ over framework_code and '
    'framework_name returned "Americas Brazil LGPD" and nothing else. 80 mappings.'
  ),
  (
    'EU-GDPR', 'EMEA EU GDPR', 'exact',
    'resper@ionic.health', '8260df81-979f-4eab-a525-26550ad95d79',
    'Sole candidate: matching /gdpr/ returned "EMEA EU GDPR" only. 241 mappings. The vendor '
    'keeps national implementations as separate rows - EMEA Germany, EMEA Ireland and so on - '
    'and this row is the Regulation itself, which is what our slug means.'
  ),
  (
    'soc2', 'AICPA TSC 2017:2022 (used for SOC 2)', 'exact',
    'resper@ionic.health', '8260df81-979f-4eab-a525-26550ad95d79',
    'Sole candidate, and the vendor names the purpose inside the code itself. SOC 2 is a report '
    'produced against the AICPA Trust Services Criteria; there is no separate SOC 2 control set '
    'to point at, and the TSC row is those criteria. 1,478 mappings, the largest of any framework '
    'curated so far.'
  ),
  (
    'nist_800_53', 'NIST 800-53 R5', 'exact',
    'resper@ionic.health', '8260df81-979f-4eab-a525-26550ad95d79',
    'Six candidates. R5 is the current revision of the control catalogue and R4 its predecessor, '
    'so the catalogue row is R5 - 1,117 mappings against 807. The four 800-53B rows are impact '
    'baselines derived from the catalogue rather than the catalogue itself, and our slug means '
    'the catalogue. Their counts do not read as nested sets - high holds 91 and low holds 277 - '
    'which is asked as Q14(c) on 2026-08-28. That question does not affect this row: it decides '
    'whether the baselines later get their own local codes, not what nist_800_53 means.'
  ),
  (
    'EU-DORA', 'EMEA EU DORA', 'exact',
    'resper@ionic.health', '8260df81-979f-4eab-a525-26550ad95d79',
    'Sole candidate: matching /dora|operational resilience/ returned "EMEA EU DORA" only. '
    '442 mappings. New local code - no prior ihOS slug named DORA, so this row is the first '
    'thing that gives EU-DORA a meaning.'
  )
ON CONFLICT (local_code) DO NOTHING;

SELECT local_code, vendor_framework_code, confidence, decided_at::date
FROM public.framework_identity_curation
ORDER BY local_code;
