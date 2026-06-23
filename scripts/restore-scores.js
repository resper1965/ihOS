// scripts/restore-scores.js
// Restaura snapshots de scorecard zerados com os dados da última avaliação real
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey);

// A última avaliação real que rodou bem (id: f371041a)
// iso27001: 48/93 = 52%, outras frameworks não avaliadas no mesmo run
const BEST_ASSESSMENT_ID = 'f371041a-2a57-4620-91f1-269a14557c55';

async function main() {
  console.log('Fetching best assessment data...');

  const { data: assessment, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('id', BEST_ASSESSMENT_ID)
    .single();

  if (error || !assessment) {
    console.error('Could not find assessment:', error);
    return;
  }

  const frameworkScores = assessment.framework_scores;
  console.log('Assessment framework_scores:', JSON.stringify(frameworkScores, null, 2));

  for (const fw of frameworkScores) {
    const code = fw.frameworkId;
    const score = fw.score;
    const implemented = fw.implementedCount ?? 0;
    const total = fw.totalRequired ?? 0;

    if (score === null || score === undefined) {
      console.log(`Skipping ${code}: no score`);
      continue;
    }

    // Check existing snapshot
    const { data: existing } = await supabase
      .from('intelligence_snapshots')
      .select('id, score')
      .eq('snapshot_type', 'scorecard')
      .eq('framework_code', code)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log(`[${code}] Current snapshot score: ${existing?.score ?? 'none'}, Assessment score: ${score}`);

    if (existing && existing.score !== null && existing.score >= score) {
      console.log(`  -> Keeping existing score ${existing.score}, skipping restore`);
      continue;
    }

    // Delete and re-insert with assessment data
    await supabase
      .from('intelligence_snapshots')
      .delete()
      .eq('snapshot_type', 'scorecard')
      .eq('framework_code', code);

    const { error: insertError } = await supabase
      .from('intelligence_snapshots')
      .insert({
        snapshot_type: 'scorecard',
        framework_code: code,
        input_payload: {
          assessment_id: BEST_ASSESSMENT_ID,
          source: 'assessment_engine',
          restored_by: 'restore-scores-script',
        },
        result_payload: {
          score,
          implemented,
          total_required: total,
          missing_controls: (fw.missingControls ?? []).slice(0, 20),
        },
        snapshot_data: {
          name: code,
          score,
          coverage: score,
          missing: (fw.missingControls ?? []).length,
          source: 'assessment_engine',
          assessment_id: BEST_ASSESSMENT_ID,
          implemented,
          total_required: total,
          evaluated_at: assessment.completed_at,
        },
        score,
        user_id: null,
        metadata: null,
      });

    if (insertError) {
      console.error(`  -> Failed to restore ${code}:`, insertError);
    } else {
      console.log(`  -> Restored ${code} with score ${score}`);
    }
  }

  console.log('\nRestore complete!');

  // Show final snapshot state
  const { data: snapshots } = await supabase
    .from('intelligence_snapshots')
    .select('framework_code, score, created_at')
    .eq('snapshot_type', 'scorecard')
    .order('created_at', { ascending: false });

  console.log('\nFinal snapshots:');
  (snapshots || []).forEach(s => {
    console.log(`  ${s.framework_code}: ${s.score}% (${s.created_at})`);
  });
}

main().catch(console.error);
