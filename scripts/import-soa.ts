// Operator script: read the Statement of Applicability into soa_entries.
//
//   npx tsx scripts/import-soa.ts --dry-run
//   npx tsx scripts/import-soa.ts
//
// Downloads the configured SoA from the compliance_documents bucket, parses its
// three control sheets, and writes one row per control. The two guards in
// src/lib/soa/source.ts stop the run when the file changed or a later SoA
// appeared; neither picks a replacement.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

import { createHash } from 'node:crypto';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 200;

async function main() {
  const XLSX = await import('xlsx');
  const { parseSoaSheet, CONTROL_SHEETS, sameSheetName } = await import('../src/lib/soa/parse');
  const { checkSoaSource, isMissingRelationError, SOA_DOCUMENT_ID } = await import('../src/lib/soa/source');
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const db = createAdminClient() as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: unknown) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
          order: (col: string) => {
            range: (from: number, to: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string; code?: string } | null }>;
          };
        };
        neq: (col: string, v: unknown) => {
          order: (col: string) => {
            range: (from: number, to: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
          };
        };
      };
      upsert: (rows: Array<Record<string, unknown>>, o: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    };
    storage: {
      from: (b: string) => { download: (p: string) => Promise<{ data: Blob | null; error: { message: string } | null }> };
    };
  };

  const { data: doc, error: docError } = await db
    .from('compliance_documents')
    .select('id, year, filepath, title')
    .eq('id', SOA_DOCUMENT_ID)
    .maybeSingle();
  if (docError) throw new Error(`compliance_documents: ${docError.message}`);
  if (!doc) throw new Error(`document ${SOA_DOCUMENT_ID} does not exist. A person must choose another SoA and change the constant.`);

  console.log(`source: [${doc.id}] ${String(doc.title)}`);

  const { data: blob, error: dlError } = await db.storage
    .from('compliance_documents')
    .download(String(doc.filepath));
  if (dlError || !blob) throw new Error(`download failed: ${dlError?.message ?? 'no data'}`);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  console.log(`file: ${buffer.length} bytes, sha256 ${sha256.slice(0, 16)}…`);

  // compliance_documents holds every compliance document, not only the SoAs --
  // 198 rows today, past the 1,000-row cap supabase-js applies to an unbounded
  // select() (.limit() does not lift it). Paged with .range() under a total
  // order (id, the primary key, so no ties): the exact pattern this project's
  // Global Constraints call out, because Guard 2 exists to catch a later-year
  // SoA and a truncated, unordered page could drop it from view.
  const otherSoa: Array<{ id: number; year: number | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error: pageError } = await db
      .from('compliance_documents')
      .select('id, year, doc_type')
      .neq('id', SOA_DOCUMENT_ID)
      .order('id')
      .range(from, from + 999);
    if (pageError) throw new Error(`compliance_documents: ${pageError.message}`);
    const rows = page ?? [];
    for (const r of rows) {
      if (String(r.doc_type) === 'soa') {
        otherSoa.push({ id: Number(r.id), year: r.year === null ? null : Number(r.year) });
      }
    }
    if (rows.length < 1000) break;
  }

  // The recorded hash lives on the rows this script wrote last time.
  // One row is enough: every row of an import carries the same hash. NOT
  // .maybeSingle() — that errors when more than one row matches, and after the
  // first import there are 142.
  //
  // A missing soa_entries table (the normal state before the migration is
  // applied) surfaces here as a query error, not as an empty result. That is
  // the ONLY error treated as "no hash recorded yet" -- isMissingRelationError
  // discriminates it from everything else (RLS denial, a renamed column, a
  // timeout). Swallowing any error here would be worse than no guard: if
  // soa_entries already holds 142 rows and the file has genuinely changed, an
  // unrelated read failure must stop the run, not silently let a changed file
  // overwrite the prior import.
  const { data: prior, error: priorError } = await db
    .from('soa_entries')
    .select('source_sha256')
    .eq('document_id', SOA_DOCUMENT_ID)
    .order('annex_code')
    .range(0, 0);
  let recorded: string | null;
  if (priorError) {
    if (!isMissingRelationError(priorError)) {
      throw new Error(`soa_entries: ${priorError.message}`);
    }
    console.log(`no prior hash recorded (${priorError.message}) — treating this as a first import.`);
    recorded = null;
  } else {
    recorded = (prior ?? [])[0]?.source_sha256 as string | undefined ?? null;
  }

  const problems = checkSoaSource(
    { id: Number(doc.id), year: doc.year === null ? null : Number(doc.year), sha256: recorded },
    otherSoa,
    sha256,
  );
  if (problems.length > 0) {
    console.error('\nREFUSING TO IMPORT:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const wb = XLSX.read(buffer, { type: 'buffer' });
  console.log(`sheets: ${wb.SheetNames.join(' | ')}\n`);

  const entries = [];
  for (const spec of CONTROL_SHEETS) {
    const actual = wb.SheetNames.find((n) => sameSheetName(n, spec.sheetName));
    if (!actual) {
      throw new Error(
        `sheet "${spec.sheetName}" is missing from the workbook. Refusing to ` +
          `import a partial SoA — a skipped sheet is a set of controls that ` +
          `silently do not exist.`,
      );
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[actual], {
      header: 1,
      blankrows: true,
      defval: '',
    }) as unknown[][];
    const parsed = parseSoaSheet(rows, spec);
    console.log(`${spec.sheetName}: ${parsed.length} controls, ${parsed.filter((e) => e.applicable).length} applicable`);
    entries.push(...parsed);
  }

  console.log(`\ntotal: ${entries.length} controls, ${entries.filter((e) => e.applicable).length} applicable`);

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  const rows = entries.map((e) => ({
    document_id: SOA_DOCUMENT_ID,
    annex_code: e.annexCode,
    annex_group: e.annexGroup,
    title: e.title,
    description: e.description,
    applicable: e.applicable,
    justification: e.justification,
    notes: e.notes,
    standard: e.standard,
    annex: e.annex,
    source_sheet: e.sourceSheet,
    source_row: e.sourceRow,
    source_sha256: sha256,
  }));

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from('soa_entries')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'document_id,annex_code' });
    if (error) throw new Error(`upsert soa_entries: ${error.message}`);
    console.log(`  wrote ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log('\ndone.');
}

main();
