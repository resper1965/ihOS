-- iso27701 identity, decided 2026-08-28 by resper@ionic.health.
--
-- Recorded as 'probable', not 'exact', and the difference is the point.
--
-- Matching /27701|27702/ across the 272 vendor frameworks returns exactly one
-- row: "ISO 27701  2025", holding 149 mappings. Our slug means the 2019 edition
-- — the original privacy extension to ISO 27001/27002 — and the vendor carries
-- no 2019 row. So the candidate is unique but the edition is not the one our
-- slug names, and those are two different kinds of certainty.
--
-- 'exact' would assert that the vendor row IS what our slug means. It probably
-- is: a 2025 revision of ISO 27701 is still ISO 27701, and a privacy extension
-- does not usually change identity across a revision. But "probably" is the
-- honest word, so it is the recorded confidence, and Q14(b) of
-- docs/standard-api/VENDOR_QUESTIONS_2026-08-28.md asks the vendor to confirm.
-- On a confirmation this becomes 'exact' with one UPDATE.
--
-- Why not quarantine it instead: iso27701 holds 4,633 real mappings in
-- scf_framework_mappings, out of 10,074 rows there. It was one of the two
-- crosswalks that 20260825000002 did NOT quarantine, precisely because its data
-- was genuine. The open question is which vendor framework it joins to, not
-- whether its data was manufactured. Withdrawing a standard with real
-- mappings over an edition digit would cost more than the doubt is worth.

INSERT INTO public.framework_identity_curation
  (local_code, vendor_framework_code, confidence, decided_by, decided_against_version, rationale)
VALUES
  (
    'iso27701', 'ISO 27701  2025', 'probable',
    'resper@ionic.health', '8260df81-979f-4eab-a525-26550ad95d79',
    'Sole candidate across the 272: matching /27701|27702/ over framework_code and '
    'framework_name returned "ISO 27701  2025" and nothing else. 149 mappings. Recorded as '
    'probable rather than exact because our slug means the 2019 edition and the vendor carries '
    'no 2019 row; a 2025 revision of the same standard is the likely reading but has not been '
    'confirmed. Asked as Q14(b) on 2026-08-28. Note the double space inside the vendor code, '
    'which is theirs and is reproduced verbatim - framework_code is part of our mappings '
    'primary key since 20260828000003, so it is stored as given, not normalised. Whether they '
    'treat it as a stable business key is Q13.'
  )
ON CONFLICT (local_code) DO NOTHING;

SELECT local_code, vendor_framework_code, confidence, decided_at::date
FROM public.framework_identity_curation
ORDER BY confidence, local_code;
