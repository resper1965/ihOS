// src/lib/chat/chunker.ts
// Recursive text chunking service for document ingestion.
// Splits text at semantic boundaries (paragraphs → lines → sentences → words)
// with configurable size and overlap.

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChunkOptions {
  /** Target chunk size in characters (default: 2000 ≈ 500 tokens) */
  chunkSize?: number;
  /** Number of overlapping characters between consecutive chunks (default: 600 ≈ 150 tokens) */
  overlap?: number;
  /** Separator hierarchy, tried from largest to smallest boundary */
  separators?: string[];
}

export interface ChunkMetadata {
  /** Character offset where this chunk starts in the original text */
  startChar: number;
  /** Character offset where this chunk ends (exclusive) in the original text */
  endChar: number;
  /** Detected section title (markdown heading or numbered list item), if any */
  sectionTitle?: string;
}

export interface DocumentChunk {
  /** The text content of this chunk */
  content: string;
  /** Zero-based index of this chunk in the sequence */
  index: number;
  /** Positional and contextual metadata */
  metadata: ChunkMetadata;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CHUNK_SIZE = 2000;
const DEFAULT_OVERLAP = 600;
const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' '];

// ── Compliance-specific constants ────────────────────────────────────────────
// Smaller chunks and compliance-aware separators for higher precision when
// matching against SCF controls. One chunk ≈ one clause/control statement.

const COMPLIANCE_CHUNK_SIZE = 1200;
const COMPLIANCE_OVERLAP = 400;
const COMPLIANCE_SEPARATORS = ['\n\n', '\n', '. ', ' '];

/**
 * Regex to detect section headers:
 * - Markdown headings: `# Title`, `## Sub-title`, etc.
 * - Numbered lists:    `1. First item`, `2.1 Sub-item`, etc.
 */
const SECTION_HEADER_RE = /^(?:#{1,6}\s+.+|(?:\d+\.)+\s+.+)$/m;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the last section header found in a text fragment.
 * Returns undefined if no header is detected.
 */
function detectSectionTitle(text: string): string | undefined {
  const lines = text.split('\n');
  let lastHeader: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (SECTION_HEADER_RE.test(trimmed)) {
      // Strip leading `#` symbols for cleaner titles
      lastHeader = trimmed.replace(/^#+\s+/, '');
    }
  }

  return lastHeader;
}

/**
 * Split text by the first usable separator in the hierarchy.
 * Falls back to character-level splitting when no separator works.
 */
function splitBySeparator(text: string, separators: string[]): string[] {
  for (const sep of separators) {
    const parts = text.split(sep);
    if (parts.length > 1) {
      // Re-attach separators (except whitespace-only) so chunks read naturally
      return parts.reduce<string[]>((acc, part, idx) => {
        if (idx === 0) {
          acc.push(part);
        } else {
          // Append separator to previous part for sentence/paragraph continuity
          acc.push(sep + part);
        }
        return acc;
      }, []);
    }
  }

  // Absolute fallback: return the whole text as a single segment
  return [text];
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Chunk a document into overlapping segments suitable for embedding.
 *
 * - Empty or very short texts (≤ chunkSize) return a single chunk.
 * - Splits are attempted at the largest semantic boundary first.
 * - Each chunk carries metadata with char offsets and section titles.
 */
export function chunkDocument(
  text: string,
  options: ChunkOptions = {},
): DocumentChunk[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlap = DEFAULT_OVERLAP,
    separators = DEFAULT_SEPARATORS,
  } = options;

  // Edge case: empty or whitespace-only text
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  // Edge case: text fits in a single chunk
  if (trimmed.length <= chunkSize) {
    return [
      {
        content: trimmed,
        index: 0,
        metadata: {
          startChar: 0,
          endChar: trimmed.length,
          sectionTitle: detectSectionTitle(trimmed),
        },
      },
    ];
  }

  // Split text into segments by the best separator
  const segments = splitBySeparator(trimmed, separators);

  const chunks: DocumentChunk[] = [];
  let currentContent = '';
  let currentStartChar = 0;
  let charOffset = 0;

  for (const segment of segments) {
    // If adding this segment exceeds the chunk size, finalize current chunk
    if (currentContent.length > 0 && currentContent.length + segment.length > chunkSize) {
      const chunkText = currentContent.trim();
      if (chunkText.length > 0) {
        chunks.push({
          content: chunkText,
          index: chunks.length,
          metadata: {
            startChar: currentStartChar,
            endChar: currentStartChar + currentContent.length,
            sectionTitle: detectSectionTitle(chunkText),
          },
        });
      }

      // Start next chunk with overlap from the end of the current one
      if (overlap > 0 && currentContent.length > overlap) {
        const overlapText = currentContent.slice(-overlap);
        currentContent = overlapText + segment;
        currentStartChar = charOffset - overlapText.length;
      } else {
        currentContent = segment;
        currentStartChar = charOffset;
      }
    } else {
      if (currentContent.length === 0) {
        currentStartChar = charOffset;
      }
      currentContent += segment;
    }

    charOffset += segment.length;
  }

  // Flush remaining content
  const remaining = currentContent.trim();
  if (remaining.length > 0) {
    chunks.push({
      content: remaining,
      index: chunks.length,
      metadata: {
        startChar: currentStartChar,
        endChar: currentStartChar + currentContent.length,
        sectionTitle: detectSectionTitle(remaining),
      },
    });
  }

  return chunks;
}

// ── Compliance-Specific Chunker ──────────────────────────────────────────────

/**
 * Extended regex for compliance documents — detects:
 * - Markdown headings
 * - Numbered clauses (4.1, 5.2.3)
 * - ISO Annex references (A.5.1, A.12.3)
 * - NIST function prefixes (PR., DE., RS.)
 * - Policy/Procedure/Control headers
 */
const COMPLIANCE_HEADER_RE =
  /^(?:#{1,6}\s+.+|(?:\d+\.)+\s+.+|A\.\d+(?:\.\d+)*\s+.+|(?:PR|DE|RS|ID|RC)\.\w+.+|(?:Policy|Procedure|Control|Objective|Requirement):\s*.+)$/m;

function detectComplianceSectionTitle(text: string): string | undefined {
  const lines = text.split('\n');
  let lastHeader: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (COMPLIANCE_HEADER_RE.test(trimmed)) {
      lastHeader = trimmed.replace(/^#+\s+/, '');
    }
  }

  return lastHeader;
}

/**
 * Chunk a compliance document (ISMS, PIMS, SAD, SRS, policies) with
 * smaller chunks (~1200 chars) and compliance-aware section detection.
 * Produces higher-precision chunks for SCF control matching.
 */
export function chunkComplianceDocument(
  text: string,
  options: ChunkOptions = {},
): DocumentChunk[] {
  const {
    chunkSize = COMPLIANCE_CHUNK_SIZE,
    overlap = COMPLIANCE_OVERLAP,
    separators = COMPLIANCE_SEPARATORS,
  } = options;

  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  if (trimmed.length <= chunkSize) {
    return [
      {
        content: trimmed,
        index: 0,
        metadata: {
          startChar: 0,
          endChar: trimmed.length,
          sectionTitle: detectComplianceSectionTitle(trimmed),
        },
      },
    ];
  }

  const segments = splitBySeparator(trimmed, separators);
  const chunks: DocumentChunk[] = [];
  let currentContent = '';
  let currentStartChar = 0;
  let charOffset = 0;

  for (const segment of segments) {
    if (currentContent.length > 0 && currentContent.length + segment.length > chunkSize) {
      const chunkText = currentContent.trim();
      if (chunkText.length > 0) {
        chunks.push({
          content: chunkText,
          index: chunks.length,
          metadata: {
            startChar: currentStartChar,
            endChar: currentStartChar + currentContent.length,
            sectionTitle: detectComplianceSectionTitle(chunkText),
          },
        });
      }

      if (overlap > 0 && currentContent.length > overlap) {
        const overlapText = currentContent.slice(-overlap);
        currentContent = overlapText + segment;
        currentStartChar = charOffset - overlapText.length;
      } else {
        currentContent = segment;
        currentStartChar = charOffset;
      }
    } else {
      if (currentContent.length === 0) {
        currentStartChar = charOffset;
      }
      currentContent += segment;
    }

    charOffset += segment.length;
  }

  const remaining = currentContent.trim();
  if (remaining.length > 0) {
    chunks.push({
      content: remaining,
      index: chunks.length,
      metadata: {
        startChar: currentStartChar,
        endChar: currentStartChar + currentContent.length,
        sectionTitle: detectComplianceSectionTitle(remaining),
      },
    });
  }

  return chunks;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Chunk a CSV so every chunk carries the column names.
 *
 * A spreadsheet flattened to CSV chunks badly under the generic path: the
 * header line lands in chunk 0 and every chunk after it is bare values.
 * `A.5.1,Politicas de seguranca,Aplicavel,...` retrieved on its own does not
 * say which column is which, and on a RACI matrix or an Annex A table the
 * column names are exactly the part that answers the question — who is
 * responsible, whether the control is applicable, what the justification was.
 *
 * So the header is repeated at the top of each chunk. It costs a line per
 * chunk and it is the difference between a retrievable row and a tuple.
 *
 * Introduced 2026-09-10, when 22 spreadsheets were converted to CSV and
 * ingested after xlsx was refused outright (see SECURITY.md and
 * docs/sql/2026-09-09e_APPLY_ME_reconcile_chunk_counts.sql).
 */
export function chunkCsvDocument(
  text: string,
  options: ChunkOptions = {},
): DocumentChunk[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const newline = trimmed.indexOf('\n');
  // A header with no rows under it is not a document — it is a column list.
  if (newline === -1) return [];

  const header = trimmed.slice(0, newline).trimEnd();
  const body = trimmed.slice(newline + 1).trim();
  if (body.length === 0) return [];

  // The body is chunked on its own, then each chunk is prefixed. Reserving the
  // header's width keeps a prefixed chunk from exceeding the size the caller
  // asked for, which is what the embedding model is sized against.
  const { chunkSize = COMPLIANCE_CHUNK_SIZE, ...rest } = options;
  const prefix = header + '\n';
  const bodyChunkSize = Math.max(chunkSize - prefix.length, Math.floor(chunkSize / 2));

  const bodyChunks = chunkComplianceDocument(body, { ...rest, chunkSize: bodyChunkSize });

  return bodyChunks.map((c, i) => ({
    content: prefix + c.content,
    index: i,
    metadata: {
      // Offsets stay relative to the original text, so they still point at the
      // row the chunk came from rather than at the prefixed copy.
      startChar: c.metadata.startChar + newline + 1,
      endChar: c.metadata.endChar + newline + 1,
      sectionTitle: header,
    },
  }));
}

/**
 * Pick the chunker the format deserves.
 *
 * One place decides, because the three ingestion paths — upload, reindex and
 * the bulk script — must not drift apart on it. A document chunked one way on
 * upload and another way on reindex would silently change what retrieval
 * returns for it, with nothing in the product reporting the difference.
 */
export function chunkByFormat(
  text: string,
  fileType: string | null | undefined,
  options: ChunkOptions = {},
): DocumentChunk[] {
  return fileType === 'csv'
    ? chunkCsvDocument(text, options)
    : chunkComplianceDocument(text, options);
}
