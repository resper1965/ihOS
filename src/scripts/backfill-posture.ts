// src/scripts/backfill-posture.ts
// One-shot: rebuild provenance and evidence for the existing corpus, then
// print the verdict distribution.
//
// Run with:  npm run backfill:posture
// Add --commit to write; without it the script only reports.

import 'dotenv/config';
import { createAdminClient } from '../lib/supabase/admin';
import { generateEmbeddings } from '../lib/chat/embeddings';
import { buildEvidenceLinks, normalizeRrf } from '../lib/posture/bind-evidence';
import { persistProvenance, replaceEvidenceForScope } from '../lib/posture/persistence';
import { groupPosture, summarise } from '../lib/posture/read';
import type { ProvenanceRow } from '../lib/posture/types';

const COMMIT = process.argv.includes('--commit');
const MATCH_THRESHOLD = 0.2;
const MATCH_COUNT = 8;

/** Shape read from `scf_controls`. Named so `.map()` callbacks below infer
 * properly instead of falling back to implicit `any` under strict mode. */
type ControlRow = { control_code: string; control_name: string; description: string | null };

async function main() {
  // Cast: the generated Database type produces SelectQueryError unions on
  // .from().select() chains across this repo (see bulk-reindex.ts,
  // corpus-fingerprint.ts, observed-posture/route.ts) — a pre-existing,
  // repo-wide typing gap, not something specific to this script.
  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  // 1. The control set we are reporting on.
  const { data: controls, error: controlsError } = await db
    .from('scf_controls')
    .select('control_code, control_name, description')
    .order('control_code');
  if (controlsError) throw new Error(`scf_controls: ${controlsError.message}`);
  const controlList = (controls ?? []) as ControlRow[];
  console.log(`controls: ${controlList.length}`);

  // 2. doc_type per document, so evidence roles can be resolved.
  const docTypes = new Map<number, string | null>();
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from('compliance_documents')
      .select('id, doc_type')
      .range(from, from + 999);
    if (error) throw new Error(`compliance_documents: ${error.message}`);
    for (const d of data ?? []) docTypes.set(Number(d.id), d.doc_type ?? null);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  console.log(`documents: ${docTypes.size}`);

  const unclassified = [...docTypes.values()].filter(
    (t) => !t || t.toUpperCase() === 'UNCLASSIFIED',
  ).length;
  console.log(`documents that can hold no evidence (UNCLASSIFIED or null): ${unclassified}`);

  // 3. Retrieve per control and record provenance.
  const provenance: ProvenanceRow[] = [];
  const BATCH = 20;
  for (let i = 0; i < controlList.length; i += BATCH) {
    const batch = controlList.slice(i, i + BATCH);
    const embeddings = await generateEmbeddings(
      batch.map((c) => `${c.control_name}. ${c.description ?? ''}`),
    );

    for (let j = 0; j < batch.length; j++) {
      const control = batch[j];
      const { data, error } = await db.rpc('match_documents_hybrid', {
        query_text: `${control.control_name}. ${control.description ?? ''}`,
        query_embedding: embeddings[j],
        match_threshold: MATCH_THRESHOLD,
        match_count: MATCH_COUNT,
        filter_framework: null,
        filter_version_id: null,
        filter_categories: null,
      } as never);
      if (error) {
        console.warn(`  ${control.control_code}: retrieval failed — ${error.message}`);
        continue;
      }

      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        provenance.push({
          documentId: Number(row.document_id),
          chunkId: Number(row.id),
          scfControlCode: control.control_code,
          method: 'vector',
          // The RPC's `similarity` column is the RRF combined_score (~0..0.033),
          // NOT a cosine. Normalise before it meets any threshold, or every
          // control lands in `gap`.
          score: normalizeRrf(Number(row.similarity ?? 0)),
          snippet: String(row.content ?? '').slice(0, 300),
          justification: null,
        });
      }
    }
    console.log(`retrieved ${Math.min(i + BATCH, controlList.length)}/${controlList.length}`);
  }
  console.log(`provenance claims: ${provenance.length}`);

  // 4. Bind to evidence, then report.
  const links = buildEvidenceLinks(provenance, docTypes, { productVersionId: null });
  console.log(`evidence links: ${links.length}`);
  console.log(`  policy:      ${links.filter((l) => l.role === 'policy').length}`);
  console.log(`  operational: ${links.filter((l) => l.role === 'operational').length}`);

  const postures = groupPosture(
    controlList.map((c) => c.control_code),
    links,
  );
  const summary = summarise(postures);
  console.log('\nverdict distribution:');
  for (const [state, count] of Object.entries(summary)) {
    console.log(`  ${state.padEnd(11)}${count}`);
  }

  const states = Object.values(summary).filter((n) => n > 0).length;
  console.log(`\ndistinct verdict states present: ${states}`);
  if (states < 2) {
    console.error('FAIL: expected more than one verdict state (spec success criterion 5).');
    console.error('Stopping before any write — nothing was persisted, even with --commit.');
    process.exitCode = 1;
    return;
  }

  if (!COMMIT) {
    console.log('\nreport only — pass --commit to write.');
    return;
  }
  console.log(`\nprovenance written: ${await persistProvenance(db, provenance)}`);
  // Replaces the whole null-version scope, so re-runs are idempotent.
  console.log(`evidence written:   ${await replaceEvidenceForScope(db, null, links)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
