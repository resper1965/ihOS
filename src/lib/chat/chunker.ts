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
