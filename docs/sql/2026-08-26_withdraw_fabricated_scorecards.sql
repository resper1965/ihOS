-- ============================================================================
-- Withdraw compliance claims derived from fabricated data
-- Companion to migration 20260825000002 (quarantine_fabricated_mappings).
-- Run this in the Supabase SQL Editor IN THE SAME SITTING as that migration.
--
-- WHY BOTH TOGETHER: 20260825000002 removes the fabricated *mapping rows*.
-- It does not touch intelligence_snapshots, so the *scores already computed
-- from them* keep being served. Applying the migration alone changes nothing
-- a user can see — the dashboard would still show SOC 2 at 100%.
--
-- Surveyed against the live database on 2026-08-26 before writing:
--   intelligence_snapshots holds 38 rows, all snapshot_type='scorecard'
--     - 30 rows whose framework_code is a JSON blob, e.g.
--       {"id":"soc2","name":"SOC 2 Type II"}, all score 0.00, created
--       2026-08-22..26 by the nightly cron. Cause: cron/run-assessment passed
--       DEFAULT_FRAMEWORKS objects where string ids were required, so control
--       filtering matched nothing and the object was written as the code.
--       Fixed at source in commit 1851a05; these rows are its residue.
--     - 7 rows from 2026-07-16, all score 100.00, one per framework
--     - 1 'all' aggregate (score 23.00) whose snapshot_data.frameworks embeds
--       all 7 codes, including the 5 fabricated ones
--   agent_org_state holds NO framework_score_* keys — nothing to clean there.
--
-- Every statement is idempotent: re-running deletes nothing further.
-- ============================================================================

BEGIN;

-- ── Before ──────────────────────────────────────────────────────────────────
-- Read this output, then compare against the "After" block at the bottom.
select 'BEFORE' as stage, framework_code, score, created_at::date
from intelligence_snapshots
where snapshot_type = 'scorecard'
order by framework_code, created_at desc;

-- ── 1. Rows whose framework_code is a corrupted JSON blob ───────────────────
-- Not a framework code, so nothing can legitimately read these. They are all
-- score 0.00 from an assessment that evaluated zero controls.
delete from intelligence_snapshots
where snapshot_type = 'scorecard'
  and framework_code like '{%';

-- ── 2. Scores derived from the fabricated crosswalks ────────────────────────
-- These five frameworks' mappings were manufactured by string-prefixing the
-- two real ones (see 20260825000002). Any score computed against them is a
-- claim about a standard this deployment has no real mapping data for.
delete from intelligence_snapshots
where snapshot_type = 'scorecard'
  and framework_code in ('soc2', 'nist_800_53', 'HI-2013', 'EU-GDPR', 'BR-LGPD');

-- ── 3. The 'all' aggregate ──────────────────────────────────────────────────
-- Its snapshot_data.frameworks array embeds all seven codes including the five
-- above, so the aggregate itself is partly derived from fabricated data.
-- syncScorecard rebuilds this row on the next real assessment run; until then
-- an absent aggregate is honest and a stale one is not.
delete from intelligence_snapshots
where snapshot_type = 'scorecard'
  and framework_code = 'all';

-- ── After ───────────────────────────────────────────────────────────────────
-- Expected: only iso27001 and iso27701 rows remain (see the OPTIONAL block
-- below before deciding whether that is the state you want).
select 'AFTER' as stage, framework_code, score, created_at::date
from intelligence_snapshots
where snapshot_type = 'scorecard'
order by framework_code, created_at desc;

COMMIT;


-- ============================================================================
-- OPTIONAL — a separate decision, deliberately NOT included above
-- ============================================================================
-- After the block above, the only surviving rows are iso27001 and iso27701
-- from 2026-07-16, both at 100.00. Those two frameworks' mappings ARE real, so
-- their scores are not fabricated-mapping-derived and are out of this script's
-- stated scope. But two things are worth weighing before leaving them:
--
--   1. They are the LATEST clean-coded rows for those frameworks, so they are
--      what getFrameworkScores() serves today (the newer Aug rows have the
--      corrupted codes deleted in step 1 and never matched). The dashboard is
--      therefore showing ISO 27001 = 100% from six weeks ago.
--   2. They predate the 2026-08-21 operational-evidence work, whose own spec
--      states the platform was over-reporting conformance and had "previously
--      called 100% conforming" a control set it measured at 12 conforming /
--      45 partial / 7 informal / 67 gap.
--
-- So a 100% from 2026-07-16 is a number the platform can no longer stand
-- behind. Deleting it leaves the dashboard empty for those frameworks until
-- the next real assessment run — which is honest. Keeping it shows a
-- confident, stale, probably-wrong number — which is the failure mode all of
-- this work exists to remove.
--
-- Uncomment and run ONLY if you want the dashboard to go blank for ISO 27001 /
-- ISO 27701 until a fresh assessment repopulates it:
--
-- BEGIN;
-- delete from intelligence_snapshots
-- where snapshot_type = 'scorecard'
--   and framework_code in ('iso27001', 'iso27701');
-- COMMIT;


-- ============================================================================
-- AFTERWARD: clear the Redis cache
-- ============================================================================
-- getFrameworkScores() caches under the key `ihos:framework_scores` with a
-- 300-second TTL, and only syncScorecard() invalidates it. Deleting rows here
-- does not clear it, so the dashboard can serve the old values for up to five
-- minutes. Either wait out the TTL or delete that key in Upstash.
