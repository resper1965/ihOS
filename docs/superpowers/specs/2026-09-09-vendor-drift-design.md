# Vendor drift — detecting the change before it moves a number

**Date:** 2026-09-09
**Status:** approved in conversation
**Scope:** `src/lib/spine/invariants.ts`, `src/lib/spine/baseline.ts` (new), `/api/cron/spine-invariants`

Every figure in this document was measured against the live database on
2026-09-09 with exact counts. Section 9 records the measurements and how they
were taken, because how they were taken turned out to matter.

---

## 1. What this is for

On 2026-09-08 the vendor changed `framework_code` from a human phrase
(`"ISO 27001 2022"`) to a slug (`"general-iso-27001-2022"`). All eight curated
framework identities stopped matching. Nothing threw. A projection summed over
an empty set and returned a zero, and a zero is indistinguishable from a
framework nobody has assessed yet.

**It took eleven days to notice, and only by measuring by hand.**

That break is now covered — see §2. This document is about the class it belongs
to: a vendor change that is silent on arrival and only becomes visible in a
number nobody can audit after the fact.

## 2. What already holds, and is not re-solved here

`checkOfferedFrameworksResolve` asserts that every framework in
`FRAMEWORK_REGISTRY` resolves, through curation, to at least one mapping row in
the current catalogue version. `checkAnnexMappingsResolve` asserts that every
Annex A mapping points at a control the catalogue still has. Both run daily via
`/api/cron/spine-invariants`, which returns 500 with the failures rather than a
reassuring 200.

The 2026-09-08 break cannot recur unnoticed. This design adds to that module; it
does not revisit it.

## 3. Scope, and the two decisions that bound it

**Only what backs a number.** A check earns its place if the thing it watches can
change a figure the product publishes. Vendor defects that touch nothing we
consume — a typo in a `framework_code` we do not offer, a field whose value we
deliberately ignore — are out. §8 lists what that excludes and why.

**Warn; do not hide.** When a check fires, the cron reports and the log records.
No figure is withheld from a screen. This was decided by the product owner on
2026-09-09: a vendor fault should not blank a customer's dashboard. The
consequence is accepted — a number under suspicion stays visible, and the
suspicion lives in the cron and the log rather than in the UI.

## 4. The baseline, and why it lives in the repository

Two of the three things worth watching — a mapping count that moves, a catalogue
that shrinks — need a previous value to compare against. That value lives in a
new file, `src/lib/spine/baseline.ts`, as ordinary constants.

It does **not** live in the database, and it is **not** derived from the previous
catalogue version already stored there. Both alternatives were considered and
rejected:

**Deriving it from the stored previous version does not work, and the reason is
measurable.** Both catalogue versions are retained — 79,133 mapping rows under
`8260df81` and 67,234 under `826a1f05`. But the older rows are keyed in the older
vocabulary: every one of the eight curated slugs counts **zero** against that
version (§9). A check comparing version to version would read "316 today against
0 yesterday" for every framework and fire falsely, forever. Worse than useless —
it would compare the break against the break.

**A table in the database was rejected for a weaker but sufficient reason.** It
would work, but acknowledging a legitimate vendor change would become a UI or
another `APPLY_ME` script, and the acknowledgement would carry no rationale.

**A constant in the repository makes the acknowledgement a commit.** Changing a
number is a claim that the vendor changed, signed by a person, with the reason in
the commit message. That is the same discipline `framework_identity_curation`
already applies to identities via `decided_by` and `rationale`, and the same one
`CURATION_POLICY_VERSION` applies to the scoring rules.

```ts
export const CATALOGUE_BASELINE = {
  scfVersionId: '826a1f05-f065-4feb-9f44-ced8019a6701',
  totalMappings: 67234,
  byFramework: {
    iso27001: 316,  iso27701: 149,  'BR-LGPD': 80,     'EU-GDPR': 241,
    'EU-DORA': 442, soc2: 1478,     'TX-LEVEL-2': 366, nist_800_53: 1117,
  },
} as const;
```

**Keyed by our `local_code`, not by the vendor slug.** The slug is the thing that
drifts. Putting it in the key would reproduce the 2026-09-08 failure inside the
very file written to detect it.

## 5. `checkCurationVersionCurrent`

Compares each `framework_identity_curation.decided_against_version` against the
current `scf_version_id`. Where they differ, one failure per row, naming the
identity, both versions, and the row's `confidence`.

Confidence is in the message because it changes what the reconfirmation costs.
Six rows are `exact`; `iso27701` and `nist_800_53` are `probable`, and a
`probable` identity surviving a catalogue change is a coincidence, not a
confirmation.

On a version bump this fires eight times at once. That is correct and not noise:
eight decisions were made against a catalogue that no longer exists, and eight
people-decisions is exactly what a re-import costs. It is what should have
happened on 2026-09-08.

## 6. `checkMappingCountsStable`

For each entry in `CATALOGUE_BASELINE.byFramework`, resolves the local code to
its curated vendor slug and takes an exact count of `scf_control_mappings` rows
for that slug in the current version. Also counts the version's total. Any
difference from the baseline is a failure naming both numbers.

**No tolerance band.** A threshold would need calibrating, and — more to the
point — a small quiet drift is precisely the class this design exists to catch.
Exact equality needs no tuning and states its intent.

**Exact counts, never a paginated read.**
`select('*', { count: 'exact', head: true })` per framework. This is not a
performance note. While preparing this design, a paginated read without
`.order()` reported `TX-LEVEL-2` at zero mappings; the exact count is 366.
PostgREST gives no stable row order between two `range()` calls, so an unordered
paged read silently skips and repeats rows. The same hazard is already documented
at `invariants.ts:126`. A baseline check that miscounts is worse than no baseline
check, because it manufactures the false alarm it exists to prevent.

## 7. Ordering, and why it is load-bearing

`checkCurationVersionCurrent` runs first. **If it reports a version change, the
count checks are skipped and the skip is stated in the output.**

Counts taken against a catalogue other than the baseline's measure nothing. Left
unordered, a single vendor re-import would emit eight version failures plus nine
count failures, and the nine would be arithmetic noise obscuring the one fact
that matters: the catalogue moved and the identities need reconfirming.

## 8. What this deliberately does not do

**The OSFI typo class.** `amaericas-can-osfi-self-assessment` is misspelled at
source. We do not offer that framework, so no figure of ours depends on it.
Recorded as B5 in `FINDINGS_2026-09-09.md`; it stays a vendor question.

**A whole-catalogue diary.** Snapshotting every field shape and value
distribution each sync would catch more, earlier — and would need a reader.
Rejected under §3.

**`relationship_strength`.** `curation/policy.ts` accepts and deliberately
ignores the field. That decision is not disturbed here. But its written
justification — *"Every value the API serves today is `0.500`"* — is now false:
the 2026-09-09 sample measured `0.500`×37, `1.000`×14, `0.800`×11, `0.300`×1,
`0.000`×1. **The decision may still be right; the reason recorded for it is
not.** No check in this design would catch a stale rationale, and building one
was considered and set aside as a separate problem. It is recorded here so the
next person to read that comment finds this line rather than trusting it.

## 9. Measurements

Taken 2026-09-09 against the live database with `count: 'exact', head: true`.

```
all mapping rows              : 146,367
version 8260df81 (previous)   :  79,133
version 826a1f05 (current)    :  67,234
```

The current version's 67,234 reconciles exactly with the per-relationship totals
published in `FINDINGS_2026-09-09.md` — `intersects` 39,185, `null` 14,819,
`subset` 8,391, `equal` 4,796, `superset` 43. Two independent measurements
agreeing is the reason this figure is usable as a baseline.

| local_code | curated slug | current | previous |
|---|---|---:|---:|
| `iso27001` | `general-iso-27001-2022` | 316 | 0 |
| `iso27701` | `general-iso-27701-2025` | 149 | 0 |
| `BR-LGPD` | `americas-bra-lgpd-2018` | 80 | 0 |
| `EU-GDPR` | `emea-eu-gdpr-2016` | 241 | 0 |
| `EU-DORA` | `emea-eu-dora-2023` | 442 | 0 |
| `soc2` | `general-aicpa-tsc-2017` | 1,478 | 0 |
| `TX-LEVEL-2` | `usa-state-tx-txramp-2-0-level-2` | 366 | 0 |
| `nist_800_53` | `general-nist-800-53-r5-2` | 1,117 | 0 |

The zero column is not a defect. It is the 2026-09-08 break, still visible in our
own data: rows written under the previous version carry the phrase form of
`framework_code`, and no curated slug matches any of them. It is also the whole
argument of §4.

## 10. Testing

The check functions take their client as a parameter, as the two existing ones
do, so a stub satisfies them without a database.

1. **Baseline matches** — no failures.
2. **A count differs** — one failure, naming the expected and the observed value.
3. **Version differs** — one failure per curated row, and the count checks
   reported as skipped rather than run.

Case 3 is the one that would have failed on 2026-09-08.

## 11. What this costs

Every legitimate vendor re-import will fire all of these at once, and someone
will re-measure and commit updated constants. That is recurring manual work, and
it is the point: the alternative is a system that updates its own expectations,
which is a system that cannot tell a vendor change from a vendor break.
