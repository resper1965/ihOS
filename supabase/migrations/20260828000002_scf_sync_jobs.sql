-- Migration 20260828000002: job rows for the SCF sync.
--
-- The crosswalk walk is ~1,468 requests against a 120-per-60s budget, roughly
-- 13 minutes, which no serverless request can hold open. The route starts the
-- work and returns a job id; this table is how an operator follows it, and how
-- a failed run says where it stopped.

CREATE TABLE IF NOT EXISTS public.scf_sync_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status         text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  stages         text[] NOT NULL,
  scf_version_id uuid,
  progress       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error          text,
  started_by     uuid REFERENCES auth.users(id),
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

COMMENT ON TABLE public.scf_sync_jobs IS
  'One row per SCF sync run. Started by POST /api/admin/sync/scf (admin or '
  'ionic_user), polled by GET with ?jobId=. A failed crosswalk run keeps its '
  'partial progress here, including the last control_code reached, so a resume '
  'starts there rather than at the beginning.';

COMMENT ON COLUMN public.scf_sync_jobs.progress IS
  'Per-stage counts. crosswalk.lastControlCode is the resume point: pass it as '
  'resumeAfterControlCode on the next POST.';

-- Only one run at a time. Two concurrent walks would spend the same vendor rate
-- budget against each other and both crawl, and the second would repeat the
-- first''s work rather than extend it. The route checks for a running job before
-- inserting; this index makes that check cheap and the invariant enforced rather
-- than merely intended.
CREATE UNIQUE INDEX IF NOT EXISTS scf_sync_jobs_one_running
  ON public.scf_sync_jobs ((status))
  WHERE status = 'running';

ALTER TABLE public.scf_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated user: a sync's progress is operational status,
-- not sensitive data, and the row holds no secret. Writes are service-role only,
-- because only the route writes, and the route gates on role first.
DROP POLICY IF EXISTS scf_sync_jobs_read ON public.scf_sync_jobs;
CREATE POLICY scf_sync_jobs_read ON public.scf_sync_jobs
  FOR SELECT TO authenticated USING (true);
