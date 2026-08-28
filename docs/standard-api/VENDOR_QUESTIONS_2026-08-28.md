# Questions for Standard GRC — 2026-08-28

Follow-up to 2026-08-27. Q1–Q10 are resolved and recorded in
`CONTRACT_AUDIT.md` §H and §I; nothing below re-asks them.

Every figure here was measured against our own copy of the crosswalk today,
after a complete walk of `GET /scf/controls/{id}/mappings`. Where we say
"measured" we walked it; where we do not, we say so. That distinction is the
one we got wrong last time and it is the reason for this preamble.

**Our state, measured 2026-08-28:**

| Fact | Value |
|---|---|
| Controls in catalogue | 1,473 |
| Controls with at least one mapping | 1,473 |
| Mappings held locally | 79,133 |
| `relationship_type = intersects` | 79,127 |
| `relationship_type = equal` | 6 |
| `subset` / `superset` / `no_relation` | 0 / 0 / 0 |
| Rows carrying the void `0.500` strength | 79,126 |

---

## Q11 — when does the STRM re-import ship?

This is the question the others depend on.

Our curation policy routes `intersects` to human review at any strength — the
rule you told us you would defend. Applied to the crosswalk as it stands today,
**79,127 of 79,133 mappings are undecidable**, so no framework reaches a
score at all.

Concretely, for the one framework we have curated an identity for:

```
ISO 27001 2022    316 mappings
  intersects      316
  equal             0
  unrecorded        0
  is_official=false 0
```

Our projection returns `score: null, reason: "nothing_assessable"` rather than
a zero, which is correct and is what we asked for. But it means the product
cannot show an ISO 27001 figure to a customer until the re-import lands.

We are not asking you to hurry. We are asking for a date we can plan against,
and whether the re-import will be a new SCF version (which rotates the UUIDs)
or an in-place correction of the current one.

## Q12 — the per-framework dry run you built

You described a dry run that writes nothing and reports, per framework, total
mappings, how many the STRM bundle grades, and how many reach `equal` or
`subset`.

We would like its output, for two reasons. First, it is the measurement that
replaces the `6.3%` we quoted and withdrew — we should not restate a coverage
figure until yours exists. Second, a framework with zero graded mappings will
produce no score on our side, and we would rather tell a customer that before
they run an assessment than after.

If it is easier to send only the rows for the frameworks we name in Q14, that
is enough.

## Q13 — `framework_code` whitespace, now that it is part of our primary key

Two `framework_code` values carry a double space:

```
"ISO 27701  2025"
"SCRM Focus  TIER 1 STRATEGIC"
```

We are not asking you to change them. We are asking you to **not** change them
without telling us, because `framework_code` became part of our mappings
primary key on 2026-08-28 — `(scf_version_id, control_code, framework_code,
requirement_code)`. We keyed on it precisely because it survives a version bump
where the UUIDs do not.

So: is `framework_code` a stable business key on your side, or is it display
text that could be normalised in a cleanup? If it is display text, tell us and
we will key on something else before it matters.

## Q14 — three framework identities we cannot resolve from the catalogue

Our slugs have to name exactly one of your 272 frameworks, decided by a person
with a written rationale. Three do not resolve, and the ambiguity is factual
rather than editorial.

**(a) IEC 62304 — no candidate at all.** Searching the 272 for `62304` returns
nothing. Is the medical-device software lifecycle standard carried under a name
we would not match, or is it genuinely not in the catalogue? Either answer is
usable; we just need to know which, so the row records "absent from vendor"
rather than staying blank.

**(b) ISO 27701 — edition mismatch.** The only candidate is `"ISO 27701  2025"`
with 149 mappings. Our slug means the 2019 edition. Is the 2025 row a newer
edition of the same standard, and is there a 2019 row we are failing to match?

**(c) FedRAMP and NIST 800-53 — baselines, not one framework.** Our slugs name
no baseline:

```
US FedRAMP R5 (high)          791 mappings
US FedRAMP R5 (moderate)      711
US FedRAMP R5 (low)           570
US FedRAMP R5 (LI-SaaS)       570

NIST 800-53 R5               1117
NIST 800-53 R4                807
NIST 800-53B R5 (privacy)     537
NIST 800-53B R5 (low)         277
NIST 800-53B R5 (moderate)    172
NIST 800-53B R5 (high)         91
```

Choosing among these is our decision, not yours. The factual question is
whether the baseline rows are **nested requirement sets** — is every `low`
requirement also in `moderate`, and `moderate` in `high`? The counts do not
read that way (`800-53B R5 (high)` has fewer mappings than `(low)`), and if
they are not nested we will curate one row per baseline rather than one per
family.

---

Nothing here blocks work on our side today. Q11 sets the date the product can
show a number again, and Q14 is the one where a wrong guess would put a
fabricated framework identity back into a schema we spent two weeks clearing
of them.
