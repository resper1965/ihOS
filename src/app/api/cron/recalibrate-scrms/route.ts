// src/app/api/cron/recalibrate-scrms/route.ts
// Cron endpoint to trigger SCRMS recalibration (Supply Chain Risk Management).
// Protected by CRON_SECRET header.

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerGrcRecalibration } from '@/lib/assessment/grc-trigger';

export const maxDuration = 300;

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
    let body: { product_version_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const admin = createAdminClient();

    // 1. Resolve product version
    let productVersionId = body.product_version_id;

    if (!productVersionId) {
      // Find active baseline first
      const { data: baseline } = await admin
        .from('msr_baselines')
        .select('product_version_id')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      productVersionId = baseline?.product_version_id;
    }

    if (!productVersionId) {
      // Fallback to latest version
      const { data: latestVersion } = await admin
        .from('product_versions')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      productVersionId = latestVersion?.id;
    }

    if (!productVersionId) {
      return NextResponse.json({ error: 'No product version found to recalibrate' }, { status: 404 });
    }

    // Set flag for downstream logic
    process.env.IS_CRON = 'true';

    logger.info('Cron SCRMS recalibration triggered', { 
      context: 'cron/recalibrate-scrms', 
      meta: { productVersionId } 
    });

    // 2. Trigger GRC Recalibration
    // We pass a system user ID or a reserved UUID for cron actions
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
    
    await triggerGrcRecalibration(productVersionId, SYSTEM_USER_ID);

    return NextResponse.json({
      success: true,
      message: 'SCRMS recalibration and auto-scan completed',
      productVersionId
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron SCRMS recalibration failed';
    logger.error(message, { context: 'cron/recalibrate-scrms', error: err });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
