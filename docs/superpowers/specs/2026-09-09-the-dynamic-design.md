# The Dynamic — umbrella design

**Date:** 2026-09-09
**Status:** approved in conversation; decomposes into child specs, of which only B is written
**Supersedes the framing of:** `2026-09-08-one-spine-design.md`, whose central premise was measured wrong (see §6)

Every figure here was measured against the live database and the live Standard
API on 2026-09-08 and 2026-09-09.

---

## 1. The dynamic, as the product owner states it

> We take the controls that exist in the file — the nCommand ISMS — and turn
> them into SCF controls. We use those to answer assessments, and to compare
> standards.

That is the whole product in one sentence, and it is correct. This document
exists because the system cannot currently perform it, and because the reasons
were only discovered on 2026-09-09.

**SCF is the interlingua.** Ionic's own controls are expressed once as SCF
controls. From then on every framework — TX-RAMP, DORA, whatever a hospital
asks for next — arrives through a crosswalk rather than through new work. That
is the economics of the whole design, and it is why the spine is control-first.

Three consumers hang off the same spine:

| consumer | question it answers |
|---|---|
| customer assessments | "a hospital asks X — what do we say, and what backs it?" |
| standards comparison | "a new market wants framework Y — what do we already cover, what is missing?" |
| observed posture | "what do our live vulnerabilities say about these same controls?" |

Three axes over one spine: **declared** (the SoA says this control applies, and
here is the justification), **practised** (evidence documents), **observed**
(DefectDojo). The product already models the second and third. The first — the
one the sentence above starts with — is missing.

## 2. Why it cannot run today

Three blockers, measured:

**The SoA never enters the system.** Ingestion fails on spreadsheets: 22 of 41
xlsx files produced zero chunks, against 0 of 42 policies. All four Statement of
Applicability documents are among the failures. They are registered in
`compliance_documents` and are invisible to every assessment the product has
ever run.

**The vendor's crosswalk has no Annex A.** `general-iso-27001-2022` holds 148
requirement codes and every one of them is a management clause — 4.1 through
10.2. Annex A is absent, and it is absent from the STRM bundle too
(`/scf/strm/lookup?fde_code=A.5.1` returns zero, and no focal document carries
`A.x.y` codes). The vendor does not have it and is not going to.

**The only Annex A → SCF bridge is in the table the previous design was going to
delete.** `scf_framework_mappings` holds 2,689 Annex A rows over 125 distinct
ids, reaching 407 SCF controls, and 100% of those SCF codes exist in the current
catalogue. It is live, not stale.

## 3. What the ids actually are

| framework_code | Annex A ids | 2-level (`A.8.24`) | 3-level (`A.7.3.5`) |
|---|---|---|---|
| `iso27001` | 116 | **93** | 23 |
| `iso27701` | 124 | 93 | 31 |
| union | **125** | 93 | 32 |

93 is exactly the control count of ISO 27001:2022 Annex A, and it matches in
both frameworks. The two id sets overlap by 115, so `iso27701` is not a separate
vocabulary — it is the same Annex A plus its own extension.

**The 3-level ids are ISO 27701:2019 Annex A**, not the ISO 27001:2013 residue
this was first read as. Every one of them is `A.7.2.x` through `A.7.5.x` — the
PII-controller controls — with exactly one exception:

- `A.12.4.1` is the only genuine 2013-edition leftover in either set.
- The other 22 three-level ids filed under `iso27001` are **ISO 27701 controls
  filed under the wrong framework code**, not obsolete ones.

So the disposal rule is not "discard 23 stale ids". It is: discard one, re-file
twenty-two. Writing it the first way would have thrown away 22 live mappings on
a misreading — recorded here because the misreading survived two passes and was
only caught by listing the ids instead of counting their shape.

## 4. The provenance question, answered as far as it can be

All 10,074 rows of the old table share one `synced_at` date: 2026-06-05. One
import, by something that is not in the repository.

`scripts/seed-mappings.js` **is** in the repository, and it is the fabrication
tool: it reads `iso27001` and `iso27701` and clones them into other frameworks
by prefixing the requirement id (`LGPD-A.8.24`). Those clones are the 25,589
rows quarantined on 2026-08-25.

Two consequences. First, `iso27001` and `iso27701` were the **source** of that
fabrication, not its output — which corroborates the quarantine's decision to
spare them. Second, the script still runs, and one invocation re-creates the
fabricated rows and undoes the quarantine. It has no legitimate use and is
deleted as part of child spec B.

The origin of the 93 genuine mappings remains unrecorded, and no authoritative
source exists to check them against. They are Ionic's own asset by default
rather than by intent.

## 5. Decomposition

Five children. Only B is designed; the rest are named so the shape is visible.

**A — Structured SoA ingestion.** Read the spreadsheet as rows — Annex A id,
applicability, justification, implementing reference — instead of chunking it
into prose. Produces Ionic's control register. Blocked today by the spreadsheet
ingestion defect, which is a bug and can be fixed independently at any time.

**B — The proprietary Annex A crosswalk.** Raise the bridge to a first-class
asset: its own table, edition, provenance, relationship type, and a human
signature queue. Designed in `2026-09-09-annex-crosswalk-design.md`.

**C — Posture composition.** SoA rows × bridge → posture at SCF level, with no
retrieval involved. Produces "for each SCF control, what Ionic's ISMS declares".
Needs A and B.

**D — Projection to any framework.** Exists already (`projection.ts` over the
vendor crosswalk), but fed by C rather than by RAG verdicts. This is where
"compare standards" lives.

**E — Answering assessments.** Question → SCF control → posture from C → cited
answer. This is where "answer assessments" lives.

**Order: B → A → C, then D and E.** B first because it is the asset at risk —
it lives in a table an approved plan was going to drop, with no provenance and
no version — and because it is the smallest of the three.

## 6. What this corrects in the previous design

`2026-09-08-one-spine-design.md` argued that the product had two mapping tables
that disagreed, and that one should be deleted. Both halves were wrong:

- It counted **four** consumers of the old table. There are nine, including the
  assessment engine (`engine.ts:230`, which filters which controls an assessment
  evaluates) and the dashboard (`compliance-data.ts:137`).
- It read the two tables as duplicates. They do not overlap: the vendor's
  crosswalk covers management clauses across 250 frameworks; the old table
  covers Annex A, which the vendor does not have. They are two halves of the
  interlingua, not two answers to the same question.

Its §7 named the Annex A risk and said to stop and reopen rather than improvise
around it. That is what happened.

The branch merged on 2026-09-09 remains sound — it deletes nothing, and its
`DROP TABLE` task was never executed. The one-spine name is retired: the shape
is **one spine, two crosswalks** — one licensed from the vendor, one owned by
Ionic.

## 7. Why the Ionic-owned half is the valuable half

The vendor's crosswalk is the same for every customer it has. The Annex A → SCF
mapping, curated against Ionic's own Statement of Applicability, is not
something a competitor can buy. It was treated for a day as legacy debt awaiting
deletion. It is the proprietary part.
