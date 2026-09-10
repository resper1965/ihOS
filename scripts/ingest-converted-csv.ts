// Operator script: ingest the CSV sheets converted from the refused spreadsheets.
//
//   npx tsx scripts/ingest-converted-csv.ts --dir <path> --dry-run
//   npx tsx scripts/ingest-converted-csv.ts --dir <path>
//
// WHY THIS EXISTS
//
// On 2026-09-09 ingestion started refusing .xlsx outright, because the old path
// fell through to file.text() and stored the zip as mojibake — 22 documents
// reached the database announcing 834 chunks of text that was never text (see
// docs/sql/2026-09-09e_APPLY_ME_reconcile_chunk_counts.sql). The project chose
// to keep refusing xlsx rather than put xlsx@0.18.5 and its two open advisories
// on the bulk ingestion path (SECURITY.md, "Riscos aceitos").
//
// So the spreadsheets were converted to CSV OUTSIDE the application, one file
// per sheet, and this script ingests those CSVs through the same chunker and
// embedding path every other document uses. The xlsx library is never imported
// here: the exposure recorded in SECURITY.md stays where it was.
//
// WHAT IT ASSUMES
//
// A directory of `<sourceDocId>__<SheetName>.csv` files plus the `manifest.json`
// written by the conversion, which carries the source document's id, title,
// category and storage path. Each CSV becomes its own compliance_documents row:
// a sheet is the unit a person actually reads, and merging four sheets into one
// document would produce chunks whose columns come from different tables.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chunkCsvDocument } from '../src/lib/chat/chunker';
import { generateEmbeddings } from '../src/lib/chat/embeddings';

interface SheetEntry {
  name: string;
  rows: number;
  file?: string;
  bytes?: number;
  skipped?: string;
}

interface ManifestEntry {
  id: number;
  title: string;
  filepath: string;
  category: string | null;
  sheets: SheetEntry[];
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const dir = arg('--dir');
  const dryRun = process.argv.includes('--dry-run');
  if (!dir) {
    console.error('--dir <path> is required (the directory holding the CSVs and manifest.json)');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }
  const db = createClient(url, key);

  const manifest: ManifestEntry[] = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const present = new Set(readdirSync(dir).filter((f) => f.endsWith('.csv')));

  let created = 0;
  let chunksWritten = 0;
  const failures: Array<{ file: string; reason: string }> = [];

  for (const doc of manifest) {
    for (const sheet of doc.sheets) {
      if (!sheet.file) continue;
      if (!present.has(sheet.file)) {
        failures.push({ file: sheet.file, reason: 'listed in manifest, missing on disk' });
        continue;
      }

      const csv = readFileSync(join(dir, sheet.file), 'utf8');
      const chunks = chunkCsvDocument(csv);

      // A sheet that chunks to nothing is a sheet with a header and no rows.
      // Recording it as a document with zero chunks would put back exactly the
      // state the 2026-09-09 reconciliation cleared.
      if (chunks.length === 0) {
        failures.push({ file: sheet.file, reason: 'no chunks (header only?)' });
        continue;
      }

      const title = `${doc.title} — ${sheet.name}`;
      const storagePath = `converted_csv/${sheet.file}`;

      console.log(
        `${dryRun ? '[dry-run] ' : ''}${title.slice(0, 62).padEnd(62)} ${String(chunks.length).padStart(3)} chunks`,
      );
      if (dryRun) continue;

      const { error: upErr } = await db.storage
        .from('compliance_documents')
        .upload(storagePath, Buffer.from(csv, 'utf8'), { contentType: 'text/csv', upsert: true });
      if (upErr) {
        failures.push({ file: sheet.file, reason: `storage: ${upErr.message}` });
        continue;
      }

      const { data: rec, error: insErr } = await db
        .from('compliance_documents')
        .insert({
          filename: sheet.file,
          filepath: storagePath,
          file_format: 'csv',
          file_size_bytes: Buffer.byteLength(csv, 'utf8'),
          category: doc.category,
          title,
          total_chunks: 0,
          language: 'pt',
          // Provenance, so nobody has to guess where this row came from.
          doc_type: 'converted_spreadsheet',
        } as never)
        .select('id')
        .single();
      if (insErr || !rec) {
        failures.push({ file: sheet.file, reason: `insert: ${insErr?.message ?? 'no row'}` });
        continue;
      }
      const documentId = (rec as { id: number }).id;

      let embeddings: number[][];
      try {
        embeddings = await generateEmbeddings(chunks.map((c) => c.content));
      } catch (err) {
        failures.push({
          file: sheet.file,
          reason: `embeddings: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      const { error: chunkErr } = await db.from('document_chunks').insert(
        chunks.map((c, i) => ({
          document_id: documentId,
          content: c.content,
          embedding: JSON.stringify(embeddings[i]),
          section_title: c.metadata.sectionTitle ?? null,
          chunk_index: c.index,
          char_count: c.content.length,
          nist_families: null,
          iso_controls: null,
          content_en: null,
          scf_controls: null,
        })) as never,
      );
      if (chunkErr) {
        failures.push({ file: sheet.file, reason: `chunks: ${chunkErr.message}` });
        continue;
      }

      // total_chunks is written LAST and only after the chunks are in. The old
      // bulk script set it before, which is how 834 announced-but-absent chunks
      // came to exist.
      await db
        .from('compliance_documents')
        .update({ total_chunks: chunks.length } as never)
        .eq('id', documentId);

      created += 1;
      chunksWritten += chunks.length;
    }
  }

  console.log(`\n${dryRun ? 'would create' : 'created'}: ${created} documents, ${chunksWritten} chunks`);
  if (failures.length > 0) {
    console.log(`\nfailures (${failures.length}):`);
    for (const f of failures) console.log(`  ${f.file}: ${f.reason}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
