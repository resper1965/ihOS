// src/scripts/check-mapping-integrity.ts
// Runs the clone detector against the live scf_framework_mappings table.
// Exits 1 when any framework pair shares a byte-identical SCF control set,
// so this can gate a crosswalk load (see the epistemic-integrity plan, Task 5).
//
// Usage: npm run check:mappings

import "dotenv/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectClonedMappings, type MappingRow } from "@/lib/assessment/mapping-integrity";

const PAGE = 1000;

async function main() {
  const admin = createAdminClient();
  const rows: MappingRow[] = [];

  // PostgREST caps a single response, so page until a short page.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("scf_framework_mappings")
      .select("framework_code, target_control_id, scf_control_code")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[check:mappings] read failed: ${error.message}`);
      process.exit(2);
    }
    const page = (data ?? []) as MappingRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const frameworks = new Set(rows.map((r) => r.framework_code));
  console.log(`[check:mappings] ${rows.length} rows across ${frameworks.size} frameworks`);

  const findings = detectClonedMappings(rows);
  if (findings.length === 0) {
    console.log("[check:mappings] OK — no two frameworks share an identical SCF control set");
    return;
  }

  console.error(`[check:mappings] ${findings.length} suspected fabricated mapping(s):`);
  for (const f of findings) {
    const how = f.targetIdsIdenticalAfterStrip
      ? `target ids are "${f.mirrors}" with "${f.strippedPrefix}" prefixed`
      : "target ids differ, but the SCF control set is byte-identical";
    console.error(`  - ${f.suspect} mirrors ${f.mirrors}: ${f.sharedScfControls} shared SCF controls; ${how}`);
  }
  console.error(
    "[check:mappings] Two different standards cannot map to an identical SCF set. " +
      "Treat these as fabricated until a real crosswalk is loaded.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[check:mappings] unexpected failure:", err);
  process.exit(2);
});
