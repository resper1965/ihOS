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

  if (configured.sha256 !== null && configured.sha256 !== currentSha256) {
    problems.push(
      `document ${configured.id} changed under the constant: recorded hash ` +
        `${configured.sha256}, file now hashes to ${currentSha256}. Re-import ` +
        `deliberately, or restore the file.`,
    );
  }

  const configuredYear = configured.year ?? 0;
  for (const other of otherSoaDocuments) {
    if ((other.year ?? 0) > configuredYear) {
      problems.push(
        `document ${other.id} is a SoA for year ${other.year}, later than the ` +
          `configured document ${configured.id} (${configured.year}). It is NOT ` +
          `adopted automatically — a person decides which SoA counts.`,
      );
    }
  }

  return problems;
}
