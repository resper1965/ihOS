// tests/unit/lib/scf-resolver.test.ts
// Unit tests for the DefectDojo → SCF resolver
// (src/lib/integrations/defectdojo/scf-resolver.ts)

import { describe, it, expect, vi } from 'vitest';
import {
  resolveScfMappings,
  scfControlsForFinding,
} from '@/lib/integrations/defectdojo/scf-resolver';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Admin mock for the spine shape: framework_identity_curation resolves a local
 * code to a slug, then scf_control_mappings is read version-scoped,
 * framework-scoped and requirement-scoped.
 */
function mockAdminOnSpine(
  slugByLocal: Record<string, string | null>,
  rowsBySlug: Record<string, Array<{
    requirement_code: string;
    control_code: string | null;
    relationship_type: string | null;
  }>>,
  // Every (column, value) pair passed to .eq() on the scf_control_mappings
  // branch, in call order. Lets a test assert the version filter is actually
  // applied, by which column, and with which value -- not just that
  // framework_code narrowed the result.
  eqCalls: Array<[string, string]> = [],
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'framework_identity_curation') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_c: string, local: string) => ({
              maybeSingle: vi.fn(async () => ({
                data: { vendor_framework_code: slugByLocal[local] ?? null, confidence: 'exact' },
                error: null,
              })),
            })),
          })),
        };
      }
      // scf_control_mappings
      return {
        select: vi.fn(() => ({
          eq: vi.fn((c1: string, v1: string) => {
            eqCalls.push([c1, v1]);
            return {
              eq: vi.fn((c2: string, slug: string) => {
                eqCalls.push([c2, slug]);
                return {
                  in: vi.fn(async () => ({ data: rowsBySlug[slug] ?? [], error: null })),
                };
              }),
            };
          }),
        })),
      };
    }),
  } as unknown as SupabaseClient;
}

describe('resolveScfMappings on the spine', () => {
  const SLUGS = {
    iso27001: 'general-iso-27001-2022',
    nist_800_53: 'general-nist-800-53-r5-2',
  };

  it('resolves through the curated identity, carrying the relationship type', async () => {
    const eqCalls: Array<[string, string]> = [];
    const admin = mockAdminOnSpine(SLUGS, {
      'general-iso-27001-2022': [
        { requirement_code: 'A.8.26', control_code: 'TDA-02', relationship_type: 'equal' },
        { requirement_code: 'A.8.26', control_code: 'TDA-06', relationship_type: 'intersects' },
      ],
      'general-nist-800-53-r5-2': [
        { requirement_code: 'SI-10', control_code: 'TDA-02', relationship_type: 'subset' },
      ],
    }, eqCalls);

    const result = await resolveScfMappings(admin, ['A.8.26'], ['SI-10'], { scfVersionId: 'v1' });

    expect(result.byTargetControl.get('A.8.26')).toEqual([
      { scfControlCode: 'TDA-02', relationshipType: 'equal' },
      { scfControlCode: 'TDA-06', relationshipType: 'intersects' },
    ]);
    expect(result.byTargetControl.get('SI-10')).toEqual([
      { scfControlCode: 'TDA-02', relationshipType: 'subset' },
    ]);
    expect(result.unmappedControls).toEqual([]);

    // The version filter is the top global constraint of this plan: every
    // read of scf_control_mappings must name an scf_version_id. Assert the
    // actual column names, not just that *some* filter narrowed the rows.
    expect(eqCalls).toContainEqual(['scf_version_id', 'v1']);
    expect(eqCalls).toContainEqual(['framework_code', 'general-iso-27001-2022']);
  });

  it('applies the version filter on every framework resolved, not just one', async () => {
    // A filter wired onto only one of the two per-framework queries would
    // still pass the test above, since that one only checks iso27001's call.
    const eqCalls: Array<[string, string]> = [];
    const admin = mockAdminOnSpine(SLUGS, {
      'general-iso-27001-2022': [
        { requirement_code: 'A.8.26', control_code: 'TDA-02', relationship_type: 'equal' },
      ],
      'general-nist-800-53-r5-2': [
        { requirement_code: 'SI-10', control_code: 'TDA-02', relationship_type: 'subset' },
      ],
    }, eqCalls);

    await resolveScfMappings(admin, ['A.8.26'], ['SI-10'], { scfVersionId: 'v1' });

    const versionCalls = eqCalls.filter(([col, val]) => col === 'scf_version_id' && val === 'v1');
    expect(versionCalls).toHaveLength(2);
  });

  it('drops no_relation, which is a statement that they do NOT relate', async () => {
    const admin = mockAdminOnSpine(SLUGS, {
      'general-iso-27001-2022': [
        { requirement_code: 'A.8.26', control_code: 'TDA-02', relationship_type: 'no_relation' },
      ],
    });

    const result = await resolveScfMappings(admin, ['A.8.26'], [], { scfVersionId: 'v1' });

    expect(result.byTargetControl.has('A.8.26')).toBe(false);
    expect(result.unmappedControls).toEqual(['A.8.26']);
  });

  it('keeps a null relationship, marked as unrecorded rather than dropped', async () => {
    // The vendor records no relationship for 22% of the bundle. That is an
    // honest absence, and it is NOT the same as no_relation.
    const admin = mockAdminOnSpine(SLUGS, {
      'general-iso-27001-2022': [
        { requirement_code: 'A.8.26', control_code: 'TDA-02', relationship_type: null },
      ],
    });

    const result = await resolveScfMappings(admin, ['A.8.26'], [], { scfVersionId: 'v1' });

    expect(result.byTargetControl.get('A.8.26')).toEqual([
      { scfControlCode: 'TDA-02', relationshipType: null },
    ]);
  });

  it('degrades to unmapped when a framework has no curated identity', async () => {
    // Not a throw: one framework without an identity must not stop the other
    // framework's findings from resolving.
    const admin = mockAdminOnSpine({ iso27001: SLUGS.iso27001, nist_800_53: null }, {
      'general-iso-27001-2022': [
        { requirement_code: 'A.8.26', control_code: 'TDA-02', relationship_type: 'equal' },
      ],
    });

    const result = await resolveScfMappings(admin, ['A.8.26'], ['SI-10'], { scfVersionId: 'v1' });

    expect(result.byTargetControl.has('A.8.26')).toBe(true);
    expect(result.unmappedControls).toEqual(['SI-10']);
  });
});

describe('scfControlsForFinding', () => {
  it('dedupes by control, keeping the strongest relationship', () => {
    const resolution = {
      byTargetControl: new Map([
        ['A.8.26', [{ scfControlCode: 'TDA-02', relationshipType: 'intersects' as const }]],
        ['SI-10', [{ scfControlCode: 'TDA-02', relationshipType: 'equal' as const }]],
      ]),
      unmappedControls: [],
    };

    expect(scfControlsForFinding(resolution, ['A.8.26'], ['SI-10'])).toEqual([
      { scfControlCode: 'TDA-02', relationshipType: 'equal' },
    ]);
  });
});
