// tests/unit/lib/scf-resolver.test.ts
// Unit tests for the DefectDojo → SCF resolver
// (src/lib/integrations/defectdojo/scf-resolver.ts)

import { describe, it, expect, vi } from 'vitest';
import {
  resolveScfMappings,
  scfControlsForFinding,
} from '@/lib/integrations/defectdojo/scf-resolver';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Chainable admin mock whose final `.in()` resolves per framework_code. */
function mockAdminWithMappings(
  rowsByFramework: Record<string, Array<{ target_control_id: string; scf_control_code: string | null }>>,
) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_col: string, framework: string) => ({
          in: vi.fn(async () => ({ data: rowsByFramework[framework] ?? [], error: null })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe('resolveScfMappings', () => {
  it('resolves ISO and NIST controls to SCF codes from scf_framework_mappings', async () => {
    const admin = mockAdminWithMappings({
      iso27001: [
        { target_control_id: 'A.8.26', scf_control_code: 'TDA-02' },
        { target_control_id: 'A.8.26', scf_control_code: 'TDA-06' },
      ],
      nist_800_53: [
        { target_control_id: 'SI-10', scf_control_code: 'TDA-02' },
      ],
    });

    const result = await resolveScfMappings(admin, ['A.8.26'], ['SI-10']);

    expect(result.byTargetControl.get('A.8.26')).toEqual(['TDA-02', 'TDA-06']);
    expect(result.byTargetControl.get('SI-10')).toEqual(['TDA-02']);
    expect(result.unmappedControls).toEqual([]);
  });

  it('fails closed: unmapped controls are reported, never guessed', async () => {
    const admin = mockAdminWithMappings({
      iso27001: [{ target_control_id: 'A.8.26', scf_control_code: 'TDA-02' }],
    });

    const result = await resolveScfMappings(admin, ['A.8.26', 'A.5.17'], ['IA-5']);

    expect(result.byTargetControl.has('A.5.17')).toBe(false);
    expect(result.byTargetControl.has('IA-5')).toBe(false);
    expect(result.unmappedControls.sort()).toEqual(['A.5.17', 'IA-5']);
  });

  it('skips NULL scf_control_code rows and empty inputs', async () => {
    const admin = mockAdminWithMappings({
      iso27001: [{ target_control_id: 'A.8.26', scf_control_code: null }],
    });

    const result = await resolveScfMappings(admin, ['A.8.26'], []);
    expect(result.byTargetControl.size).toBe(0);
    expect(result.unmappedControls).toEqual(['A.8.26']);

    const empty = await resolveScfMappings(admin, [], []);
    expect(empty.byTargetControl.size).toBe(0);
    expect(empty.unmappedControls).toEqual([]);
  });

  it('degrades to unmapped (not a throw) when the mapping query errors', async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ data: null, error: { message: 'relation missing' } })),
          })),
        })),
      })),
    } as unknown as SupabaseClient;

    const result = await resolveScfMappings(admin, ['A.8.26'], []);
    expect(result.byTargetControl.size).toBe(0);
    expect(result.unmappedControls).toEqual(['A.8.26']);
  });
});

describe('scfControlsForFinding', () => {
  it('unions and deduplicates SCF codes across the finding\'s ISO and NIST controls', () => {
    const resolution = {
      byTargetControl: new Map([
        ['A.8.26', ['TDA-02', 'TDA-06']],
        ['SI-10', ['TDA-02']],
        ['IA-2', ['IAC-01']],
      ]),
      unmappedControls: [],
    };

    const codes = scfControlsForFinding(resolution, ['A.8.26'], ['SI-10', 'IA-2']);
    expect(codes).toEqual(['IAC-01', 'TDA-02', 'TDA-06']);
  });

  it('returns empty for a fully unmapped finding', () => {
    const resolution = { byTargetControl: new Map<string, string[]>(), unmappedControls: ['A.5.17'] };
    expect(scfControlsForFinding(resolution, ['A.5.17'], [])).toEqual([]);
  });
});
