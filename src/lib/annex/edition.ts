// Which standard an Annex A id belongs to, decided from the id alone.
//
// Two vocabularies live in the legacy crosswalk and they overlap in shape:
//
//   A.7.5    ISO 27001:2022 Annex A, physical controls
//   A.7.5.3  ISO 27701:2019 Annex A, PII controller controls
//
// They differ by one segment, which is why this is a function with tests rather
// than a regex written inline at the call site. An earlier reading of this data
// classified by counting segments and concluded that all 23 three-segment ids
// under `iso27001` were stale 2013 residue. Listing them showed 22 were ISO
// 27701 controls filed under the wrong framework code and exactly one --
// A.12.4.1 -- was a 2013 leftover. That reading would have deleted 22 live
// mappings.
//
// Returning null is a real answer and the caller must treat it as one: an id
// this function does not recognise is excluded and reported, never given a
// default edition.

export type AnnexEdition = 'iso27001:2022' | 'iso27701:2019';

/** ISO 27701:2019 Annex A — exactly three segments, all under A.7. */
const ISO_27701_ANNEX = /^A\.7\.\d+\.\d+$/;

/** ISO 27001:2022 Annex A — exactly two segments, themes A.5 through A.8. */
const ISO_27001_2022_ANNEX = /^A\.[5-8]\.\d+$/;

export function editionOf(annexCode: string): AnnexEdition | null {
  if (ISO_27701_ANNEX.test(annexCode)) return 'iso27701:2019';
  if (ISO_27001_2022_ANNEX.test(annexCode)) return 'iso27001:2022';
  return null;
}
