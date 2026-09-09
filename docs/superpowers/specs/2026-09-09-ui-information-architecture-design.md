# The interface no longer names what the product does

**Date:** 2026-09-09
**Status:** approved in conversation
**Scope:** `src/app/(dashboard)/layout.tsx`, a new `/posture` page, two honesty fixes, two route deletions
**Audience decided:** the internal Ionic team. `client_user` is a reduced slice of this same menu, not a separate product.

Every claim about the current state below was read from the code on 2026-09-09,
not remembered.

---

## 1. The complaint, stated precisely

The visual design is not the problem. The palette (`--color-primary: #3DC2C2`,
`--color-brand-gray: #58595b`), the Lato face, the frosted-glass surfaces and the
light/dark pair are all kept exactly as they are. Nothing in this document
changes a colour or a font.

What drifted is what the interface *names*. The product's architecture became
control-first — `docs/superpowers/specs/2026-09-09-the-dynamic-design.md` opens
with "SCF is the interlingua" and states the whole product in one sentence: take
the controls in the nCommand ISMS, express them as SCF controls, and answer
assessments and comparisons from those. The navigation still describes a product
organised by standard. Ten flat items, no grouping, and the word "control"
appears in none of them.

## 2. What the measurement found

**Live capability with no door.** `/api/posture` was substantively fixed on
2026-08-20 and serves grouped posture with evidence links, a summary, and
role-aware scoping. It reaches the interface only as one widget on the Overview
page. The observed axis has no page of its own.

**The front door serves numbers the project withdrew.** `/compliance` — the
second item in the menu, titled "Compliance Intelligence" and subtitled
`Real-time posture across N frameworks` — gets those figures from
`getFrameworkScores()`, which reads the latest scorecard rows from
`intelligence_snapshots` and serves them from a Redis cache. That is the same
generation of scorecards withdrawn as unbacked in
`docs/sql/2026-08-26_withdraw_fabricated_scorecards.sql`, and the cache means the
withdrawal may not even have reached the screen. Meanwhile
`projectFrameworkFromCrosswalk` — stamped with `CURATION_POLICY_VERSION`, reading
the real crosswalk, owned by a named person — runs only inside an assessment and
has no page at all.

**The sharpest way to say it:** the front door shows the repudiated numbers, and
the defensible ones are invisible.

**A card that conflates two quantities.** `src/app/api/dashboard/stats/route.ts:79`:
when no scorecard snapshot exists, the "Compliance Score" card falls back to
`evaluationSummary.avgConfidence`. A confidence average is displayed under a
compliance label. This is the class of dishonesty the backend spent a month
removing — 25,589 fabricated mappings quarantined, a fabricated index retired by
ADR, every figure made to cite the rule that produced it.

**Three labels that send people to the wrong place.**
`Evidence Map` → `/compliance/mappings` shows no evidence; it is control-to-requirement
mapping. `Audits & Checks` → `/assessments` is called assessments by the database,
the API, and every other document. `Standards & Norms` → `/compliance` is called
frameworks everywhere else in the system.

**Dead routes on a repudiated foundation.** `/api/compliance/roi` and
`/api/compliance/gaps` have no consumer anywhere in the interface. Neither has had
a logic commit since before 2026-06-29 — their last change was a mechanical
logger sweep. Both read from `intelligence_snapshots`.

## 3. The organising principle

The menu groups by **the question the user arrives holding**, taken from the
consumer table in the Dynamic spec. A person does not come to work thinking "I
want to look at a control"; they come thinking "a hospital asked us this" or
"what do our vulnerabilities say".

An alternative — putting Controls at the top and hanging everything off it — was
considered and rejected as the more faithful and less usable choice. It models
the architecture correctly and matches nobody's task.

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
`Standards & Norms` → `Frameworks`, `Evidence Map` → `Control Crosswalk`. No
route moves; only labels, grouping and order change, so every existing bookmark
and deep link keeps working.

The last three items take a divider rather than a group heading. They are the
utility drawer — reached when needed, not part of a question anyone arrives with.

Group headings must not be focusable, and the existing active-route logic in
`layout.tsx:132-141` (which already resolves the longest matching prefix so
`/compliance/scrms` does not light up `/compliance`) is kept unchanged.

## 5. The one new page

**`/posture`** — a thin page over `/api/posture`. That endpoint already returns
what a page needs: posture grouped by control, evidence links, and a summary,
capped at 500 controls with 1000-row evidence pages, scoped by the caller's role.
The page renders what the endpoint gives; it computes nothing of its own.

The Overview keeps its posture widget. The page is where the axis lives; the
widget stays the glance.

**Explicitly not in this work:** a coverage page reading the real projection. It
would need a new endpoint, because `projectFrameworkFromCrosswalk` runs only
inside an assessment run and nothing exposes it over HTTP. That is the natural
next piece and is deliberately left out rather than half-built.

## 6. The honesty fixes

**The stats card.** `src/app/api/dashboard/stats/route.ts:79` stops falling back
to `avgConfidence`. With no scorecard, the card shows `—`. A dash is honest; a
confidence average wearing a compliance label is not. The fallback to
`evaluationSummary.avgConfidence` is deleted, not made conditional.

**The `/compliance` subtitle.** It stops claiming `Real-time posture`. The page
names what it is actually showing — snapshot scores, and when they were taken —
so a reader can tell a stale cached figure from a live one. This does not repoint
the page at the projection; that is §5's excluded work. It makes the current page
stop overstating itself.

**Minor, while the file is open:** the `/compliance` title uses
`text-emerald-400`, a green that is not in the token palette. The design system's
accent is `--color-primary` (`#3DC2C2`). Bring it onto the token.

## 7. What is deleted

`src/app/api/compliance/roi/route.ts` and `src/app/api/compliance/gaps/route.ts`
— **the two HTTP routes only.**

No consumer, no logic change in over two months, and built on the scorecard
generation the project withdrew. Leaving them in place is an invitation to wire
them back up.

**Their helpers stay.** `getTopGaps` and `getRoiPath` in
`src/lib/data/compliance-data.ts` have three live callers between them:
`src/app/(dashboard)/compliance/page.tsx:39-40`,
`src/app/api/compliance/report/route.ts:183-184`, and
`src/lib/context/posture-profile.ts:47`. Deleting the helpers would break report
generation and the posture profile. Only the orphaned HTTP surface goes.

That those helpers still feed a report and a profile is worth noting: the
withdrawn-scorecard data reaches further than the two routes, and following it is
its own piece of work, not this one.

`/api/compliance/evaluations` is **not** deleted. It has no interface consumer
either, but it was not audited here and dead-code removal on an unaudited route
is how a working thing disappears.

## 8. Testing

The navigation is a data structure, so it is tested as one, in a new
`tests/unit/dashboard/navigation.test.ts`:

1. Every `href` in `NAV_ITEMS` resolves to a route that exists under
   `src/app/(dashboard)/`. This is the test that would have caught a rename
   breaking a link.
2. No group is empty, and every item belongs to exactly one group.
3. The active-route resolution still picks the longest matching prefix —
   `/compliance/scrms` marks Partner Requirements active and leaves Frameworks
   inactive.

For the stats card, one test asserts the API returns `—` and not a number when
no scorecard snapshot exists and `avgConfidence` is non-zero. That is the exact
condition that produces today's wrong label, so the test fails against current
code and passes after the fix.

The `/posture` page gets no new API test — the endpoint is already covered by
`tests/api/posture.test.ts`.

## 9. What this does not touch

The palette, the fonts, the glass treatment, the light/dark pair, the sidebar's
collapse behaviour, and every route path. This is a change of names, grouping and
truthfulness — not a redesign.
