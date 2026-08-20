// tests/unit/posture/route-contract.test.ts
// Query parsing for the posture route. Kept pure so it is testable without
// Next's request plumbing.

import { describe, it, expect } from 'vitest';
import { parsePostureQuery } from '@/lib/posture/query';

describe('parsePostureQuery', () => {
  it('splits a comma-separated control list', () => {
    const q = parsePostureQuery(new URL('https://x.test/api/posture?controls=GOV-01,GOV-02'));
    expect(q.controlCodes).toEqual(['GOV-01', 'GOV-02']);
  });

  it('trims whitespace and drops empty entries', () => {
    const q = parsePostureQuery(new URL('https://x.test/api/posture?controls=GOV-01, ,GOV-02,'));
    expect(q.controlCodes).toEqual(['GOV-01', 'GOV-02']);
  });

  it('returns an empty list when the parameter is absent', () => {
    const q = parsePostureQuery(new URL('https://x.test/api/posture'));
    expect(q.controlCodes).toEqual([]);
  });

  it('reads the version id when present', () => {
    const q = parsePostureQuery(
      new URL('https://x.test/api/posture?versionId=11111111-1111-1111-1111-111111111111'),
    );
    expect(q.versionId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('reports a null version id when absent', () => {
    expect(parsePostureQuery(new URL('https://x.test/api/posture')).versionId).toBeNull();
  });

  it('deduplicates repeated control codes', () => {
    const q = parsePostureQuery(new URL('https://x.test/api/posture?controls=GOV-01,GOV-01'));
    expect(q.controlCodes).toEqual(['GOV-01']);
  });
});
