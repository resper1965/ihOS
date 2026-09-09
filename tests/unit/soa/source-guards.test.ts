import { describe, it, expect } from 'vitest';
import { checkSoaSource, isMissingRelationError, SOA_DOCUMENT_ID } from '@/lib/soa/source';

describe('the hardcoded SoA document fails loudly rather than going stale', () => {
  it('names document 392', () => {
    // The product owner chose a hardcoded id on 2026-09-09, over a marker a
    // person maintains and an automatic newest-year rule. The cost -- a 2027 SoA
    // going unnoticed -- was raised and accepted, so the guards below make it
    // loud instead of silent.
    expect(SOA_DOCUMENT_ID).toBe(392);
  });

  it('passes when the document is present and nothing newer exists', () => {
    expect(
      checkSoaSource(
        { id: 392, year: 2026, sha256: 'abc' },
        [{ id: 494, year: 2025 }, { id: 507, year: 2025 }],
        'abc',
      ),
    ).toEqual([]);
  });

  it('fails when the file changed under the constant', () => {
    const problems = checkSoaSource(
      { id: 392, year: 2026, sha256: 'abc' },
      [],
      'def',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/hash/i);
  });

  it('fails when a later-year SoA exists, and does not adopt it', () => {
    const problems = checkSoaSource(
      { id: 392, year: 2026, sha256: 'abc' },
      [{ id: 700, year: 2027 }],
      'abc',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/700/);
    expect(problems[0]).toMatch(/2027/);
  });

  it('accepts a first import, when no hash has been recorded yet', () => {
    expect(checkSoaSource({ id: 392, year: 2026, sha256: null }, [], 'abc')).toEqual([]);
  });

  it('reports both problems at once rather than stopping at the first', () => {
    const problems = checkSoaSource(
      { id: 392, year: 2026, sha256: 'abc' },
      [{ id: 700, year: 2027 }],
      'def',
    );
    expect(problems).toHaveLength(2);
  });
});

describe('isMissingRelationError distinguishes "no table yet" from a real failure', () => {
  it('treats a PGRST205 (relation not found) error as first-import, not a failure', () => {
    expect(
      isMissingRelationError({
        code: 'PGRST205',
        message: "Could not find the table 'public.soa_entries' in the schema cache",
      }),
    ).toBe(true);
  });

  it('treats the bare "could not find the table" message as first-import too', () => {
    expect(isMissingRelationError({ message: 'could not find the table public.soa_entries' })).toBe(true);
  });

  it('does not treat an unrelated error as first-import -- it must stop the run', () => {
    expect(isMissingRelationError({ code: '42501', message: 'permission denied for table soa_entries' })).toBe(false);
    expect(isMissingRelationError({ message: 'timeout' })).toBe(false);
  });

  it('does not treat "no error" as a missing relation', () => {
    expect(isMissingRelationError(null)).toBe(false);
  });
});
