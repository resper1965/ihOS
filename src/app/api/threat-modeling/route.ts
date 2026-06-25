// src/app/api/threat-modeling/route.ts
// GET  — list threat models (optional ?version= filter)
// POST — generate a new threat model via the GRC engine

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ihosEngine } from '@/lib/ihos-engine';
import type {
  ThreatModelRecord,
  ThreatModelData,
  ThreatModelSummary,
} from '@/lib/supabase/types';

export const maxDuration = 300; // generation can take up to 5 min

// ── GET — list threat models ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from('threat_models')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ThreatModeling] List error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch threat models' }, { status: 500 });
  }

  const records = (rows ?? []) as ThreatModelRecord[];

  // Optional client-side filter by product_version
  const version = request.nextUrl.searchParams.get('version');

  const models: ThreatModelSummary[] = records
    .filter((r) => {
      if (!version) return true;
      return r.data?.product_version === version;
    })
    .map((r) => {
      const d: ThreatModelData = r.data;
      return {
        id: r.id,
        model_id: d.model_id,
        product_version: d.product_version,
        status: d.status,
        threat_count: d.threat_model?.threats?.length ?? 0,
        gap_count: d.gaps?.length ?? 0,
        recommendation_count: d.recommendations?.length ?? 0,
        avg_rpn: d.fmea?.summary?.avg_rpn ?? 0,
        created_at: r.created_at,
      };
    });

  return NextResponse.json({ models });
}

// ── POST — generate new threat model ────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { product_version?: string; target_frameworks?: string[]; skip_enrichment?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { product_version, target_frameworks, skip_enrichment } = body;

  if (!product_version || typeof product_version !== 'string') {
    return NextResponse.json(
      { error: 'product_version is required and must be a string' },
      { status: 400 },
    );
  }

  if (!Array.isArray(target_frameworks) || target_frameworks.length === 0) {
    return NextResponse.json(
      { error: 'target_frameworks is required and must be a non-empty array' },
      { status: 400 },
    );
  }

  try {
    console.log('[ThreatModeling] Generating threat model:', {
      product_version,
      target_frameworks,
      skip_enrichment,
    });

    const result = await ihosEngine.generateThreatModel({
      product_version,
      target_frameworks,
      skip_grc_enrichment: skip_enrichment,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Threat model generation failed';
    console.error('[ThreatModeling] Generation error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
