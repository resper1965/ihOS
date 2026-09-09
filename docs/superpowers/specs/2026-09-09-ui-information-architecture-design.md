# The interface no longer names what the product does

**Date:** 2026-09-09
**Status:** approved in conversation (revised — coverage brought into scope)
**Scope:** the dashboard navigation, a new `/posture` page, a new coverage endpoint, the repointing of `/compliance`, one honesty fix, two route deletions
**Audience decided:** the internal Ionic team. `client_user` is a reduced slice of this same menu, not a separate product.

Every claim about the current state below was read from the code on 2026-09-09,
not remembered.

---

## 1. The complaint, stated precisely

The visual design is not the problem. The palette (`--color-primary: #3DC2C2`,
`--color-brand-gray: #58595b`), the Lato face, the frosted-glass surfaces and the
light/dark pair are kept exactly as they are. Nothing here changes a colour or a
font.

What drifted is what the interface *names*, and what it chooses to show. The
architecture became control-first — `2026-09-09-the-dynamic-design.md` opens with
"SCF is the interlingua" and states the product in one sentence: take the controls
in the nCommand ISMS, express them as SCF controls, answer assessments and
comparisons from those. The navigation still describes a product organised by
standard: ten flat items, no grouping, and the word "control" in none of them.

## 2. What the measurement found

**Live capability with no door.** `/api/posture` was substantively fixed on
2026-08-20 and serves posture grouped by control, with evidence links, a summary,
and role-aware scoping. It reaches the interface only as one widget on Overview.
The observed axis has no page.

**The front door leads with a number the project withdrew.** `/compliance` —
second in the menu, titled "Compliance Intelligence", subtitled `Real-time posture
across N frameworks` — draws from five sources. Traced individually, they do not
share a provenance, and the difference decides what this document changes:

| source | reads from | verdict |
|---|---|---|
| `getFrameworkScores` | `intelligence_snapshots`, via Redis | **withdrawn generation** |
| `getTopGaps` | `evidence_evaluations` | real |
| `getEvaluationSummary` | `evidence_evaluations` | real |
| `getDomainBreakdown` | `evidence_evaluations` | real |
| `getRoiPath` | live vendor call, `standardApi.roiPath()` | see below |

Only `getFrameworkScores` carries the scorecard generation withdrawn as unbacked
in `docs/sql/2026-08-26_withdraw_fabricated_scorecards.sql` — and the Redis cache
in front of it means the withdrawal may never have reached the screen. It is also
the one that supplies the framework count in the page's own subtitle.

`getRoiPath` is a different fault. It calls the vendor with
`target_frameworks: ["ISO 27701", "HIPAA", "ISO 27001"]` — hardcoded names in the
phrase format the vendor abandoned on 2026-09-08 (finding B9 in
`docs/standard-api/FINDINGS_2026-09-09.md`). "HIPAA" is additionally the one label
this project quarantined for matching three distinct vendor frameworks. That
widget is very likely rendering nothing, silently, and has been since the vendor's
re-import.

**And the replacement is invisible.** `projectFrameworkFromCrosswalk` reads the
real crosswalk under a versioned, owned policy and refuses to invent a zero — it
throws rather than return one when a framework has no curated identity. It runs
only inside an assessment. Nothing exposes it over HTTP.

**The sharpest statement of the drift:** the front door shows the repudiated
numbers and hides the defensible ones.

**A card that conflates two quantities.** `src/app/api/dashboard/stats/route.ts:79`:
with no scorecard snapshot, the "Compliance Score" card falls back to
`evaluationSummary.avgConfidence` — a confidence average under a compliance
label. This is the class of thing the backend spent a month removing.

**Three labels that misdirect.** `Evidence Map` → `/compliance/mappings` shows no
evidence; it is control-to-requirement mapping. `Audits & Checks` is called
assessments by the database, the API and every other document. `Standards & Norms`
is called frameworks everywhere else.

**Two dormant routes.** `/api/compliance/roi` and `/api/compliance/gaps` have no
interface consumer and no logic commit since before 2026-06-29 — their last change
was a mechanical logger sweep. Their underlying data is not the problem; being
unreachable, unmaintained HTTP surface is.

## 3. The organising principle

The menu groups by **the question the user arrives holding**, taken from the
consumer table in the Dynamic spec. Nobody comes to work thinking "I want to look
at a control". They come thinking "a hospital asked us this".

Putting Controls at the top and hanging everything off it was considered and
rejected: more faithful to the architecture, and matching nobody's task.

The grouping also draws a line the product needs and does not currently have.
**COVER answers "how much of this framework do we even map".** **ANSWER answers
"and how much of it do we meet".** Those are different questions with different
inputs — the first needs only the crosswalk, the second needs evidence verdicts —
and today they are tangled into a single percentage.

## 4. The navigation

```
Overview                                    /

ANSWER            "a customer asked us X"
  Assessments                               /assessments
  Partner Requirements                      /compliance/scrms
  Chat                                      /chat

COVER             "what do we already cover"
  Frameworks                                /compliance
  Control Crosswalk                         /compliance/mappings

OBSERVE           "what do our vulnerabilities say"
  Posture                                   /posture            (new)
  Risk Analysis                             /threat-modeling

──────
  Documents                                 /documents
  Goals & Tasks                             /goals
  Reports                                   /reports
```

Three renames, each carrying meaning: `Audits & Checks` → `Assessments`,
`Standards & Norms` → `Frameworks`, `Evidence Map` → `Control Crosswalk`. No route
path changes, so every bookmark and deep link keeps working.

The last three take a divider rather than a heading — the utility drawer, not a
question anyone arrives with. Group headings are not focusable. The existing
active-route logic at `layout.tsx:132-141`, which already resolves the longest
matching prefix so `/compliance/scrms` does not light up `/compliance`, is kept
unchanged.

## 5. Coverage: the endpoint and the page

### 5.1 Why this is small

`FrameworkProjection` already returns exactly what a coverage page needs:

```
requirementsTotal          how many requirements the framework has
requirementsUnrecorded     how many the vendor's crosswalk never recorded
requirementsUnevaluated    how many carry no evidence verdict
requirementsSatisfied / Partial / NeedingReview / Gap
policyVersion / policyOwner
```

The `evaluations` parameter is a list of per-control verdicts. **Called with an
empty list, the projection still answers the whole coverage question** — total,
unrecorded, and everything else landing in `requirementsUnevaluated`. `score`
comes back `null` with reason `nothing_assessable`, which is the correct answer
and not a failure. The policy stamp comes along for free.

So this exposes an engine that exists; it does not design one.

### 5.2 `GET /api/compliance/coverage`

Loops `FRAMEWORK_REGISTRY`, calls `projectFrameworkFromCrosswalk(localCode, [],
{ scfVersionId })` for each, and returns one row per framework plus the version
and policy stamp it was computed under.

**The version is passed explicitly**, from `getCachedScfVersionId()`. The
projection refuses to run without one on purpose: `scf_control_mappings` spans two
catalogue versions, and an unversioned read would mix the fabricated crosswalk
into its own correction.

**Uncurated frameworks become information, not a crash.** `fedramp` and
`IEC-62304` are offered without a curated identity — `KNOWN_UNCURATED` in
`src/lib/spine/invariants.ts` lists them, and the projection throws for exactly
this case. The endpoint catches per framework and returns a row saying no identity
has been decided. That is the honest answer: nobody has decided yet, and it is
different from covering nothing.

### 5.3 The page

`/compliance` — labelled **Frameworks** — replaces its `getFrameworkScores()` call
with this endpoint. One row per framework: how many requirements, how many the
crosswalk maps, how many the vendor left unrecorded, how many await a decision.
The policy version and owner are shown on the page, because a number that cannot
cite its rule is the thing this project keeps removing. The subtitle's framework
count comes from the same source, so it stops being a count of snapshots.

**The page's other widgets stay.** Top gaps, the evaluation summary and the domain
breakdown all read `evidence_evaluations` directly — that is real data about real
evidence, and removing it would be destroying working functionality on a
misreading. An earlier draft of this document proposed removing them on the belief
that the whole page was snapshot-derived. Tracing each source individually
disproved it; only `getFrameworkScores` was.

**The ROI widget is the exception, and it is hidden rather than fixed.** Its
hardcoded phrase-format framework names have not resolved on the vendor's side
since 2026-09-08 (§2). Repairing it means deciding which curated frameworks to ask
about and reading them from `framework_identity_curation` rather than a literal —
a small piece of work, but it is a vendor-integration fix, not information
architecture. Until someone does it, the widget renders empty and pretends to be a
feature. It comes off the page with a one-line comment naming this section, and
`getRoiPath` stays untouched for its other caller (§7).

**Not in scope:** feeding real evaluations into the coverage page. Which
assessment counts, and what to do when a framework has three, is a product
decision — and it is precisely the ANSWER/COVER boundary §3 just drew.
Conformance stays in Assessments, where the evidence lives.

## 6. The other new page, and the honesty fix

**`/posture`** — a thin page over `/api/posture`, which already returns what a
page needs. The page renders what the endpoint gives and computes nothing. The
Overview keeps its widget: the page is where the axis lives, the widget is the
glance.

**The stats card.** `src/app/api/dashboard/stats/route.ts:79` stops falling back
to `avgConfidence`. With no scorecard, the card shows `—`. The fallback is
deleted, not made conditional. A dash is honest.

The `/compliance` subtitle fix from the earlier draft is gone: there is no point
teaching a page to confess it shows stale data when it can show good data for the
same effort.

**Minor, while the file is open:** the `/compliance` title uses
`text-emerald-400`, a green outside the token palette. Bring it onto
`--color-primary`.

## 7. What is deleted

`src/app/api/compliance/roi/route.ts` and `src/app/api/compliance/gaps/route.ts`
— **the two HTTP routes only.**

They go because nothing reaches them and nothing has maintained them, not because
their data is bad — `getTopGaps` reads `evidence_evaluations` and is sound. An
unreachable route that nobody has touched in over two months is surface that
invites being wired back up without anyone re-examining it.

**Their helpers stay.** `getTopGaps` and `getRoiPath` in
`src/lib/data/compliance-data.ts` have live callers:
`src/app/api/compliance/report/route.ts:183-184` and
`src/lib/context/posture-profile.ts:47`. Deleting them would break report
generation and the posture profile. `getTopGaps` also keeps its caller on the
Frameworks page (§5.3); only `getRoiPath` loses that one.

**One thing follows from this and is left for later.** `getRoiPath`'s broken
vendor call also runs inside report generation, where no reader will notice it
returning nothing. Hiding the widget does not fix the report. That is named here
so it is a known open item rather than a surprise.

`/api/compliance/evaluations` is **not** deleted. It has no interface consumer
either, but it was not audited here, and removing unaudited code is how a working
thing disappears.

## 8. Testing

**Navigation** is a data structure, tested as one in a new
`tests/unit/dashboard/navigation.test.ts`:

1. Every `href` in `NAV_ITEMS` resolves to a route that exists under
   `src/app/(dashboard)/`. This is the test that catches a rename breaking a link.
2. No group is empty; every item belongs to exactly one group.
3. Active-route resolution still picks the longest matching prefix —
   `/compliance/scrms` marks Partner Requirements active and leaves Frameworks
   inactive.

**Coverage endpoint**, in a new `tests/api/compliance-coverage.test.ts`, against a
stubbed client:

4. A curated framework returns its requirement totals with `score: null` and
   reason `nothing_assessable` when called with no evaluations — the honest empty
   answer, not a zero.
5. An uncurated framework returns a row saying no identity is decided, and does
   not throw or take the other frameworks down with it.
6. The endpoint passes an explicit `scfVersionId`. A test asserting the projection
   is never called without one guards the mixing of catalogue versions, which is
   the failure the projection's own guard exists to prevent.

**The stats card**: one test asserting the API returns `—` and not a number when
no scorecard snapshot exists and `avgConfidence` is non-zero. It fails against
today's code and passes after the fix, which is what makes it worth writing.

`/posture` gets no new API test — `tests/api/posture.test.ts` already covers the
endpoint.

## 9. What this does not touch

The palette, the fonts, the glass treatment, the light/dark pair, the sidebar's
collapse behaviour, and every route path. This is a change of names, grouping, and
which numbers the product is willing to show — not a redesign.
