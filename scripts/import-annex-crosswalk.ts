// Operator script: import the Annex A crosswalk out of the legacy table.
//
//   npx tsx scripts/import-annex-crosswalk.ts --dry-run
//   npx tsx scripts/import-annex-crosswalk.ts
//
// Reads scf_framework_mappings, keeps only Annex A ids, classifies each one's
// edition from the id itself, and writes annex_control_mappings. Every row
// lands probable, with a null relationship and a provenance that says its
// origin is unrecorded -- because it is: all 10,074 legacy rows share one
// synced_at of 2026-06-05, from an import that is not in this repository.
//
// The legacy table is NOT modified and NOT dropped.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const DRY_RUN = process.argv.includes('--dry-run');
const PROVENANCE = 'undocumented_pre_2026-06-05';
const PAGE = 1000;
const BATCH = 500;

interface LegacyRow {
  target_control_id: string;
  scf_control_code: string | null;
}

async function main() {
  const { editionOf } = await import('../src/lib/annex/edition');
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  type LegacyPage = Promise<{ data: LegacyRow[] | null; error: { message: string } | null }>;
  type Orderable = { order: (col: string) => Orderable; range: (a: number, b: number) => LegacyPage };
  const db = createAdminClient() as never as {
    from: (t: string) => {
      select: (c: string) => {
        order: (col: string) => Orderable;
      };
      upsert: (
        rows: Array<Record<string, unknown>>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };

  // Paged with .range(): supabase-js caps an unbounded select at 1,000 rows and
  // .limit() does not lift it. The legacy table holds 10,074.
  //
  // .order() alongside .range(): without a deterministic order, Postgres gives
  // no guarantee of stable row order between two range() requests -- page 2
  // could repeat a row from page 1 and skip another, and nothing in the
  // "to import: N rows" summary below would tell the difference. target_control_id
  // alone is not unique (~21 rows share every one of the 125 distinct ids), so a
  // second key -- the only other column in this select -- is needed to reach a
  // total order.
  const legacy: LegacyRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('scf_framework_mappings')
      .select('target_control_id, scf_control_code')
      .order('target_control_id')
      .order('scf_control_code')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read scf_framework_mappings: ${error.message}`);
    const rows = data ?? [];
    legacy.push(...rows);
    if (rows.length < PAGE) break;
  }
  console.log(`legacy rows read: ${legacy.length}`);

  // Keyed by the primary key so an id filed under both framework codes becomes
  // one row rather than two -- 2,689 raw Annex A rows collapse to 2,228.
  const byKey = new Map<string, Record<string, unknown>>();
  const unclassified = new Map<string, number>();
  let notAnnex = 0;
  let noControl = 0;

  for (const row of legacy) {
    const annexCode = row.target_control_id;
    if (!annexCode?.startsWith('A.')) { notAnnex++; continue; }

    const edition = editionOf(annexCode);
    if (edition === null) {
      unclassified.set(annexCode, (unclassified.get(annexCode) ?? 0) + 1);
      continue;
    }

    const controlCode = row.scf_control_code;
    if (!controlCode) { noControl++; continue; }

    byKey.set(`${edition}|${annexCode}|${controlCode}`, {
      edition,
      annex_code: annexCode,
      control_code: controlCode,
      relationship_type: null,
      provenance: PROVENANCE,
      confidence: 'probable',
      decided_by: null,
      decided_at: null,
      rationale: null,
    });
  }

  const rows = [...byKey.values()];
  const byEdition: Record<string, Set<string>> = {};
  for (const r of rows) {
    const e = String(r.edition);
    (byEdition[e] ??= new Set()).add(String(r.annex_code));
  }

  console.log(`\nto import: ${rows.length} rows`);
  for (const [e, ids] of Object.entries(byEdition)) {
    console.log(`  ${e}: ${ids.size} distinct annex ids`);
  }
  console.log(`skipped, not an Annex A id: ${notAnnex}`);
  console.log(`skipped, no SCF control code: ${noControl}`);

  if (unclassified.size > 0) {
    console.log(`\nEXCLUDED -- edition could not be determined from the id:`);
    for (const [id, n] of unclassified) console.log(`  ${id}  (${n} legacy rows)`);
    console.log(
      'These are reported rather than defaulted. An id whose edition is unknown ' +
        'is not filed under a guess.',
    );
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db
      .from('annex_control_mappings')
      .upsert(batch, { onConflict: 'edition,annex_code,control_code' });
    if (error) throw new Error(`upsert annex_control_mappings: ${error.message}`);
    console.log(`  wrote ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log('\ndone.');
}

main();
