// Which Statement of Applicability counts, and how that stops being true.
//
// The product owner chose a hardcoded document id on 2026-09-09, over a marker a
// person maintains and an automatic newest-year rule. Five documents in the
// system call themselves a SoA, all published, all version 1.0, none marked
// superseded; only 392 covers both standards and all three annexes.
//
// The cost was raised and accepted: a 2027 SoA would not be picked up. So the
// hardcode is made loud. Neither guard adopts a replacement -- changing the
// constant stays a human act, which is the property the owner chose.

export const SOA_DOCUMENT_ID = 392;

export interface SoaSourceRow {
  id: number;
  year: number | null;
  doc_type: string | null;
  /** Hash recorded at the last import; null before the first one. */
  sha256: string | null;
}

export interface OtherSoaRow {
  id: number;
  year: number | null;
}

/**
 * Returns every reason the configured source can no longer be trusted.
 * Empty means proceed. All problems are returned, not just the first — an
 * operator fixing one at a time learns about the next one a run later.
 */
export function checkSoaSource(
  configured: SoaSourceRow,
  otherSoaDocuments: OtherSoaRow[],
  currentSha256: string,
): string[] {
  const problems: string[] = [];

  if (configured.doc_type !== 'soa') {
    problems.push(
      `document ${configured.id} has doc_type ${JSON.stringify(configured.doc_type)}, ` +
        `not 'soa'. The configured SoA source must itself be classified as a SoA.`,
    );
  }

  if (configured.sha256 !== null && configured.sha256 !== currentSha256) {
    problems.push(
      `document ${configured.id} changed under the constant: recorded hash ` +
        `${configured.sha256}, file now hashes to ${currentSha256}. Re-import ` +
        `deliberately, or restore the file.`,
    );
  }

  if (configured.year === null) {
    problems.push(
      `document ${configured.id} (the configured SoA) has no year recorded. It ` +
        `cannot be compared against other SoA documents, so this guard cannot do its job.`,
    );
  }

  for (const other of otherSoaDocuments) {
    if (other.year === null) {
      problems.push(
        `document ${other.id} is a SoA with no year recorded. It cannot be ` +
          `compared against the configured document ${configured.id} — a later SoA ` +
          `uploaded with an unset year would otherwise go unnoticed indefinitely.`,
      );
      continue;
    }
    if (configured.year !== null && other.year > configured.year) {
      problems.push(
        `document ${other.id} is a SoA for year ${other.year}, later than the ` +
          `configured document ${configured.id} (${configured.year}). It is NOT ` +
          `adopted automatically — a person decides which SoA counts.`,
      );
    }
  }

  return problems;
}

/**
 * True when a Postgres/PostgREST error means "this relation doesn't exist" --
 * the normal shape of the very first import, before a person has applied the
 * soa_entries migration. Anything else (RLS denial, a renamed column, a
 * timeout, a dropped connection) is a real failure and must stop the run: a
 * hash guard that reads an unrelated error as "no hash recorded" would let a
 * changed file overwrite a prior import silently, which is worse than no
 * guard at all.
 *
 * PGRST205 is PostgREST's code for "table not found in the schema cache".
 * The message match is a fallback for whichever client shape doesn't surface
 * `code` (some paths only carry the text).
 */
export function isMissingRelationError(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205') return true;
  return /could not find the table/i.test(error.message);
}
