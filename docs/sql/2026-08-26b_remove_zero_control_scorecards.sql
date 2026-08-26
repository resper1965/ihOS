-- ============================================================================
-- Remove scorecard rows written from assessments that evaluated ZERO controls
--
-- Why: on 2026-08-26 an assessment was run to replace stale 100% scores with a
-- real measurement. The Standard API's control catalog had just been unblocked,
-- so the run completed — but finding A9 (see docs/standard-api/CONTRACT_AUDIT.md)
-- means the engine filters API controls by control_id (a UUID) against a set
-- built from scf_control_code (human codes like AST-22). The predicate is never
-- true, so allControls became empty and the run evaluated 0 controls.
--
-- syncScorecard then deleted the previous rows and inserted score 0.0 for
-- iso27001 and iso27701, plus an 'all' aggregate with a null score. A 0%
-- derived from measuring nothing is as much a fabricated claim as the 100% it
-- replaced — it just errs pessimistically.
--
-- This removes those three rows. The dashboard will show no framework scores
-- until A9 is fixed and a real assessment runs. That is the honest state:
-- absent means "not measured", 0% means "measured and found nothing", and only
-- one of those is true.
--
-- Idempotent. Re-running deletes nothing further.
-- ============================================================================

BEGIN;

select 'BEFORE' as stage, framework_code, score, total_controls_note
from (
  select framework_code, score,
         coalesce((snapshot_data->>'total_required')::text, '(n/a)') as total_controls_note
  from intelligence_snapshots
  where snapshot_type = 'scorecard'
) t
order by framework_code;

-- Only rows whose own snapshot records zero required controls, plus the
-- aggregate written in the same run. Scoped by total_required rather than by
-- framework code so a legitimate future score for these frameworks is not
-- caught by a re-run of this script.
delete from intelligence_snapshots
where snapshot_type = 'scorecard'
  and (
        coalesce((snapshot_data->>'total_required')::int, 0) = 0
     or (framework_code = 'all' and score is null)
  );

select 'AFTER' as stage, framework_code, score
from intelligence_snapshots
where snapshot_type = 'scorecard'
order by framework_code;

COMMIT;

-- Expected AFTER: zero rows.
--
-- Then clear the Redis key `ihos:framework_scores` (300s TTL, only invalidated
-- by syncScorecard) or wait it out, otherwise the dashboard keeps serving the
-- deleted values for up to five minutes.
