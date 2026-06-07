// src/lib/chat/questionnaire-types.ts
// Shared types for the questionnaire upload, answer generation & HITL review pipeline

// ── Parsing ──────────────────────────────────────────────────────────────────

export type SupportedFileType = 'xlsx' | 'csv' | 'pdf';

/** A single question extracted from an uploaded questionnaire */
export interface ExtractedQuestion {
  /** Unique ID within the batch (e.g. "q-0", "q-1") */
  questionId: string;
  /** The raw question text */
  text: string;
  /** Optional surrounding context from the spreadsheet (e.g. category header) */
  context?: string;
  /** For xlsx: cell reference like "B5" so we can write back the answer */
  cellCoords?: string;
  /** For xlsx: which sheet the question came from */
  sheetName?: string;
  /** Row index in original spreadsheet (0-based) */
  rowIndex?: number;
}

/** Result of parsing a questionnaire file */
export interface ParseResult {
  questions: ExtractedQuestion[];
  fileType: SupportedFileType;
  fileName: string;
  /** Total number of sheets (xlsx only) */
  sheetCount?: number;
  /** Column headers detected */
  detectedHeaders?: string[];
  /** Index of the column where answers should be written back */
  answerColumnIndex?: number;
  /** Name of the answer column header */
  answerColumnHeader?: string;
}

// ── Answer Generation ────────────────────────────────────────────────────────

export interface RAGReference {
  /** Chunk ID from document_chunks */
  chunkId: number;
  /** Document title */
  documentTitle: string;
  /** Section title */
  sectionTitle?: string;
  /** Similarity score 0–1 */
  similarity: number;
  /** Excerpt of matched content */
  excerpt: string;
}

/** A generated answer for a single question */
export interface GeneratedAnswer {
  questionId: string;
  /** The original question text */
  questionText: string;
  /** AI-generated compliance answer */
  generatedAnswer: string;
  /** Confidence 0–100 */
  confidenceScore: number;
  /** RAG sources used */
  references: RAGReference[];
}

// ── HITL Review ──────────────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'approved' | 'edited' | 'rejected';

/** A Q&A pair in the review table (client-side state) */
export interface ReviewableQA {
  questionId: string;
  questionText: string;
  /** AI-generated answer (original) */
  aiDraftAnswer: string;
  /** User-edited answer (defaults to aiDraftAnswer) */
  finalAnswer: string;
  confidenceScore: number;
  references: RAGReference[];
  status: ReviewStatus;
  /** Cell coords for xlsx write-back */
  cellCoords?: string;
  sheetName?: string;
  rowIndex?: number;
}

// ── Promotion to Knowledge Base ──────────────────────────────────────────────

export interface PromotionPayload {
  /** Q&A pairs approved by the user */
  items: Array<{
    questionId: string;
    questionText: string;
    finalAnswer: string;
    aiDraftAnswer: string;
    /** True if the user edited the AI draft */
    wasEdited: boolean;
  }>;
  /** Conversation context for learning corrections */
  conversationId?: string;
}

export interface PromotionResult {
  /** Number of chunks inserted into document_chunks */
  chunksInserted: number;
  /** Number of learning corrections written */
  correctionsWritten: number;
}

// ── Download ─────────────────────────────────────────────────────────────────

export interface DownloadPayload {
  /** Original file as base64 */
  originalFileBase64: string;
  /** File name */
  fileName: string;
  /** Answered Q&A pairs with cell coordinates */
  answers: Array<{
    cellCoords?: string;
    sheetName?: string;
    rowIndex?: number;
    answerColumnIndex?: number;
    answer: string;
  }>;
}
