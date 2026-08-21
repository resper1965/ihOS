// tests/unit/posture/evidence-role.test.ts
// doc_type -> evidence role. Deliberately strict: only a record of something
// that happened is operational evidence.

import { describe, it, expect } from 'vitest';
import { roleForDocType } from '@/lib/posture/evidence-role';

describe('roleForDocType — policy side', () => {
  it('classifies stated intent as policy', () => {
    for (const t of ['POLICY', 'PROCEDURE', 'CONTRACT', 'CLOUD_ARCH_ORG', 'SAD', 'SRS_SDS']) {
      expect(roleForDocType(t)).toBe('policy');
    }
  });

  it('accepts legacy lowercase values', () => {
    for (const t of ['policy', 'procedure', 'manual', 'soa', 'matrix']) {
      expect(roleForDocType(t)).toBe('policy');
    }
  });
});

describe('roleForDocType — operational side', () => {
  it('classifies records of events as operational', () => {
    expect(roleForDocType('TEST_REPORT')).toBe('operational');
    expect(roleForDocType('EVIDENCE_RECORD')).toBe('operational');
  });

  it('accepts legacy lowercase values', () => {
    for (const t of ['evidence', 'audit_report', 'internal_audit']) {
      expect(roleForDocType(t)).toBe('operational');
    }
  });
});

describe('roleForDocType — fails closed', () => {
  it('gives UNCLASSIFIED no role', () => {
    expect(roleForDocType('UNCLASSIFIED')).toBeNull();
  });

  it('gives null, undefined and empty no role', () => {
    expect(roleForDocType(null)).toBeNull();
    expect(roleForDocType(undefined)).toBeNull();
    expect(roleForDocType('')).toBeNull();
  });

  it('gives an unrecognised type no role rather than guessing', () => {
    expect(roleForDocType('SOMETHING_NEW')).toBeNull();
  });
});

describe('roleForDocType — a type never holds both roles', () => {
  it('assigns exactly one role per known type', () => {
    const known = [
      'POLICY', 'PROCEDURE', 'CONTRACT', 'CLOUD_ARCH_ORG', 'SAD', 'SRS_SDS',
      'TEST_REPORT', 'EVIDENCE_RECORD',
    ];
    for (const t of known) {
      const role = roleForDocType(t);
      expect(role === 'policy' || role === 'operational').toBe(true);
    }
  });
});
