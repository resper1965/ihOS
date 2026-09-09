// Daily: assert that the spine still holds together.
//
// Returns 200 with an empty list when everything resolves, and 500 with the
// failures when it does not — a cron that reports 200 while the product is
// broken is the thing this route exists to prevent.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCachedScfVersionId } from '@/lib/standard-api/sync/catalog';
import { checkOfferedFrameworksResolve, checkAnnexMappingsResolve } from '@/lib/spine/invariants';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: an unset CRON_SECRET must never admit an unauthenticated
  // request (same rationale as cron/defectdojo-sync) — this route reports
  // compliance posture, so an open endpoint is not acceptable either.
  if (!cronSecret) {
    logger.error('CRON_SECRET is missing. Aborting.', { context: 'cron/spine-invariants' });
    return NextResponse.json({ error: 'Internal configuration error' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const scfVersionId = await getCachedScfVersionId();
  const failures = [
    ...(await checkOfferedFrameworksResolve(admin, scfVersionId)),
    ...(await checkAnnexMappingsResolve(admin, scfVersionId)),
  ];

  if (failures.length > 0) {
    logger.error('spine invariant failed', {
      context: 'cron/spine-invariants',
      meta: { scfVersionId, failures },
    });
    return NextResponse.json({ scfVersionId, failures }, { status: 500 });
  }

  return NextResponse.json({ scfVersionId, failures: [] });
}
