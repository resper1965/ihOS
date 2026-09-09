# The Annex A Crosswalk — design (child B)

**Date:** 2026-09-09
**Status:** approved in conversation; not yet planned or implemented
**Parent:** `2026-09-09-the-dynamic-design.md`

---

## 1. What this builds

A first-class, versioned, provenance-carrying crosswalk from ISO Annex A
controls to SCF controls, owned by Ionic.

The mapping already exists — 2,689 rows in `scf_framework_mappings` — but as a
bare triple of codes with no edition, no relationship type, no provenance and
nobody's signature. This gives it those, in a table of its own, and retires the
script that can fabricate over it.

## 2. Why it has to be Ionic's own

Measured 2026-09-09: the vendor's `general-iso-27001-2022` holds 148 requirement
codes and every one is a management clause, 4.1 through 10.2. The STRM bundle
carries no `A.x.y` code in any of its 183 focal documents;
`/scf/strm/lookup?fde_code=A.5.1` returns zero.

The vendor does not publish Annex A and there is no other source to import from.
This is not a stopgap awaiting an official version.

That also makes it the valuable half: the vendor's crosswalk is identical for
every customer it has; this one, curated against Ionic's own Statement of
Applicability, is not purchasable.

## 3. The data, exactly

| set | count | disposition |
|---|---|---|
| ISO 27001:2022 Annex A (`A.5.1`…`A.8.34`) | 93 | import, `edition = 'iso27001:2022'` |
| ISO 27701:2019 Annex A (`A.7.2.x`…`A.7.5.x`) | 31 | import, `edition = 'iso27701:2019'` |
| `A.12.4.1` | 1 | **do not import** — the only 2013-edition leftover |

93 + 31 + 1 = 125 distinct ids over 2,689 rows, of which **124 are imported**.
They reach 407 distinct SCF control codes, **all 407 of which exist in the
current catalogue** — the bridge is live, not stale.

The 22 three-level ids filed under `framework_code = 'iso27001'` are ISO 27701
controls under the wrong code. They are re-filed to the 27701 edition on import,
not discarded. An earlier reading of this data called all 23 three-level ids
"stale 2013 residue" and would have deleted 22 live mappings; the shape of an id
is not evidence of its edition, and the import must key on the id itself.

## 4. The table

`annex_control_mappings`, keyed `(edition, annex_code, control_code)`.

Per row: `relationship_type` (nullable), `provenance`, `confidence`,
`decided_by`, `decided_at`, `rationale`, `imported_at`.

**A new table, not an upgrade in place.** Two reasons, both load-bearing. The old
table has nine live consumers still reading its shape, and they are not repointed
by this work. And `scripts/seed-mappings.js` knows how to write to it — a table
the fabrication tool cannot address is safer than one it can.

`edition` is a column rather than an assumption because the data proves there are
two, and conflating them is what produced the misreading in §3.

## 5. Confidence, and what a signature means

Every row imports as `confidence = 'probable'` with
`provenance = 'undocumented_pre_2026-06-05'`. Nothing enters as `exact`.

All 10,074 rows of the old table carry one `synced_at` — 2026-06-05 — from a
single import by something not in the repository. `scripts/seed-mappings.js` is
not that thing: it reads `iso27001` and `iso27701` and clones them into other
frameworks, which is how the 25,589 quarantined rows were made. So these rows
were that fabrication's **source**, not its output — but their own origin is
genuinely unrecorded, and the provenance value says exactly that rather than
implying more.

A row becomes `exact` only when a person signs it, in the same shape as
`framework_identity_curation`: who, when, and why, in a rationale column.

**The signing queue is ordered by what the SoA marks applicable.** A control
Ionic does not claim does not need a reviewed mapping. All 124 are imported —
holding them costs nothing and a control can become applicable later — but review
effort is spent only on what is claimed. This is the product owner's decision of
2026-09-09, and it is why importing everything and filtering the queue is
preferred over importing only the applicable subset: the latter would make this
work depend on child A, inverting the agreed order.

Until child A lands there is no applicable set, so the queue is empty and every
row stays `probable`. That is a correct state, not a blocked one: a projection
over `probable` rows is a projection that says so.

## 6. Relationship type

The old table cannot state how a control relates to a requirement — it holds only
a triple of codes. Every imported row therefore takes `relationship_type = NULL`,
meaning *unrecorded*.

That is the honest value and the curation policy already handles it:
`contributionOf` returns `'unrecorded'` for null, distinct from `intersects`.
Assigning a relationship at import would be inventing one, which is the defect
this whole line of work exists to remove.

A relationship is set when a person signs the row, not before.

## 7. Retiring the fabrication tool

`scripts/seed-mappings.js` is deleted in the same commit as the import.

It reads `iso27001` and `iso27701` and writes clones into other frameworks by
prefixing the requirement id (`LGPD-A.8.24`). It produced the 25,589 rows
quarantined by migration `20260825000002`. One invocation re-creates them and
undoes the quarantine. It has no legitimate use.

Deleting it does not remove it from git history, so a reader can still see how
the fabrication was done — which is worth keeping visible.

## 8. What this design deliberately does not do

- It does not repoint the old table's nine consumers, and it does not drop it.
  That is its own project, and the merged branch's deferred Task 7 belongs to it.
- It does not read the SoA. That is child A. This design only orders its review
  queue by the SoA's output once that exists.
- It does not touch the vendor crosswalk or `scf_control_mappings`.
- It does not attempt to recover the 2026-06-05 provenance. It records that the
  provenance is unknown, which is the true statement.

## 9. Failure modes

**Someone treats `probable` as `exact`.** The whole design rests on that
distinction surviving into every consumer. A projection that counts probable rows
without saying so reproduces the defect. Mitigation: the projection already
stamps a policy version onto every figure; probable rows must be counted in a
separate bucket, the way `needs_review` already is.

**The 22 re-filed ids get re-filed wrongly.** The import keys on the id, and the
id determines the edition — `A.7.x.y` is 27701, `A.n.m` is 27001:2022. Anything
matching neither must fail the import loudly rather than pick a default. That is
how `A.12.4.1` is caught, and it is the same guard the crosswalk sync already
applies to unknown relationship types.

**A future SoA cites a control that has no mapping.** Real and expected — the SoA
may apply a control none of the 124 covers. It must surface as an unmapped
control awaiting a decision, never as a control with no coverage.

## 10. Success criterion

Every Annex A control the SoA marks applicable resolves to at least one SCF
control, through a row that names its edition, its provenance, and — for the ones
a person has reached — who signed it and why.
