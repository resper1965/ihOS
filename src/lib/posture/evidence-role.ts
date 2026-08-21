// src/lib/posture/evidence-role.ts
// A document's type decides which side of the dual-phase test it can serve.
// Because the mapping is a function, one chunk can never count as both a
// policy and an operational record for the same control.
//
// Strictness is the point: design and architecture documents state intent, so
// they are policy. Only a record of something that HAPPENED is operational.

import type { EvidenceRole } from './types';

export const POLICY_DOC_TYPES: readonly string[] = [
  // Current semantic taxonomy (migration 20260705000001)
  'POLICY',
  'PROCEDURE',
  'CONTRACT',
  'CLOUD_ARCH_ORG',
  'SAD',
  'SRS_SDS',
  // Legacy values still present in this database
  'MANUAL',
  'SOA',
  'MATRIX',
];

export const OPERATIONAL_DOC_TYPES: readonly string[] = [
  'TEST_REPORT',
  'EVIDENCE_RECORD',
  // Legacy values still present in this database
  'EVIDENCE',
  'AUDIT_REPORT',
  'INTERNAL_AUDIT',
];

/**
 * Returns the role this document type may serve, or null when it may serve
 * none. UNCLASSIFIED and unrecognised types return null — we do not guess.
 */
export function roleForDocType(docType: string | null | undefined): EvidenceRole | null {
  if (!docType) return null;
  const normalised = docType.trim().toUpperCase();
  if (POLICY_DOC_TYPES.includes(normalised)) return 'policy';
  if (OPERATIONAL_DOC_TYPES.includes(normalised)) return 'operational';
  return null;
}
