// src/app/api/cron/run-threat-model/route.ts
// Cron endpoint to trigger automated threat modeling (STRIDE) via ihos-api.
// Protected by CRON_SECRET header.

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { ihosEngine } from '@/lib/ihos-engine';
import { getDeltaFingerprint } from '@/lib/assessment/corpus-fingerprint';
import { resolveVersionContext, findBaselineModel, annotateInheritance } from '@/lib/threat-modeling/lineage';
import { DEFAULT_FRAMEWORKS } from '@/lib/assessment/framework-registry';

export const maxDuration = 300; // Threat modeling can be slow (LLM + GRC)

export async function POST(req: Request) {
  try {
    // ── Auth via CRON_SECRET ────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && !cronSecret) {
      return NextResponse.json({ error: 'Internal configuration error' }, { status: 500 });
    }

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Parse request body ──────────────────────────────────────────────────
    let body: { 
      product_version?: string; 
      target_frameworks?: string[]; 
      forceReevaluate?: boolean;
    } = {};
    
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const admin = createAdminClient();

    // 1. Resolve product version
    // If not provided, find the most recently updated version
    let product_version = body.product_version;
    if (!product_version) {
      const { data: latestVersion } = await admin
        .from('product_versions')
        .select('version_code')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      product_version = latestVersion?.version_code;
    }

    if (!product_version) {
      return NextResponse.json({ error: 'No product version found to analyze' }, { status: 404 });
    }

    const frameworks = body.target_frameworks ?? DEFAULT_FRAMEWORKS.map(f => f.id);
    const forceReevaluate = body.forceReevaluate ?? false;

    // Set flag for downstream logic
    process.env.IS_CRON = 'true';

    logger.info('Cron threat modeling triggered', { 
      context: 'cron/run-threat-model', 
      meta: { product_version, frameworks } 
    });

    // 2. Resolve version context & deltas
    const { productVersionId, previousVersionId } = await resolveVersionContext(admin, product_version);
    const { fingerprint: deltaFingerprint, deltas } = productVersionId
      ? await getDeltaFingerprint(productVersionId)
      : { fingerprint: 'no-product-version-match', deltas: [] as any };

    // 3. Cache check
    if (!forceReevaluate) {
      const sortedFrameworks = [...frameworks].sort();
      const { data: existingRows } = await admin
        .from('threat_models')
        .select('*')
        .eq('product_version', product_version)
        .order('created_at', { ascending: false })
        .limit(10);

      const existing = ((existingRows ?? []) as any[]).find((row: any) => {
        const rowFrameworks = [...(row.target_frameworks ?? [])].sort();
        const sameFrameworks = JSON.stringify(rowFrameworks) === JSON.stringify(sortedFrameworks);
        const sameDeltas = row.model_data?.metadata?.delta_fingerprint === deltaFingerprint;
        return sameFrameworks && sameDeltas;
      });

      if (existing) {
        return NextResponse.json({
          success: true,
          cached: true,
          message: 'Reusing existing model — no deltas found',
          assessmentId: existing.id
        });
      }
    }

    // 4. Generate via Engine (Bypassing user JWT via ENGINE_KEY in ihosEngine client)
    let generatedData: any;
    try {
      const result = await ihosEngine.generateThreatModel({
        product_version,
        target_frameworks: frameworks,
        skip_grc_enrichment: false,
        skip_fmea: true,
      });
      generatedData = result;
    } catch (genErr) {
      const msg = genErr instanceof Error ? genErr.message : String(genErr);
      logger.error('Threat generation failed', { context: 'cron/run-threat-model', error: genErr });
      return NextResponse.json({ success: false, error: 'Generation failed: ' + msg }, { status: 502 });
    }

    // Stamp fingerprint
    generatedData = {
      ...generatedData,
      metadata: {
        ...generatedData.metadata,
        delta_fingerprint: deltaFingerprint,
        applied_deltas: deltas.map((d: any) => d.feature_slug),
      },
    };

    // 5. Annotate inheritance
    const baseline = await findBaselineModel(admin, previousVersionId, frameworks);
    const { data: annotatedData, baselineModelId } = annotateInheritance(generatedData, baseline);
    generatedData = annotatedData;

    // 6. Persist
    const modelSource = baselineModelId ? 'inherited' : 'generated';
    const { data: inserted, error: insertError } = await admin
      .from('threat_models')
      .insert({
        product_version,
        target_frameworks: frameworks,
        model_data: generatedData,
        status: 'draft',
        source: modelSource,
        baseline_model_id: baselineModelId,
      })
      .select('id')
      .single();

    if (insertError) {
      logger.error('Failed to save cron threat model', { context: 'cron/run-threat-model', error: insertError });
      // Fallback for older schema
      await admin.from('threat_models').insert({
        product_version,
        target_frameworks: frameworks,
        model_data: generatedData,
        status: 'draft',
      });
    }

    return NextResponse.json({
      success: true,
      modelId: inserted?.id,
      product_version,
      frameworks
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron threat modeling failed';
    logger.error(message, { context: 'cron/run-threat-model', error: err });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
