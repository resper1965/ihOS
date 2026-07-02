// src/app/api/threat-modeling/seed/route.ts
// POST — import an existing threat analysis as an approved BASELINE.
//
// When a product version has no persisted threat-model history, there is
// nothing for later versions to accumulate from. This endpoint lets an
// operator seed a known-good prior analysis (from a spreadsheet, a document,
// or a previous tool) as the baseline, marked source='manual_seed' so it is
// never mistaken for an engine-generated result. It does NOT call the GRC
// engine and does NOT fabricate anything — it persists exactly what is given.

import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

// Loose schema: the threat-model payload shape varies by source, but we
// require the minimum structure the UI and inheritance diff rely on.
const ThreatSchema = z
  .object({
    stride_category: z.string().optional(),
    affected_component: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

const SeedRequestSchema = z.object({
  product_version: z.string().min(1, 'product_version is required'),
  target_frameworks: z.array(z.string()).min(1, 'At least one framework required'),
  status: z.enum(['draft', 'reviewed', 'approved']).default('approved'),
  model_data: z
    .object({
      threat_model: z.object({ threats: z.array(ThreatSchema) }),
    })
    .passthrough(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Compliance operators only — seeding a baseline is a governance action.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin' && profile?.role !== 'ionic_user') {
    return NextResponse.json({ error: 'Forbidden: Admin or Ionic User required' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SeedRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid request: ${parsed.error.issues.map((i) => i.message).join(', ')}` },
      { status: 400 },
    );
  }

  const { product_version, target_frameworks, status, model_data } = parsed.data;

  const admin = createAdminClient();

  // Stamp provenance so this baseline is unambiguously a manual seed.
  const existingMeta = (model_data as Record<string, unknown>).metadata;
  const seededModelData = {
    ...model_data,
    metadata: {
      ...(typeof existingMeta === 'object' && existingMeta ? existingMeta : {}),
      product_version,
      target_frameworks,
      source: 'manual_seed',
      seeded_by: user.id,
      seeded_at: new Date().toISOString(),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertError } = await (admin as any)
    .from('threat_models')
    .insert({
      id: crypto.randomUUID(),
      model_data: seededModelData,
      product_version,
      target_frameworks,
      status,
      source: 'manual_seed',
      baseline_model_id: null,
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    logger.error('Failed to seed baseline threat model', {
      context: 'threat-modeling/seed',
      meta: { error: insertError?.message, product_version },
    });
    return NextResponse.json({ error: 'Failed to seed baseline threat model' }, { status: 500 });
  }

  logger.info('Seeded baseline threat model', {
    context: 'threat-modeling/seed',
    meta: { product_version, status, threats: model_data.threat_model.threats.length },
  });

  return NextResponse.json({
    success: true,
    seeded: true,
    data: { ...(inserted.model_data as Record<string, unknown>), id: inserted.id },
  });
}
