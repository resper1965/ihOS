# Structured SoA Ingestion — design (child A)

**Date:** 2026-09-09
**Status:** approved in conversation; not yet planned or implemented
**Parent:** `2026-09-09-the-dynamic-design.md`
**Sibling, already built:** `2026-09-09-annex-crosswalk-design.md`

Every figure was measured against the live database and the actual spreadsheet
on 2026-09-09.

---

## 1. What this builds

The declared axis of the product's posture: one row per control the Ionic ISMS
declares, carrying whether it applies and the justification for that decision.

The Statement of Applicability already exists, is already uploaded, and is
already the most authoritative artefact the ISMS produces. Nothing reads it. It
was chunked into prose for retrieval — and even that failed silently, so it is
not merely under-used, it is invisible.

Composed with the sibling's Annex A crosswalk, these rows produce posture at SCF
level **with no retrieval at all**: the SoA says a control applies and why, the
crosswalk says which SCF controls it reaches. That composition is child C.

## 2. The source, and what is in it

`compliance_documents` id **392** — *Statement of Applicability ISO27001 e
27701_IONIC Health (2026)*, 92,473 bytes, six sheets:

| sheet | contents | rows | Applicable | Not Applicable |
|---|---|---|---|---|
| Mandatory Requirements - 27001 | management clauses | — | — | — |
| ABR-2021 | — | — | — | — |
| **Controls (Annex A) - 27001** | `A.5.1`…`A.8.34` | **93** | 90 | 3 |
| Mandatory Requirements 27701 | clauses, referencing 27001 controls | — | — | — |
| **Controls (Annex A) - 27701** | `A.7.2.1`…`A.7.5.4` | **31** | 29 | 2 |
| **Controls (Annex B) - 27701** | `B.8.2.1`… | **18** | 8 | 10 |

Every sheet carries the same headers: *Annex, Number, Title, Description,
**Applicability**, **Justification**, Notes*. Applicability and justification are
separate fields, so nothing needs inferring. Measured across all three sheets:
**142 rows, zero missing a justification, zero missing an applicability.**

**The column letters are not stable between SoA documents.** Document 392 has
seven columns and its control code is in column B; document 507 — the 2025
27001-only SoA — has eight, with an extra *ID* column that pushes the code to C.
Same headers, different positions. This was found by writing a reader against
507's letters and watching it return zero rows from 392, which is why §6 binds by
header name and treats a missing header as a failure.

The 93 and the 31 are **exactly** the id sets the sibling imported into
`annex_control_mappings`. Measured both directions: zero SoA controls without a
mapping, zero mappings without an SoA control. 90 applicable controls reach
1,740 SCF links.

## 3. The Annex B gap, stated before anyone is surprised by it

The crosswalk holds no `B.` codes at all. So of the SoA's 127 applicable
controls, **119 reach SCF and 8 do not** — the applicable half of Annex B.

This is not a defect in this work and it is not fixed here. It is a real gap in
coverage that must be *visible*: an applicable control with no path to the spine
is reported as unmapped, never silently omitted from a denominator. Whether to
extend the proprietary crosswalk to Annex B is a later decision with its own
evidence.

## 4. Which SoA counts

**Document 392, named in one constant.** Chosen by the product owner on
2026-09-09 over a marker a person maintains, an automatic newest-year rule, and
one document per standard.

Five documents in the system call themselves a Statement of Applicability, all
`published`, all version 1.0, none marked superseded: the 2026 combined one, a
Portuguese one, a 2025 combined one, a 27001-only one and a 27701-only one. Only
392 covers both standards and all three annexes.

The cost of hardcoding was raised and accepted: a 2027 SoA would not be picked
up. **So the hardcode is made loud rather than silent.** The importer fails, and
says why, when either holds:

- document 392 no longer exists, or its content hash differs from the one
  recorded at the last import — the file changed under the constant;
- another document of type `soa` exists whose `year` is greater than 392's.

Neither condition guesses a replacement. Both refuse to proceed quietly on a
document that may no longer be the truth. Changing the constant stays a human
act, which is the property the owner chose.

## 5. The table

`soa_entries`, keyed `(document_id, annex_code)`.

Per row: `annex_code`, `annex_group` (the sheet's Annex heading), `title`,
`description`, `applicable` (boolean), `justification`, `notes`, `standard`
(`iso27001:2022` | `iso27701:2019`), `annex` (`A` | `B`), `source_sheet`,
`source_row`, `imported_at`.

`document_id` is in the key so a future SoA imports alongside rather than
overwriting: a Statement of Applicability is a dated declaration, and the
previous one is evidence of what was declared then. Nothing is updated in place.

`applicable` is a boolean and `justification` is `NOT NULL`. A control is
declared applicable or not — there is no third state — and a declaration without
a reason is not one. Measured: 142 of 142 justified, so the constraint costs nothing today and
prevents a silent gap later.

`source_sheet` and `source_row` are kept so any row can be traced back to the
cell a person wrote it in. That is what makes an answer defensible to an auditor
rather than merely produced.

## 6. Reading a spreadsheet, not chunking one

The reader parses the workbook's XML directly — a `.xlsx` is a zip of XML, and
the three control sheets share one column layout, so this is a table read, not a
document pipeline.

It does not touch `document_chunks` and does not depend on the retrieval path at
all. That independence is deliberate: it is what lets this land while the
ingestion defect in §7 is still open.

Sheet selection is by name, and a sheet whose header row does not carry both
*Applicability* and *Justification* fails the import loudly rather than being
skipped. A silently skipped sheet is how 18 Annex B controls would disappear.

## 7. The ingestion defect, which is NOT part of this

Measured 2026-09-09: **22 documents record a `total_chunks` greater than zero and
have no chunks at all. All 22 are `.xlsx`. 834 chunks are claimed and absent.**
`document_chunks` holds 4,082 rows overall, so the write path works — it simply
did not run for these.

The pipeline counted, stored the count, and did not store the content. Nothing
surfaces it, because every screen reads the count from the document record rather
than from the chunks.

That is a defect with its own fix and no design work. It is named here because it
is why the SoA was invisible, and because the number it reports — `total_chunks:
161` on document 392 — is a lie that a reader of this spec would otherwise
believe.

## 8. What this design deliberately does not do

- It does not repair the chunk-count defect (§7). Separate, and this work does
  not wait on it.
- It does not compose SoA rows with the crosswalk to produce posture. That is
  child C.
- It does not read the two *Mandatory Requirements* sheets. The vendor's
  crosswalk covers ISO 27001 management clauses — 148 requirement codes, 4.1
  through 10.2 — so those sheets plausibly bridge through the vendor's half the
  way the annex sheets bridge through Ionic's. **Plausibly, not measured.** It is
  named as an opportunity, and any plan acting on it must verify the code
  vocabularies match first.
- It does not extend the crosswalk to Annex B (§3).

## 9. Failure modes

**The SoA changes and nobody re-imports.** The constant points at a document,
not a version; a person can edit the file in place. The content-hash check in §4
turns that into a loud failure at the next import rather than posture quietly
derived from a file that no longer says what it said.

**A sheet's columns move.** The reader binds by header name, not column letter.
A renamed header fails loudly per §6. A *reordered* column is handled, which is
the common case.

**An applicable control with no mapping is read as compliant.** The Annex B eight
make this real from day one. `soa_entries` records applicability only; it makes
no claim about coverage, and any consumer joining it to the crosswalk must treat
a missing mapping as unmapped rather than as an absent requirement. Child C owns
that rule; this spec states it so the rule is not invented later.

## 10. Success criterion

142 rows, one per control across the three annex sheets of document 392, each
carrying its applicability and the justification a person wrote — and 119 of the
127 applicable ones joining to at least one SCF control through the sibling's
crosswalk, with the remaining 8 visible as Annex B gaps rather than absent.
