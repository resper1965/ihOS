// scripts/check-scores.js
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing environment variables!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("=== LATEST ASSESSMENTS ===");
  const { data: assessments, error: assError } = await supabase
    .from("assessments")
    .select("id, name, started_at, total_controls, compliant_controls, missing_controls, framework_scores")
    .order("started_at", { ascending: false })
    .limit(5);

  if (assError) {
    console.error("Error fetching assessments:", assError);
  } else {
    assessments.forEach(a => {
      console.log(`\nID: ${a.id}`);
      console.log(`Name: ${a.name}`);
      console.log(`Started: ${a.started_at}`);
      console.log(`Controls (Total/Compliant/Missing): ${a.total_controls} / ${a.compliant_controls} / ${a.missing_controls}`);
      console.log("Framework Scores:", JSON.stringify(a.framework_scores, null, 2));
    });
  }

  console.log("\n=== LATEST SCORECARD SNAPSHOTS ===");
  const { data: snapshots, error: snapError } = await supabase
    .from("intelligence_snapshots")
    .select("id, snapshot_type, created_at, snapshot_data")
    .eq("snapshot_type", "scorecard")
    .order("created_at", { ascending: false })
    .limit(3);

  if (snapError) {
    console.error("Error fetching snapshots:", snapError);
  } else {
    snapshots.forEach(s => {
      console.log(`\nSnapshot ID: ${s.id} (Created at: ${s.created_at})`);
      console.log("Data:", JSON.stringify(s.snapshot_data, null, 2));
    });
  }

  console.log("\n=== EVALUATION STATS ===");
  const { data: evals, error: evError } = await supabase
    .from("evidence_evaluations")
    .select("is_compliant, confidence_score");

  if (evError) {
    console.error("Error fetching evaluations:", evError);
  } else {
    const total = evals.length;
    const compliant = evals.filter(e => e.is_compliant).length;
    const nonCompliant = total - compliant;
    const avgConfidence = evals.reduce((sum, e) => sum + (e.confidence_score ?? 0), 0) / (total || 1);
    
    console.log(`Total Evaluations: ${total}`);
    console.log(`Compliant: ${compliant}`);
    console.log(`Non-Compliant: ${nonCompliant}`);
    console.log(`Average Confidence: ${avgConfidence.toFixed(2)}%`);
  }
}

main().catch(console.error);
