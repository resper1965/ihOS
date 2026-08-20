// src/app/api/posture/route.ts
// Reads posture with its evidence. Self-authenticating: src/middleware.ts
// deliberately exempts /api/* (needsAuth = !isPublic && !isApi), so there is
// no fallback protection behind this handler.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { groupPosture, rowsToLinks, summarise } from '@/lib/posture/read';

export const dynamic = 'force-dynamic';

const MAX_CONTROLS = 500;

export function parsePostureQuery(url: URL): {
  controlCodes: string[];
  versionId: string | null;
} {
  const raw = url.searchParams.get('controls') ?? '';
  const codes = raw
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return {
    controlCodes: [...new Set(codes)],
    versionId: url.searchParams.get('versionId'),
  };
}

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
  let query = db
    .from('control_evidence')
    .select('scf_control_code, product_version_id, chunk_id, document_id, role, score, snippet')
    .in('scf_control_code', controlCodes);
  query = versionId
    ? query.eq('product_version_id', versionId)
    : query.is('product_version_id', null);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const postures = groupPosture(
    controlCodes,
    rowsToLinks((data ?? []) as Array<Record<string, unknown>>),
  );
  return NextResponse.json({ summary: summarise(postures), controls: postures });
}
