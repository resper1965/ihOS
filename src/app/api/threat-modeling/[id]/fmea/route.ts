import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ihosEngine } from '@/lib/ihos-engine';
import { logger } from '@/lib/logger';

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user || !session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    // 2. Load the draft threat model
    const { data: row, error: fetchError } = await admin
      .from('threat_models')
      .select('model_data')
      .eq('id', id)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: 'Threat model not found' }, { status: 404 });
    }

    const modelData = row.model_data as any;
    const threats = modelData.threat_model?.threats || [];

    if (threats.length === 0) {
      return NextResponse.json({ error: 'No threats found to quantify' }, { status: 400 });
    }

    // 3. Call GRC Engine to correlate FMEA
    // We send the raw threats so the engine can process them
    const result = await ihosEngine.correlateFmea(id, {
      fmea_items: threats,
    }, session.access_token);

    // Engine returns the array of FmeaCorrelation directly or wrapped.
    // Assuming the engine returns { fmea_correlations: [...] }
    const fmeaCorrelations = (result as any).fmea_correlations || [];

    // 4. Update the threat model in the database
    modelData.threat_model = {
      ...modelData.threat_model,
      fmea_correlations: fmeaCorrelations,
    };

    const { error: updateError } = await admin
      .from('threat_models')
      .update({ model_data: modelData })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    logger.info('FMEA confrontation completed successfully', {
      context: 'threat-modeling-fmea',
      meta: { model_id: id, count: fmeaCorrelations.length },
    });

    return NextResponse.json({ success: true, fmea_correlations: fmeaCorrelations });
  } catch (err) {
    logger.error('FMEA confrontation failed', {
      context: 'threat-modeling-fmea',
      error: err,
    });
    return NextResponse.json(
      { error: 'Failed to run FMEA confrontation', detail: (err as Error).message },
      { status: 500 }
    );
  }
}
