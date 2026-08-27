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
