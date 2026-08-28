# Questions for Standard GRC — 2026-08-27

Context for our side: we are rebuilding around the control as the unit of
work rather than the framework. The SCF catalogue becomes our spine, each
control's official mappings are persisted locally, and a framework figure
becomes a projection over them. That makes `GET /scf/controls/{id}/mappings`
the endpoint our product depends on most, and changes which questions matter.

Everything below was measured against the live API today, not read from the
OpenAPI document. Where we cite a status code we have a trace id.

---

## First, the scope fix landed and we verified it

`intelligence:run` on `compliance-score` and `roi-path`, `gap:write` on
`evaluate-evidence`, and `/soc/status` stating outright that no API key
reaches it. We checked the claim rather than taking it: 271 operations declare
a permission, 209 state a scope, 62 state "Not reachable with an API key".
209 + 62 = 271, no route falling through. The build-time guard holds.

We have regenerated our types from the corrected document, so required scopes
are now visible at our call sites.

---

## Q1 — `pagination` is absent from the live controls response

`GET /api/v1/scf/versions/{scfVersionId}/controls?limit=100` returns `200` with
100 items and **no `pagination` object at all**. The OpenAPI document declares
one:

```
pagination: { has_more: boolean; next_cursor?: string | null;
              limit?: number; offset?: number; total?: number }
```

We currently terminate when a page returns fewer than 100 rows. That works but
cannot distinguish "last page" from "a page truncated for another reason", and
it means we never learn the catalogue's true size.

- Is `pagination` meant to be present here, or is the schema over-declaring?
- If it is meant to be present, is there a parameter that switches it on?
- Is there any way to obtain a total count for a version?

## Q2 — is walking every control the intended way to read the crosswalk?

`GET /api/v1/scf/controls/{controlId}/mappings` returned `200` with **65
mappings** for `AAT-01`. Excellent data — `relationship_type`,
`relationship_strength`, `mapping_source`, `is_official`, `is_synthetic`. It is
exactly what we need, and `is_synthetic` in particular is a field we wish we
had been reading a year ago.

The concern is the access pattern. With ~1,468 controls that is ~1,468 requests.
Response headers show `x-ratelimit-limit: 120`, `x-ratelimit-reset: 60`, so a
full crosswalk load is roughly 13 minutes of sustained budget.

- Is per-control walking the intended pattern, or is there a bulk export?
- Is there a "changed since" or version-delta form, so a refresh does not
  repeat the full walk?
- Would you rather we did this against a specific window or with a raised limit?
  We would prefer to ask than to look like abuse.

## Q3 — are the UUIDs stable across SCF versions?

This is the question that most affects our design, because we are about to
persist these identifiers.

- Does a given control keep the same `control_id` across SCF versions, or is a
  new row minted per version? (`control_code` looks stable; `control_id` we
  cannot tell.)
- Same question for `framework_id` and for the mapping row's own `id`.

If they rotate per version, our cache invalidates wholesale on a version bump
and we will key on `control_code` + version instead. We would rather know than
discover it.

## Q4 — what does `relationship_strength` mean, and what should count?

We received `relationship_type: "intersects"` with
`relationship_strength: "0.500"`.

We have decided **not** to let `intersects` satisfy a requirement at any
strength — it routes to human review instead. We would rather understate
coverage than publish a percentage resting on a threshold we invented.

But we would rather understate it for the right reason:

- Is `relationship_strength` comparable across mappings, or is it scoped to a
  pair?
- Is there official SCF guidance on which relationship types are considered to
  satisfy a requirement for audit purposes, as opposed to merely relate to it?
- Is `0.500` a real measurement or a default for "related, unquantified"?

Our reason for caring is specific. We quarantined 25,589 mapping rows of our
own last week that had been manufactured by prefixing one framework's control
ids into another's. We are not eager to replace fabricated data with a
defensible-looking threshold that is also our invention.

## Q5 — self-referential mappings

Among `AAT-01`'s mappings, at least one had `framework_code:
"Secure Controls Framework (SCF)"` with an **empty** `scf_framework_id`. We read
those as the catalogue mapped onto itself and drop them, since counting them
would inflate every denominator.

- Is dropping them correct?
- Is the empty `scf_framework_id` deliberate, or a gap?

## Q6 — a route documents no permission and still returns 403

Possibly a residue of the fix you just shipped, so flagging it rather than
assuming.

`GET /api/v1/regulations` carries **no** permission or scope clause in the
OpenAPI document. We read the absence as "open to any valid key" — reasonably,
we thought, since the document now states outright when a route is unreachable.
It returns **`403`**.

We were wrong to infer reachability from an absent clause, and have stopped
doing so. But if 136 operations genuinely require no permission, and this is one
of them, then either the document or the enforcement is off by one case. Your
build-time guard checks that a route declaring a permission documents its scope;
it would not catch a route that documents nothing and enforces something.

- Which is authoritative for `/regulations`?
- Should we expect other permission-free routes to behave this way?

---

# Follow-up after your answers — one question, and it blocks us

Your reply resolved five of six. Q3, Q4 and Q5 changed our schema before a line
of it was written: keying on `control_code` + version rather than UUID, and a
`strength_is_trustworthy` column so every `0.500` we have already ingested can
be found again after your fix ships. The NDJSON export turns our catalogue load
from fifteen requests into one. Thank you for the directness on all three —
particularly on the `0.500`, which you had no obligation to volunteer.

One new question, and it is the one thing now stopping us.

## Q7 — which direction do `subset` and `superset` run?

You endorsed routing `intersects` to human review at any strength, which we were
glad to have confirmed. In the same paragraph you described ADR-001 as capping
`superset` at 0.5 and treating **`equal` and `subset`** as 1.0.

That is the inverse of what we had written. Our policy counted `equal` and
`superset` as satisfying, and `subset` as contributing but never sufficient.

The disagreement is entirely about an unstated convention:

| If the relation reads… | `subset` | `superset` |
|---|---|---|
| control ⊆ requirement (our reading) | control covers part of the requirement → partial | control covers it and more → satisfies |
| requirement ⊆ control (your ADR implies) | requirement sits inside the control → satisfies | control covers only part → partial |

Both are coherent. They invert which relationship types count toward a
customer-facing coverage figure.

- Which is it: is the subject of `subset` the control or the requirement?

We are not guessing this one. A coin flip here has an even chance of publishing
coverage that errs in the direction that flatters us, and we have just finished
removing 25,589 rows that did exactly that.

Related, and we understand the answer may be "no": you noted you are not aware
of official SCF guidance on which relationship types satisfy a requirement for
audit purposes. If ADR-001 is shareable, even in summary, we would rather cite
your reasoning than invent our own. Where we must decide, we will record it as
our decision with a named owner — but we would prefer to be following you.

---

## Q10 — `relationship_type` is `intersects` on every real mapping. Same shape as the 0.500.

We completed the full crosswalk walk: 1,473 controls, 79,133 mappings. Then we
counted what came back.

| `relationship_type` | rows |
|---|---|
| `intersects` | **79,127** |
| `equal` | 6 |
| `subset` | 0 |
| `superset` | 0 |
| `no_relation` | 0 |

And the six `equal` rows are not production data:

```
BCR-001  framework SYNTH-STD-1        official_scf   is_official=true
GOV-001  framework SYNTH-STD-1        official_scf   is_official=true
IAC-001  framework SYNTH-STD-1        official_scf   is_official=true
TPR-001  framework SYNTH-STD-1        official_scf   is_official=true
VPM-001  framework SYNTH-STD-1        official_scf   is_official=true
IAC-001  framework ONS-RO-901.000     consultative   is_official=false
```

Five sit in a framework named `SYNTH-STD-1`; the sixth is consultative and not
official. So **every one of the 79,126 official production mappings is
`intersects`**, and all 79,126 also carry the `0.500` strength you have already
identified as a parse-failure constant.

Confirmed at the source rather than in our storage — raw API, one control:

```
GET /api/v1/scf/controls/{IAC-01}/mappings
→ 349 rows
  relationship_type: { "intersects": 349 }
  relationship_strength: [ "0.500" ]
```

The requirement side is clearly real. ISO 27001 2022 returns 316 mappings across
148 distinct requirements with genuine clause codes — `4.2`, `4.2(a)`, `4.3`,
`6.3`. It is the relationship column that carries no information.

### Why this stops us

You endorsed our rule of routing `intersects` to human review at any strength.
With both columns constant, that rule now consumes the entire crosswalk. We ran
the projection against real data, twice:

```
ISO 27001, no evidence evaluated:
  148 requirements, 0 satisfied, 148 unevaluated       → no score

ISO 27001, ALL 1,473 controls conforming (the ceiling):
  148 requirements, 0 satisfied, 148 needing review    → no score
```

The ceiling is "no score". An organisation that implemented every control in the
SCF catalogue would still receive no ISO 27001 figure, because nothing in the
crosswalk says any control covers any requirement — only that they intersect, to
an unstated degree.

We are not going to relax the rule to produce a number. A percentage derived from
79,126 identical `intersects` values would be a percentage derived from nothing,
and it would look more authoritative than the fabricated data we spent last week
removing, because it would arrive with a policy version stamped on it.

### The questions

1. Is `relationship_type` being defaulted the way `relationship_strength` was? The
   symptom is identical — one value across every official row — and SCF's STRM
   vocabulary is precisely `equal | subset | intersects | superset | no_relation`,
   so a mapping step that fails to translate would land everything on the middle
   value.
2. If the source data does carry real relationship types, when can we expect them
   through the API?
3. If it genuinely is `intersects` everywhere by design, then we would like to
   understand how ADR-001's weights are ever exercised — `equal` and `subset` at
   1.0, `superset` capped at 0.5 — since no production row reaches any of them.

This is the only thing now blocking a defensible framework figure. Everything
else on our side is built, tested and running against your data.

## Q9 — the NDJSON export returns 51 of 1,473 controls and reports success

This one we would flag urgently, because it fails silently and you offered it as
the way to learn the catalogue's size.

```
GET /api/v1/scf/versions/8260df81-979f-4eab-a525-26550ad95d79/controls
Accept: application/x-ndjson

→ 200
  content-type: application/x-ndjson
  transfer-encoding: chunked
  39,088 bytes, 51 non-empty lines
  first: AAT-01
  last:  AAT-11.3
```

Fifty-one rows, all inside `AAT` — the alphabetically first domain of 35. The
stream is well-formed and ends cleanly. Nothing in the status, the headers, or
the body says it stopped early.

The paginated route gives 1,473 controls for the same version.

Your Q2 answer said: *"That also answers 'how big is the catalogue' — count the
lines."* Had we taken that, we would have recorded a 51-control catalogue, and
every framework denominator we compute would have been wrong by a factor of
about 29 — in the direction that flatters us. We only caught it because 51 sat
suspiciously close to the "batches of 50" you mentioned.

- Is the batching loop terminating after its first batch?
- Is 51 rather than 50 meaningful — an off-by-one at a boundary?

Until it is fixed we page with `per_page`/`page` instead, which works.

## Q8 — `offset` is ignored on `/scf/frameworks` — and on the controls route too

Broader than we first reported. On `/scf/versions/{id}/controls`:

```
?limit=100              → AAT-01 … AAT-20.2
?limit=100&offset=100   → AAT-01 … AAT-20.2      offset accepted, ignored
?limit=100&offset=500   → AAT-01 … AAT-20.2
?limit=100&page=2       → AAT-20.3 … AST-18      works
?limit=100&page=5       → CRY-01.3 … DCH-23.4    works
```

Response keys are `data, scf_version_id, page, per_page, trace_id`, so this is
the legacy shape and `page` is the right parameter — our fault for reaching for
`offset` first. But `offset` being accepted and silently ignored is what made it
cost a debugging cycle: a rejected parameter would have told us immediately.

We have added a guard on our side that throws when a page repeats rows an
earlier page already returned, since that is the shape this failure takes.

Also confirming cursor mode is still unreachable on this endpoint as of today —
`pagination` is absent from the response, so `next_cursor` never exists. We
assume that is simply the Q1 fix not yet being merged.

### Original Q8 observation, on `/scf/frameworks`

Requesting three pages concurrently:

```
GET /scf/frameworks?scf_version={id}&limit=100&offset=0
GET /scf/frameworks?scf_version={id}&limit=100&offset=100
GET /scf/frameworks?scf_version={id}&limit=100&offset=200
```

returned 816 rows in total — 272 from each call, the same 272 each time. So
`limit=100` is also not applied here, and `offset` has no effect.

Possibly the same root cause as Q1: this route may be in the legacy offset shape
and mishandling both parameters. Flagging in case your Q1 fix does not cover it.

Not blocking us — 272 rows arrive in one request, which is all we need.

---

## Smaller notes, no reply needed

- `/scf/frameworks/{frameworkId}/coverage` and
  `/scf/cross-mapping/{a}/{b}` require UUIDs; passing `iso27001` returns
  `400 Invalid UUID format for parameter: frameworkId`
  (trace `a31b6e1d4ec803e0`, `a31b7318a9ca7432`). Clear from the error, and our
  own fault for having invented slugs. We are building a curated table mapping
  our internal codes to your `framework_id`, populated by a person, with a
  rationale recorded per row.
- `/scf/frameworks` returns **272** frameworks. We had 231 recorded from an
  earlier conversation; noting the change in case it is meaningful to you.
- We guessed `/scf/versions/{id}/requirements` and got `404`;
  `/scf/frameworks/{frameworkId}/requirements` is the one that exists. Our error,
  not a report.
