// src/app/api/posture/route.ts
// Reads posture with its evidence. Self-authenticating: src/middleware.ts
// deliberately exempts /api/* (needsAuth = !isPublic && !isApi), so there is
// no fallback protection behind this handler.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { groupPosture, rowsToLinks, summarise } from '@/lib/posture/read';
import { parsePostureQuery } from '@/lib/posture/query';

export const dynamic = 'force-dynamic';

const MAX_CONTROLS = 500;
const EVIDENCE_PAGE_SIZE = 1000;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin' && profile?.role !== 'ionic_user') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { controlCodes, versionId } = parsePostureQuery(new URL(request.url));
  if (controlCodes.length === 0) {
    return NextResponse.json({ error: 'controls is required' }, { status: 400 });
  }
  if (controlCodes.length > MAX_CONTROLS) {
    return NextResponse.json(
      { error: `at most ${MAX_CONTROLS} controls per request` },
      { status: 400 },
    );
  }

  const db = createAdminClient() as any;

  // PostgREST caps a single response at its `max-rows` setting (1000 by
  // default). MAX_CONTROLS * up-to-8-evidence-rows-each can exceed that, and
  // a silently truncated page does not error — it just drops rows, which
  // reads as controls downgrading (conforming -> partial -> gap) for no
  // reason tied to the evidence itself. Page with .range() until a short
  // page instead of trusting one unpaginated .select().
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += EVIDENCE_PAGE_SIZE) {
    let query = db
      .from('control_evidence')
      .select('scf_control_code, product_version_id, chunk_id, document_id, role, score, snippet')
      .in('scf_control_code', controlCodes);
    query = versionId
      ? query.eq('product_version_id', versionId)
      : query.is('product_version_id', null);
    const { data, error } = await query.range(from, from + EVIDENCE_PAGE_SIZE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const page = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < EVIDENCE_PAGE_SIZE) break;
  }

  const postures = groupPosture(controlCodes, rowsToLinks(rows));
  return NextResponse.json({ summary: summarise(postures), controls: postures });
}
