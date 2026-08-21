// src/scripts/backfill-posture.ts
// One-shot: rebuild provenance and evidence for the existing corpus, then
// print the verdict distribution.
//
// Run with:  npm run backfill:posture
// Add --commit to write; without it the script only reports.

import 'dotenv/config';
import WebSocketImpl from 'ws';

// Node 20 (what .nvmrc pins) has no global WebSocket — it landed in Node 22.
// supabase-js constructs a RealtimeClient inside createClient() even though
// admin.ts passes `realtime: { enabled: false }`, and RealtimeClient's
// constructor throws when it cannot find a WebSocket implementation. So the
// client cannot be built at all, and this script died before doing any work.
// Next's runtime provides WebSocket, which is why the API routes never hit it.
if (!('WebSocket' in globalThis)) {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocketImpl;
}

import { createAdminClient } from '../lib/supabase/admin';
import { generateEmbeddings } from '../lib/chat/embeddings';
import { buildEvidenceLinks, normalizeRrf } from '../lib/posture/bind-evidence';
import { roleForDocType } from '../lib/posture/evidence-role';
import {
  dedupeProvenance,
  persistProvenance,
  replaceEvidenceForScope,
} from '../lib/posture/persistence';
import { groupPosture, summarise } from '../lib/posture/read';
import { indexByControl, rowsToTaggedChunks, tagProvenanceFor } from '../lib/posture/tag-evidence';
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

  // 1. The control set we are reporting on. Paginated: scf_controls holds
  // ~1,468 rows (see supabase/migrations/003_core_tables.sql:143) and
  // PostgREST's default max-rows is 1000, so an unpaginated .select() here
  // silently drops everything alphabetically past the cut — the exact bug
  // this branch exists to stop the platform from committing elsewhere.
  const controlList: ControlRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('scf_controls')
      .select('control_code, control_name, description')
      .order('control_code')
      .range(from, from + 999);
    if (error) throw new Error(`scf_controls: ${error.message}`);
    controlList.push(...((data ?? []) as ControlRow[]));
    if (!data || data.length < 1000) break;
  }
  console.log(`controls: ${controlList.length}`);
  // A floor, not the exact known count: catches a future silent truncation
  // loudly instead of letting it quietly recur.
  const MIN_EXPECTED_CONTROLS = 1400;
  if (controlList.length < MIN_EXPECTED_CONTROLS) {
    throw new Error(
      `scf_controls returned only ${controlList.length} rows; expected at least ` +
        `${MIN_EXPECTED_CONTROLS} (catalogue is documented as ~1,468 — see ` +
        `supabase/migrations/003_core_tables.sql:143). This looks like a silent ` +
        `pagination truncation, not a real catalogue size.`,
    );
  }

  // 2. doc_type per document, so evidence roles can be resolved. Also record
  // category, so the tag read below can apply the same restriction the
  // retrieval RPC gets via filter_categories.
  const docTypes = new Map<number, string | null>();
  // Same restriction the retrieval call applies via filter_categories. The tag
  // read goes straight to document_chunks with no join, so without this a
  // customer's contract (category B2B_GEHC, doc_type CONTRACT, which is a
  // policy role) would become evidence that Ionic implements a control.
  // NULL category is excluded too, matching the RPC's `= ANY(...)` semantics.
  const EVIDENCE_CATEGORIES = new Set(['ISMS_CORE', 'OPERATIONAL']);
  const evidenceEligible = new Set<number>();
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from('compliance_documents')
      .select('id, doc_type, category')
      .range(from, from + 999);
    if (error) throw new Error(`compliance_documents: ${error.message}`);
    for (const d of data ?? []) {
      const id = Number(d.id);
      docTypes.set(id, d.doc_type ?? null);
      if (EVIDENCE_CATEGORIES.has(d.category)) evidenceEligible.add(id);
    }
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  console.log(`documents: ${docTypes.size} (${evidenceEligible.size} evidence-eligible by category)`);

  // Ask the classifier rather than testing for UNCLASSIFIED and null by hand:
  // any doc_type it does not recognise yields no role either, and this corpus
  // is full of them (`pdf`, `xml`, `other`, `contract_sla`, `risk_assessment`).
  // The old check reported 0 while ~15 documents genuinely could serve as no
  // evidence at all — a false reassurance in the one report that exists to be
  // honest about what the corpus can prove.
  const roleless = [...docTypes.entries()].filter(([, t]) => roleForDocType(t) === null);
  const rolelessTypes = [...new Set(roleless.map(([, t]) => t ?? '(null)'))].sort();
  console.log(`documents that can hold no evidence (no role for their doc_type): ${roleless.length}`);
  if (roleless.length > 0) {
    console.log(`  their doc_types: ${rolelessTypes.join(', ')}`);
  }

  // 2b. Every chunk the tagger confirmed as evidencing a control. One paginated
  // read for the whole corpus (~1,541 rows), inverted in memory — 1,468 per-control
  // queries would be the same data at 1,468x the round trips.
  const taggedRows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('document_chunks')
      .select('id, document_id, content, scf_controls')
      .neq('scf_controls', '{}')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`document_chunks (tagged): ${error.message}`);
    taggedRows.push(...((data ?? []) as Array<Record<string, unknown>>));
    if (!data || data.length < 1000) break;
  }
  // The whole increment rests on this read finding rows. If the filter is wrong
  // the run would otherwise continue and report "the tags added nothing", which
  // looks like a finding rather than a bug. This is a floor, not the exact known
  // count (~1,541) — a PostgREST db-max-rows below 1000 would otherwise silently
  // truncate this read after one short page, the same failure mode the
  // scf_controls read above guards against.
  const MIN_EXPECTED_TAGGED_CHUNKS = 1000;
  if (taggedRows.length < MIN_EXPECTED_TAGGED_CHUNKS) {
    throw new Error(
      `document_chunks (tagged) returned only ${taggedRows.length} rows; expected at ` +
        `least ${MIN_EXPECTED_TAGGED_CHUNKS} (corpus is documented as ~1,541 tagged chunks). ` +
        'This looks like a silent pagination truncation, or the filter is wrong, or the ' +
        'tagger has never run. Refusing to continue and report a false negative.',
    );
  }
  const eligibleTagRows = taggedRows.filter((r) => evidenceEligible.has(Number(r.document_id)));
  const tagIndex = indexByControl(rowsToTaggedChunks(eligibleTagRows));
  console.log(
    `tagged chunks: ${taggedRows.length} total, ${eligibleTagRows.length} from ` +
      `evidence-eligible documents, covering ${tagIndex.size} controls`,
  );

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
        // Restricted to our own document categories. `compliance_documents.category`
        // also holds tenant-scoped categories (B2B_GEHC, B2B_DIRECT — see
        // supabase/migrations/003_core_tables.sql:85); with no filter, a customer's
        // signed CONTRACT (a policy doc_type) would be admitted as evidence that
        // *Ionic* implements a control, when it is really a statement about the
        // customer's obligation, not our implementation.
        filter_categories: ['ISMS_CORE', 'OPERATIONAL'],
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

      // Tag-derived provenance for the same control. buildEvidenceLinks dedups on
      // (control, chunk) keeping the higher score, so a chunk found by both paths
      // collapses to one link and the role still comes from the document's doc_type.
      provenance.push(...tagProvenanceFor(tagIndex, control.control_code));
    }
    console.log(`retrieved ${Math.min(i + BATCH, controlList.length)}/${controlList.length}`);
  }
  // Split, not summed: `provenance` now mixes two sources, and printing only
  // the total would hide which one actually grew.
  const retrievalOnly = provenance.filter((p) => p.method === 'vector');
  console.log(
    `provenance claims: ${retrievalOnly.length} vector + ${provenance.length - retrievalOnly.length} llm_confirmed`,
  );

  // 4. Bind to evidence, then report. Build once from retrieval alone and once
  // from both sources, so the tags' contribution is measured rather than asserted.
  const linksBefore = buildEvidenceLinks(retrievalOnly, docTypes, { productVersionId: null });
  const links = buildEvidenceLinks(provenance, docTypes, { productVersionId: null });

  const roleCount = (ls: typeof links, role: 'policy' | 'operational') =>
    ls.filter((l) => l.role === role).length;

  console.log(`\nevidence links: ${linksBefore.length} -> ${links.length}`);
  console.log(
    `  policy:      ${roleCount(linksBefore, 'policy')} -> ${roleCount(links, 'policy')}`,
  );
  console.log(
    `  operational: ${roleCount(linksBefore, 'operational')} -> ${roleCount(links, 'operational')}`,
  );

  const controlCodes = controlList.map((c) => c.control_code);
  const summaryBefore = summarise(groupPosture(controlCodes, linksBefore));
  const postures = groupPosture(controlCodes, links);
  const summary = summarise(postures);

  console.log('\nverdict distribution (full catalogue) — retrieval only -> with tags:');
  for (const state of ['conforming', 'partial', 'informal', 'gap'] as const) {
    console.log(
      `  ${state.padEnd(11)}${String(summaryBefore[state]).padStart(5)} -> ${summary[state]}`,
    );
  }

  // 4b. The direct comparison the spec (§1, §7.5, §8) actually asked for: the
  // platform's current claim is 131 controls, all `conforming`, held in
  // control_evaluation_cache — not a claim about the full ~1,468-control
  // catalogue. A distribution over everything changes the subject; this
  // restricts to exactly the control codes the old cache evaluated, so the
  // "old vs. new" comparison is about the same controls on both sides.
  // The table may be empty (fresh install) or absent (never migrated on this
  // database) — handle both without failing the run.
  let cachedCodes: string[] = [];
  const { data: cachedRows, error: cacheError } = await db
    .from('control_evaluation_cache')
    .select('control_code');
  if (cacheError) {
    console.warn(
      `\ncontrol_evaluation_cache unreadable (${cacheError.message}) — treating as absent; ` +
        'no old-verdict comparison to print.',
    );
  } else {
    const codes: string[] = (cachedRows ?? []).map((r: Record<string, unknown>) =>
      String(r.control_code),
    );
    cachedCodes = [...new Set(codes)];
  }
  console.log(`\ncontrol_evaluation_cache distinct control codes: ${cachedCodes.length}`);
  if (cachedCodes.length > 0) {
    const cachedSummaryBefore = summarise(groupPosture(cachedCodes, linksBefore));
    const cachedSummary = summarise(groupPosture(cachedCodes, links));
    console.log(
      '\nverdict distribution — direct comparison against the old cached verdicts ' +
        '(restricted to exactly the control_evaluation_cache codes) — retrieval only -> with tags:',
    );
    for (const state of ['conforming', 'partial', 'informal', 'gap'] as const) {
      console.log(
        `  ${state.padEnd(11)}${String(cachedSummaryBefore[state]).padStart(5)} -> ${cachedSummary[state]}`,
      );
    }
  } else {
    console.log(
      'control_evaluation_cache has no rows on this database — nothing to compare against.',
    );
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

  // Retrieval and tags can both claim the same (chunk, control) pair, and
  // evidence_provenance is unique on exactly that. Handing both to an
  // ON CONFLICT DO UPDATE upsert fails the whole batch with SQLSTATE 21000
  // ("cannot affect row a second time"), so collapse them first — keeping the
  // higher score, the same rule buildEvidenceLinks uses for evidence links.
  const dedupedProvenance = dedupeProvenance(provenance);
  console.log(
    `provenance rows to write: ${dedupedProvenance.length} (${provenance.length - dedupedProvenance.length} duplicate pairs collapsed)`,
  );

  console.log(`\nprovenance written: ${await persistProvenance(db, dedupedProvenance)}`);
  // Replaces the whole null-version scope, so re-runs are idempotent.
  console.log(`evidence written:   ${await replaceEvidenceForScope(db, null, links)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
