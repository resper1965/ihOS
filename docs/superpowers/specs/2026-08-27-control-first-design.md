# Control-First Assessment — Design

**Status:** awaiting approval
**Date:** 2026-08-27
**Plan:** `docs/superpowers/plans/2026-08-27-control-first-spine.md`
**Measured API contract:** `docs/standard-api/CONTRACT_AUDIT.md` §H
**Open vendor question:** Q7 in `docs/standard-api/VENDOR_QUESTIONS_2026-08-27.md`

---

## 1. The idea

The control is the unit of work. A framework is a lens over controls, not a
thing to be scored on its own.

This is the inversion the design turns on, and it came from the product owner:
*"quando penso, não penso no standard e sim no controle."* Everything below
follows from taking that literally.

An organisation implements a control once. That control then satisfies — fully,
partially, or not at all — requirements belonging to many frameworks. So the
work is per-control, the evidence is per-control, and a framework figure is
arithmetic performed afterwards over a mapping table.

The current architecture does the opposite. It asks for a framework first, needs
that framework's denominator to exist, and cannot answer at all when a mapping
is missing. That is why five of seven offered frameworks had to be withdrawn
last week and why the product currently produces no number for the two that
remain.

## 2. What is wrong today

Two engines exist and neither produces a defensible figure.

`src/lib/assessment/engine.ts` fetches the real SCF catalogue, evaluates every
control against the organisation's documents by RAG, assembles
`implementedControlIds` — then at line 576 hands that list to
`POST /intelligence/compliance-score` and lets the vendor turn it into a
percentage. That endpoint returns 403. The catch beneath it writes
`score: 0, totalRequired: 0` for every framework. Phase 3 is not gated by mode,
so this happens on every run. The `isScoreBacked` guard added last week now
stops those zeros reaching the dashboard, which is why the product produces
nothing rather than producing a lie. Correct, and useless.

`src/lib/assessment/local-engine.ts` needs no vendor scoring — but starts from
the wrong end. Its control set is `data/iso27001-annex-a.json`: 93
hand-maintained ISO Annex A controls, a local duplicate of a catalogue we do not
own. Because it begins with ISO controls rather than SCF controls it must guess
an SCF code for each one, and where the guess fails it substitutes a hardcoded
default (`local-engine.ts:99`). That fallback is not an isolated defect; it is
what choosing the wrong spine costs.

## 3. What changed the picture

`GET /scf/controls/{controlId}/mappings` returns **200** with the key we already
hold, and gave **65 official mappings** for one control. Four crosswalk
endpoints require only `scf:read`, granted in the first vendor round. The single
crosswalk endpoint that is blocked, `POST /intelligence/cross-coverage`, is the
computed convenience — not the raw data.

The asset was reachable throughout the period we spent describing it as blocked.

Each mapping row carries `relationship_type`, `relationship_strength`,
`mapping_source`, `is_official` and `is_synthetic`. That last field matters
beyond convenience: the 25,589 rows quarantined in migration
`20260825000002` were manufactured by prefixing one framework's control ids into
another's. The vendor's own records state their provenance. Had the product read
this endpoint from the beginning, that fabrication would have had nowhere to
hide.

## 4. The design

```
SCF catalogue  ──►  per-control evidence verdict  ──►  framework projection
(vendor, live)      (RAG over org documents)          (crosswalk × curation policy)
   the spine              the work                       the derived view
```

**The spine.** `scf_controls_cache`, loaded from the vendor's NDJSON export in a
single request. There is exactly one control base and it is the vendor's. The
committed JSON duplicate is deleted, and the SCF-code guess dies with it: when
iteration starts from an SCF control, the control *is* the SCF control and
nothing needs guessing.

**The work.** Unchanged in kind — RAG over the organisation's documents,
producing a verdict per control. This part already functions and is the only
part with no external dependency beyond an embeddings API.

**The derived view.** `scf_control_mappings`, walked once from the vendor and
persisted. A framework figure is then a join: verdicts × mappings, filtered by a
curation policy.

**Persistence is structural, not an optimisation.** The rate limit is 120
requests per 60 seconds and there is no bulk export for mappings, so a full
crosswalk walk is ~1,468 requests — roughly 13 minutes of sustained budget. It
cannot run per assessment. The vendor has offered to raise the limit for a named
window and is building a bulk export; neither changes the conclusion.

## 5. The curation layer, and why it is the product

A mapping of type `intersects` at strength `0.500` does not say whether the
control satisfies the requirement. Deciding that is a GRC judgement.

Counting it automatically would reproduce last week's fabrication with better
manners: a number that looks derived while resting on a rule we invented and
never wrote down. The second instruction from the product owner —
*"mas precisa de curadoria"* — is therefore not a refinement of the load. It is
the part of this system that carries the value, and it is why the policy task
precedes the projection task rather than following it.

The policy is:

- **A pure function.** No I/O, no runtime configuration. A policy an environment
  variable can change is a policy no score can cite.
- **Versioned.** `CURATION_POLICY_VERSION` is stamped onto every figure it
  produces, so any number can be traced to the rule that made it.
- **Owned by a person.** The vendor has confirmed there is *no* official SCF
  guidance designating which relationship types satisfy a requirement for audit
  purposes as opposed to merely relate to it. So this is our judgement, and it
  must be recorded as ours with a named owner rather than presented as derived
  from a standard.

Settled, and vendor-endorsed: `intersects` routes to human review at any
strength; `no_relation` is excluded; anything with `is_official: false` routes to
review. `equal` satisfies.

**Unsettled, and blocking:** whether `subset` or `superset` is the one that
satisfies depends on a direction convention neither party has stated. The vendor
endorsed our `intersects` rule and in the same paragraph described their
ADR-001 as treating `equal` and *subset* as 1.0 with `superset` capped at 0.5 —
the inverse of our first draft. Both readings are coherent; they invert which
types count toward a customer-facing figure. Asked as Q7. **Not guessed.**

## 6. Data model, and one constraint that shaped all of it

Every UUID this API returns for a control, a framework or a mapping row is
minted per SCF version and rotates on a version bump. Vendor-confirmed:
*"the UUID is a row identity, not a control identity."*

So no persisted key is a UUID. Keys are `(scf_version_id, business_code)`;
UUIDs are stored as attributes named `*_uuid` because they are still needed to
address the API within a version.

This constraint has one consequence worth naming on its own.
`framework_identity_curation` — the table holding which vendor framework each of
our local codes means — is the only table here containing human decisions, and
the only one that must never be rebuilt from a transform. The first draft gave
it a foreign key to a rotating UUID. A vendor version bump would have broken
every row and orphaned curation work with no way to tell which decision had been
lost. It keys on `framework_code`, has no foreign key at all, and records the
version the human was looking at when they decided.

Two further honesty columns:

- `strength_is_trustworthy` — false for any `relationship_strength` of exactly
  `0.500` ingested before the vendor's fix ships. Their seeding code was
  `(parseFloat(row.relationship_strength) || 0.5).toFixed(3)`, so an unparseable
  source value became a confident number indistinguishable from a measurement.
  They disclosed this unprompted. The column exists so those rows can be found
  and re-read.
- `vendor_framework_code` is nullable. *"We looked and could not defensibly
  decide"* is a real answer, and it is the answer the fabricated mappings should
  have carried instead of a manufactured id.

## 7. What this design deliberately does not do

- **It does not produce a vendor-comparable score.** `complianceScore` may weight
  requirements in ways we cannot observe. Our figure is *a* score computed by a
  named policy, not *their* score, and must never be labelled as equivalent.
- **It does not resolve ambiguous mappings automatically.** `intersects` and
  unofficial mappings accumulate as review queue, not as coverage. Early figures
  will look low. That is the intended direction of error.
- **It does not make the framework the entry point.** Framework selection
  becomes a view over completed work, not a precondition for doing it.
- **It does not wait for the replacement API key.** The whole path needs only
  `scf:read`. The 12 scope-blocked routes serve other features.

## 8. Failure modes

| Failure | Response |
|---|---|
| Vendor adds a sixth `relationship_type` | Sync fails loudly. A CHECK constraint refuses the value, because the policy has no rule for a type it has never seen. |
| Crosswalk walk dies mid-run | Resumable by `control_code` order; a run that dies at control 900 resumes at 900. |
| SCF version bump | Business-code keys survive. `*_uuid` attributes are re-synced. Curation rows keep their meaning and record which version they were decided against. |
| No mappings for a framework | Projection returns `score: null` with reason `no_requirements_mapped`. The existing `isScoreBacked` guard refuses to persist it. |
| `0.500` strengths already stored | Findable via `strength_is_trustworthy = false`; re-read after the vendor's fix. |

## 9. Open decisions

| Decision | Owner | Status |
|---|---|---|
| Does a partial mapping count as conforming? | product owner | **DECIDED 2026-08-27: no. "Parcial é parcial."** |
| Direction of `subset` / `superset` | vendor (Q7) | open — now only to learn *which* of the two is the partial one |
| Which of 272 vendor frameworks each local code means | product owner, one row each with a rationale | open — first row decided, see below |

### Framework identity decisions

Task 1 seeds `framework_identity_curation` with these. One row per local code,
no derivation.

| our code | vendor `framework_code` | confidence | decided by | rationale |
|---|---|---|---|---|
| `iso27001` | `ISO 27001 2022` | `exact` | resper@ionic.health, 2026-08-27 | Only two candidates matched `27001\|27002` across all 272 vendor frameworks: `ISO 27001 2022` and `ISO 27002 2022`. 27002 is the implementation guidance, not the certifiable standard, so it is not what our `iso27001` means. |

`iso27001` is our internal identifier, used across 17 files as a database key, a
query filter, an assessment default and a UI selector. This row is the single
place it acquires a vendor meaning; nothing else in the codebase needs to change.

The remaining local codes — `iso27701`, `fedramp`, `IEC-62304`, `TX-LEVEL-2`, and
the five quarantined ones — are still open. Each gets its own row, or a row
marked `undecided`, and none gets a derived value.

### The partial rule, as decided

Partial coverage is its own state and never rolls up into conforming. The rule
holds whichever way Q7 resolves:

| Relationship | Contribution |
|---|---|
| full coverage (`equal`, plus whichever of subset/superset Q7 names) | satisfies |
| partial coverage (the other of subset/superset) | **partial — never conforming** |
| `intersects` | human review |
| `no_relation` | excluded |
| any `is_official: false` | human review |

Q7 no longer blocks the *rule*, only the labelling of two of its rows. Task 4 may
therefore be written now against the four settled rows, with the partial/full
assignment of `subset` and `superset` left as the single value Q7 fills in.

Tasks 1–3 of the plan — catalogue load, crosswalk walk, framework identity table
— depend on none of these and can proceed. Tasks 4 and 5 cannot.

## 10. Success criterion

One control, evaluated against real organisational evidence, showing which
framework requirements it satisfies and which it merely touches — with every
number traceable to the policy that produced it and the evidence that backs it.

Not a percentage. A defensible line.
