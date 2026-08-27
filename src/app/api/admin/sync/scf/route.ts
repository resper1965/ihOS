// Operator-triggered SCF sync.
//
// A full crosswalk walk is ~1,468 requests against a 120-per-60s budget —
// roughly 13 minutes, well past any serverless request budget. So this route
// starts the work, records a job row, and returns its id. Progress is read back
// from that row, never held in the request.
//
// Spec: docs/superpowers/specs/2026-08-27-control-first-design.md §4

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createThrottle } from '@/lib/standard-api/sync/throttle';
import {
  getLatestScfVersionId,
  syncControlCatalog,
  syncFrameworkCatalog,
} from '@/lib/standard-api/sync/catalog';
import { syncCrosswalk } from '@/lib/standard-api/sync/crosswalk';
import { logger } from '@/lib/logger';

export const maxDuration = 300;

type Stage = 'frameworks' | 'controls' | 'crosswalk';
const ALL_STAGES: Stage[] = ['frameworks', 'controls', 'crosswalk'];

interface JobRow {
  id: string;
  status: 'running' | 'completed' | 'failed';
}

/** Minimal shape used against tables absent from types.generated.ts. */
interface JobClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    insert(row: Record<string, unknown>): {
      select(cols: string): {
        single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    update(row: Record<string, unknown>): {
      eq(col: string, v: string): Promise<{ error: { message: string } | null }>;
    };
  };
}

export async function POST(req: Request) {
  // Auth: session, then role. Copied in shape from
  // src/app/api/settings/integrations/standard-api/key/route.ts:46-61 — the
  // same gate the mappings upload route was missing while its documentation
  // claimed otherwise.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin' && profile?.role !== 'ionic_user') {
    return NextResponse.json(
      { error: 'Forbidden: syncing the SCF catalogue requires an admin role' },
      { status: 403 },
    );
  }

  let body: { stages?: string[]; resumeAfterControlCode?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // An empty body means "all stages". Not an error.
  }

  const requested: Stage[] =
    Array.isArray(body.stages) && body.stages.length > 0
      ? ALL_STAGES.filter((s) => body.stages?.includes(s))
      : ALL_STAGES;

  if (requested.length === 0) {
    return NextResponse.json(
      { error: `stages must be a subset of ${ALL_STAGES.join(', ')}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient() as unknown as JobClient;

  // One sync at a time. Two concurrent walks would spend the same 120/60s
  // budget against each other and both crawl, and the second would repeat the
  // first's work rather than extend it.
  const { data: running } = await admin
    .from('scf_sync_jobs')
    .select('id, status')
    .eq('status', 'running')
    .maybeSingle();

  if (running !== null && running !== undefined) {
    return NextResponse.json(
      {
        error: 'A sync is already running',
        jobId: (running as unknown as JobRow).id,
      },
      { status: 409 },
    );
  }

  const { data: job, error: jobError } = await admin
    .from('scf_sync_jobs')
    .insert({
      status: 'running',
      stages: requested,
      started_by: user.id,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (jobError || job === null) {
    return NextResponse.json(
      { error: `could not create sync job: ${jobError?.message ?? 'no row returned'}` },
      { status: 500 },
    );
  }

  const jobId = String(job.id);

  // Deliberately not awaited. The walk outlives this request; the job row is
  // how the operator follows it. Errors are recorded there, not swallowed.
  void runSync(jobId, requested, body.resumeAfterControlCode, admin);

  return NextResponse.json({
    jobId,
    stages: requested,
    status: 'running',
    note:
      requested.includes('crosswalk')
        ? 'The crosswalk walk takes roughly 13 minutes at the vendor rate limit. ' +
          'Poll GET /api/admin/sync/scf?jobId=… for progress.'
        : 'Poll GET /api/admin/sync/scf?jobId=… for progress.',
  });
}

async function runSync(
  jobId: string,
  stages: Stage[],
  resumeAfterControlCode: string | undefined,
  admin: JobClient,
): Promise<void> {
  const throttle = createThrottle();
  const progress: Record<string, unknown> = {};

  const save = async (patch: Record<string, unknown>) => {
    const { error } = await admin.from('scf_sync_jobs').update(patch).eq('id', jobId);
    if (error) logger.error(`sync job ${jobId} update failed: ${error.message}`, { context: 'sync/scf' });
  };

  try {
    const scfVersionId = await getLatestScfVersionId(throttle);
    progress.scf_version_id = scfVersionId;
    await save({ scf_version_id: scfVersionId, progress });

    if (stages.includes('frameworks')) {
      const r = await syncFrameworkCatalog(scfVersionId, throttle);
      progress.frameworks = { synced: r.synced, rejected: r.rejected.length };
      await save({ progress });
    }

    if (stages.includes('controls')) {
      const r = await syncControlCatalog(scfVersionId, throttle);
      progress.controls = { synced: r.synced, rejected: r.rejected.length };
      await save({ progress });
    }

    if (stages.includes('crosswalk')) {
      const r = await syncCrosswalk(scfVersionId, {
        throttle,
        resumeAfterControlCode,
        onProgress: () => {
          // Intentionally not written per control: 1,468 row updates would cost
          // more than the walk. The stage result below is the record.
        },
      });
      progress.crosswalk = {
        controlsWalked: r.controlsWalked,
        mappingsStored: r.mappingsStored,
        skippedSelfReferential: r.skippedSelfReferential,
        failures: r.failures.length,
        lastControlCode: r.lastControlCode,
      };
      await save({ progress });
    }

    await save({ status: 'completed', finished_at: new Date().toISOString(), progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`sync job ${jobId} failed: ${message}`, { context: 'sync/scf' });
    // The partial progress stays on the row. A crosswalk run that died at
    // control 900 records lastControlCode, and a resume starts there.
    await save({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error: message,
      progress,
    });
  }
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = new URL(req.url).searchParams.get('jobId');
  if (jobId === null) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  const admin = createAdminClient() as unknown as JobClient;
  const { data: job } = await admin
    .from('scf_sync_jobs')
    .select('id, status, stages, scf_version_id, progress, error, started_at, finished_at')
    .eq('id', jobId)
    .maybeSingle();

  if (job === null || job === undefined) {
    return NextResponse.json({ error: 'No such job' }, { status: 404 });
  }

  return NextResponse.json(job);
}
