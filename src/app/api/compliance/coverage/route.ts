// src/app/api/compliance/coverage/route.ts
// Exposes projectFrameworkFromCrosswalk, which reads the real crosswalk under a
// versioned, owned policy. It runs only inside an assessment today; nothing
// else serves it over HTTP.
//
// The per-framework loop lives in @/lib/compliance/coverage so a Server
// Component can share it without duplicating the "undecided" vs. "covers
// nothing" distinction.
//
// Deliberately retained despite having no in-app caller: src/app/(dashboard)/
// compliance/page.tsx calls collectCoverage directly, in-process, rather than
// over HTTP, so this route's own request log staying empty is expected, not
// evidence of abandonment. It is kept as the external API surface for the
// coverage question — freshly written and tested — unlike /api/compliance/gaps
// and /roi, which this same branch removed because nothing, in-app or out,
// still asked them anything.
//
// Spec: docs/superpowers/specs/2026-09-09-ui-information-architecture-design.md §5

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedScfVersionId } from '@/lib/standard-api/sync/catalog';
import { collectCoverage } from '@/lib/compliance/coverage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Named explicitly, never defaulted: scf_control_mappings holds every
  // catalogue version ever walked, and reading two at once would fold the
  // pre-STRM fabricated crosswalk back into the corrected one.
  const scfVersionId = await getCachedScfVersionId();

  return NextResponse.json({ scfVersionId, frameworks: await collectCoverage(scfVersionId) });
}
