// Reading the Ionic-owned Annex A crosswalk.
//
// This is the half of the interlingua the vendor does not sell. Child C
// composes it with the Statement of Applicability to produce posture at SCF
// level without any retrieval.

import type { AnnexEdition } from '@/lib/annex/edition';

export interface AnnexLink {
  controlCode: string;
  edition: AnnexEdition;
  /** probable = imported, unsigned. exact = a person decided. */
  confidence: 'exact' | 'probable' | 'rejected';
  /** NULL means unrecorded, which is every imported row. */
  relationshipType: string | null;
}

export interface AnnexReader {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export async function scfControlsForAnnex(
  annexCode: string,
  client: AnnexReader,
): Promise<AnnexLink[]> {
  const { data, error } = await client
    .from('annex_control_mappings')
    .select('control_code, edition, confidence, relationship_type')
    .eq('annex_code', annexCode);

  if (error) throw new Error(`annex_control_mappings: ${error.message}`);

  return (data ?? [])
    .filter((r) => r.confidence !== 'rejected')
    .map((r) => ({
      controlCode: String(r.control_code),
      edition: r.edition as AnnexEdition,
      confidence: r.confidence as AnnexLink['confidence'],
      relationshipType: r.relationship_type === null ? null : String(r.relationship_type),
    }));
}
