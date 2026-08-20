// src/lib/posture/types.ts
// Shared types for the posture module. No logic lives here.

/** Which side of the dual-phase test a piece of evidence can serve. */
export type EvidenceRole = 'policy' | 'operational';

/** The four states a control can be in. Only `conforming` is compliant. */
export type Verdict = 'conforming' | 'partial' | 'informal' | 'gap';

/** A chunk accepted as evidence for one control, in exactly one role. */
export interface EvidenceLink {
  scfControlCode: string;
  productVersionId: string | null;
  chunkId: number;
  documentId: number;
  role: EvidenceRole;
  /** Normalised relevance, 0..1. */
  score: number;
  snippet: string;
}

/** A recorded claim that a chunk is about a control, and how we know. */
export interface ProvenanceRow {
  documentId: number;
  chunkId: number;
  scfControlCode: string;
  method: 'vector' | 'llm_confirmed';
  /** Normalised relevance, 0..1. */
  score: number;
  snippet: string;
  justification: string | null;
}
