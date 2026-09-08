# One Spine — Design

**Date:** 2026-09-08
**Status:** approved in conversation; not yet planned or implemented
**Depends on:** `2026-08-27-control-first-design.md` (the spine this finishes)

Every figure in this document was measured against the live database and the
live Standard API on 2026-09-08, not read from an earlier document.

---

## 1. The idea

The control-first spine replaced the product's duplicate **control catalogue**.
It did not replace the duplicate **mapping table**. Two of them are still here,
they disagree, and the one that feeds the product's only live integration is the
older and weaker of the two.

This design finishes the job: one mapping table, one bridge from our framework
codes to the vendor's, and nothing left that can quietly answer from the other
one.

## 2. What is wrong today

`scf_framework_mappings` holds **10,074 rows** covering exactly two frameworks —
`iso27001` (5,441) and `iso27701` (4,633) — plus **25,589 rows** already moved to
`scf_framework_mappings_quarantine` on 2026-08-25 for having been fabricated by
prefixing one framework's ids into another's.

Its schema is a bare triple: `(framework_code, target_control_id,
scf_control_code)`. It cannot state **how** a control relates to a requirement,
so everything that reads it counts every row equally. That flattening is the
same defect the STRM re-import removed on the vendor side, reproduced locally.

Its ISO vocabulary is mixed. For `iso27001` it holds 395 distinct requirement
ids in two shapes at once: **116 Annex-A style** (`A.8.26`) and **279
clause-numbered** (`5.x`–`8.x`). 116 exceeds the 93 Annex A controls of ISO
27001:2022, which suggests editions are mixed in one column with nothing
recording which is which.

**Its consumers are fewer than they look:**

| Consumer | Path | Live? |
|---|---|---|
| `src/lib/integrations/defectdojo/scf-resolver.ts` | daily cron `/api/cron/defectdojo-sync` | **yes** |
| `client.ts` local `compliance-score` | `GRC_LOCAL_FALLBACK_ENABLED` | no — off in prod |
| `client.ts` local `cross-coverage` | same flag | no |
| `client.ts` local `roi-path` | same flag | no |

And the live one is half dead already. The resolver asks for `iso27001` and
`nist_800_53`; the NIST rows were quarantined on 2026-08-25, so **every NIST
finding has resolved to nothing for two weeks**. It fails closed, so it invented
no codes — it has simply been filling `unmappedControls` where nobody looked.

Meanwhile `scf_control_mappings`, walked from the vendor's official crosswalk,
carries `scf_version_id`, `relationship_type`, `relationship_strength`,
`is_official`, `is_synthetic` and `mapping_source` on every row.

## 3. The design

**Remove, rather than port, the local fallback.** The three `client.ts`
consumers exist only to produce an estimated figure when the authoritative API
is unreachable. Constitution Principle VIII already says the product reports a
gap instead of estimating, and the README already says to keep the flag unset in
production. Code whose only purpose is to publish a number nobody stands behind
is removed, not migrated. That deletes three of the four consumers without
repointing anything, and takes **three** flags with it —
`GRC_LOCAL_FALLBACK_ENABLED`, `GRC_CRON_FALLBACK_ENABLED` and the hard-off
`GRC_FALLBACK_DISABLED` — plus the `isLocalFallbackEnabled()` gate they feed.

It also retires a stale comment in `assessment-to-scorecard.ts:46-47`, which
still claims the gate "returns true whenever IS_CRON is set". That was true
until commit 4a4d6f8 and is not true now; a cron estimates only when
`GRC_CRON_FALLBACK_ENABLED` says so.

**Repoint the one live consumer.** The resolver's single `.eq('framework_code',
'iso27001')` becomes three things chained: the current catalogue version from
`getCachedScfVersionId()`, the vendor slug obtained through
`framework_identity_curation`, and `requirement_code` in place of
`target_control_id`.

**Association is not scoring.** The resolver answers "which SCF controls does
this vulnerability touch?" — an association. What *counts* toward a figure is
decided in `curation/policy.ts`, and it stays the only place that decides it.

So the resolver gains no new rule. It excludes only `no_relation`, which is an
explicit statement of non-relation, and carries `relationship_type` forward into
`runtime_control_signals`. A vulnerability linked by `equal` and one linked by
`intersects` stay distinguishable on the dashboard instead of being flattened —
which is the defect this whole line of work exists to remove. A `null`
relationship resolves and is marked as unrecorded.

**One bridge, one place.** The curation read is currently inlined in
`projection.ts`. With a second consumer it becomes
`resolveVendorFrameworkCode(localCode)`, used by both.

## 4. What is kept, deliberately

- **`is_estimated`**, in the tables and the six files that read it. It is a
  persisted historical fact: assessments were produced that way, and dropping
  the column would rewrite the past. It stops being *produced*; it keeps being
  read and displayed.
- **`scf_framework_mappings_quarantine`**, all 25,589 rows. It is the forensic
  record of why the spine exists. Evidence is not deleted.

## 5. The blocking dependency

The resolver needs `iso27001` and `nist_800_53` to resolve, and on the spine
both exist only through `framework_identity_curation` — which is broken.

On 2026-09-08 the vendor's `framework_code` changed shape from a human phrase
(`"ISO 27001 2022"`) to a slug (`general-iso-27001-2022`). All eight curated
identities now match **zero** rows. Seven are mechanical re-expressions of a
decision a person already signed; one is a real new decision.

**This design does not start before that curation is restored.** The NIST
decision is not cosmetic here: it determines which baseline the DefectDojo
findings are read against.

| local_code | candidate in the new catalogue | new decision? |
|---|---|---|
| `iso27001` | `general-iso-27001-2022` | no — sole candidate |
| `iso27701` | `general-iso-27701-2025` | no — sole candidate, stays `probable` |
| `BR-LGPD` | `americas-bra-lgpd-2018` | no |
| `EU-GDPR` | `emea-eu-gdpr-2016` | no |
| `EU-DORA` | `emea-eu-dora-2023` | no |
| `soc2` | `general-aicpa-tsc-2017` | no |
| `TX-LEVEL-2` | `usa-state-tx-txramp-2-0-level-2` | no — but the edition moved to TX-RAMP 2.0 |
| `nist_800_53` | R5 base, or High / Moderate / Low / Privacy baseline | **yes** |

## 6. The gate before `DROP TABLE`

The rule is **not** "preserve coverage". The old table is partly fabricated;
losing coverage may be the correct thing happening.

The rule is **explained coverage**:

> Run the resolver against the requirement ids the DefectDojo sync actually
> sends, against both tables, and produce the list of ids that resolved before
> and do not resolve now. Each one must land in one of two boxes: *genuinely
> absent from the official crosswalk*, or *a vocabulary mismatch we must fix*.
> A person reads that list. Only then the `DROP TABLE`.

This is a script whose output a human reads, not an automated test. A test
that asserted a coverage threshold would be asserting that the fabricated
number was right.

## 7. Failure modes

**The Annex A risk, and it can reopen this design.** The old table holds 116
`A.8.26`-shaped ids, while the `requirement_code` values the spine has brought
in so far for `general-iso-27001-2022` are `4.2(a)`, `4.3`, `6.3` — management
clauses, not Annex A. If Annex A lives as a *separate* framework in the vendor
catalogue, then `iso27001` must curate to **two** vendor frameworks, and
`framework_identity_curation` — one row, one slug — is too narrow.

This is only answerable once the crosswalk walk finishes. **The design assumes
it does not need to change. If it does, this document is reopened rather than
improvised around.**

**The curation bridge going stale again.** `framework_code` changed shape once
without warning and broke every identity silently. Nothing detected it; a person
measuring by hand found it 11 days later. The invariant in §8 exists for that.

**A version left unnamed.** `scf_control_mappings` now spans catalogue versions.
`projectFrameworkFromCrosswalk` was reading across all of them until it was
fixed on 2026-09-08; the resolver must not repeat that.

## 8. Testing, and the invariant

- Resolver unit test: version-scoped, curation-mediated, `no_relation` excluded,
  and unmapped still degrades rather than throwing (the existing test).
- A reader guard in the shape of `tests/unit/spine/no-duplicate-catalogue.test.ts`,
  asserting that no source file reads `scf_framework_mappings`.
- **An invariant the cron runs**, because the silent break in §7 must not repeat:
  every framework offered in `FRAMEWORK_REGISTRY` resolves, through curation, to
  at least one mapping row in the current version. Zero rows for an offered
  framework fails loudly.

## 9. What this design deliberately does not do

- It does not add a bulk crosswalk sync over `/scf/strm`. That is a speed
  problem (~4 hours per walk) and it is blocked on vendor findings B1 and B7.
- It does not re-curate against `framework_id` (UUID) instead of
  `framework_code`. That depends on the vendor's answer about slug stability
  (finding B9) and is a separate decision.
- It does not touch the question→control path, the questionnaire flow, or the
  framework gap screen. Those are projects B, C and D.

## 10. Success criterion

One mapping table. A DefectDojo finding on a NIST control resolves to SCF
controls again, through a curated identity, carrying the relationship type that
links them — and no code path anywhere can answer that question from a second
table.

## 11. Order of work

1. Restore the eight curated identities (seven mechanical, one NIST decision).
2. Extract `resolveVendorFrameworkCode`, used by `projection.ts` and the resolver.
3. Repoint the resolver, with tests.
4. Measure the gate of §6 and publish the list of lost ids.
5. **A person reads that list and decides.**
6. Remove the local fallback and its two flags.
7. Migration dropping `scf_framework_mappings`.
8. Add the invariant of §8 to the cron.
