# Operational Evidence via Confirmed Tags — Design

**Date:** 2026-08-21
**Status:** awaiting review
**Author:** brainstormed with Claude, decisions by @resper
**Predecessor:** `docs/superpowers/specs/2026-08-20-trustworthy-posture-design.md` (SP-1, shipped)

---

## 1. Why

SP-1 replaced an indefensible number with an honest one. The honest one is wrong in the
other direction.

Measured against production on 2026-08-21, after SP-1's backfill committed 11,744 provenance
claims and 1,237 evidence links:

| Verdict, over the 131 controls the platform previously called 100% conforming | count |
|---|---|
| conforming | 12 |
| partial | 45 |
| informal | 7 |
| gap | 67 |

The `partial` bucket is the interesting one: policy evidence present, operational evidence
absent. The obvious explanations are both false, and both were checked:

**It is not a missing-documents problem.** 41 of the 44 compliance documents tracked in the
sibling `ionic-txramp` repository are already in the corpus. The three that are not are a
kickoff deck, an email, and a duplicate-format copy of an SBOM already present as PDF.
Operational-class documents are 54.5% of the corpus by count.

**It is not a threshold-bias problem.** Approval rates either side of the evidence floor are
nearly equal — 12.1% for policy chunks, 9.5% for operational.

The actual imbalance is upstream, in retrieval:

| | share of documents | share of chunks | share of retrieval claims | share of accepted evidence |
|---|---|---|---|---|
| policy | 37.9% | 38.6% | **68.4%** | 78.3% |
| operational | 54.5% | 39.3% | **23.9%** | 21.7% |

Operational chunks are retrieved at roughly **half** the rate their corpus mass predicts. The
cause is mechanical: `match_documents_hybrid` scores a chunk against the *control description*,
which is written in policy language ("the organization shall establish…"). An SBOM spreadsheet,
a Sonar report, or an audit log contains almost no prose resembling that. The retrieval asks
"which text looks like this control?" when the operational question is "which artifact proves
this control runs?"

Corroborating: only 26% of documents produce any accepted evidence, and 19 documents carry 80%
of all of it. The eight largest contributors are every one of them `manual`, `policy` or
`matrix`. Not a single operational document appears among them.

## 2. The signal already in the database

`document_chunks.scf_controls[]` holds SCF control codes per chunk, populated by
`src/lib/chat/scf-tagger.ts` in two stages: cosine similarity against the pre-embedded
`scf_controls` catalogue, then an LLM confirmation pass. Critically, `scf-tagger.ts:146`
filters to `llm_status === 'implements'` before writing, and the classification prompt says
*"Be strict. If in doubt, classify as 'mentions'."*

So the array is not a topical hint. It is a conservative, LLM-confirmed assertion that **this
chunk evidences the control being actively implemented** — strictly stronger than the prose
similarity the posture engine currently relies on, and it is ignored entirely.

Coverage, measured 2026-08-21:

| | chunks | with SCF tags | tags per tagged chunk |
|---|---|---|---|
| policy | 1,576 | 49.7% (784) | 5.0 |
| **operational** | **1,605** | **39.1% (628)** | 5.0 |
| no role | 901 | 14.3% (129) | 5.0 |

**628 tagged operational chunks exist right now and contribute nothing.**

## 3. Why 61% of operational chunks are untagged

`runPostIngestPipeline` is what tags chunks. The cron at `/api/cron/sync-knowledge-base`
**exports `POST` only, while Vercel Cron invokes paths with `GET`**. It has been returning 405
on every schedule in `vercel.json`. Three sibling crons have the same defect (`run-assessment`,
`run-threat-model`, `recalibrate-scrms`); only `defectdojo-sync` and `agentic-triggers` export
`GET`.

**Correction, made during the final review of this branch:** an earlier draft of this section
claimed `sync-knowledge-base` was "the only thing that sweeps previously-untagged chunks." That
is factually wrong, and the review that caught it should not be softened into ambiguity here.
The route reads `.order('created_at', {ascending: false}).limit(5)` — the five newest documents,
nightly, forever (`src/app/api/cron/sync-knowledge-base/route.ts:32-37`). It is not a sweep; it
is a fixed, always-recent window that will never reach an untagged chunk sitting in an older
document. Worse, `runPostIngestPipeline` has no already-tagged skip
(`src/lib/chat/post-ingest-pipeline.ts:71-84`), so once the method fix below lands and this cron
actually runs, it will re-tag the same five newest documents every night, at recurring LLM cost,
for zero new coverage of the backlog.

The method fix in this spec makes the route *invocable*. It does not make it a backlog drain.
Draining the backlog needs the route to select documents whose chunks lack tags, not the newest
documents — that selection logic is **not delivered here** and is named as SP-2b work.

The tagging backlog is therefore not a design gap it takes one broken HTTP method to close. It
is two gaps: the broken method (fixed here) and the wrong selection query (deferred to SP-2b).

## 4. Decisions

| # | Decision | Rationale |
|---|---|---|
| **DEC-1** | Add a **second evidence source**: LLM-confirmed tags, alongside retrieval. Do not replace retrieval. | The two find different things. Retrieval finds prose that discusses a control; tags find artifacts asserted to implement it. Policy evidence is well served by the first. |
| **DEC-2** | Tag-derived provenance is recorded with `method: 'llm_confirmed'`, not `'vector'`. | The `method` column exists for exactly this distinction, and an auditor asking "how do you know" deserves a different answer for each. |
| **DEC-3** | Fetch tagged chunks **once** and invert in memory, rather than one query per control. | ~1,541 tagged chunks total against 1,468 controls. One paginated read beats 1,468 round trips, and the GIN index on `scf_controls` is not needed at all under this shape. |
| **DEC-4** | Fix the cron HTTP method mismatch as part of this work. | It is the input to everything above: it is why 61% of operational chunks carry no tags. Four one-line changes. |
| **DEC-5** | Do **not** change `MIN_EVIDENCE_SCORE`, `verdictConfidence`, or the role model. | Those are real findings (see SP-1's parked list) but each is its own decision. This increment changes what is *found*, nothing about how it is *judged*. |

## 5. The model

No new tables. One new source feeding the existing binder.

```
control description ──▶ match_documents_hybrid ──┐
                          (method: 'vector')      │
                                                  ├──▶ buildEvidenceLinks ──▶ control_evidence
document_chunks.scf_controls[] ──▶ tag index ────┘      (existing, unchanged)
                          (method: 'llm_confirmed')
```

The merge needs no new logic. `buildEvidenceLinks` already dedups on `(control, chunk)` keeping
the higher score, so a chunk found by both paths collapses to one link, and the role still comes
from the document's `doc_type` — the one-role-per-chunk guarantee is untouched.

### 5.1 Scoring tag-derived provenance

A tag carries no similarity score; the tagger's own scores were written to
`document_control_provenance`, which does not exist in this database. So tag-derived provenance
gets a single named constant, `TAG_CONFIDENCE = 0.70` — **floor-plus-epsilon**: just above
`MIN_EVIDENCE_SCORE` (0.65), and nothing more.

**Corrected during final review.** An earlier draft set this to 0.95, arguing that an
LLM-confirmed `implements` outranks a prose match. That reasoning conflates a claim about
*kind* ("this is implementation evidence") with a claim about *relevance*, and it costs three
things the earlier draft did not account for:

- `buildEvidenceLinks`/`dedupeProvenance` dedup a chunk found by both sources on score, keeping
  the higher one. A constant at 0.95 always wins that tie-break, discarding a real measured
  retrieval score in favour of an assertion.
- `groupPosture` sorts evidence by score for the "top evidence" shown to an auditor. A flat 0.95
  block sits above every retrieval-derived row regardless of actual relevance, turning that
  ranking into an arbitrary tie-break.
- It re-bases `verdictConfidence` to ~95 for any tag-backed control — a metric §6 already
  declares out of scope for this increment.

0.70 buys the one property this section actually needs — a confirmed tag always clears the
evidence floor — and gives up none of it, while leaving genuine relevance comparisons to
retrieval's measured scores.

**Consequence, tied to §7.3(b) below:** with a floor-adjacent constant, a strong retrieval
measurement can legitimately outrank a tag for the same (chunk, control) pair. Because
`evidence_provenance` is unique on `(chunk_id, scf_control_code)`, the dedupe this spec requires
(see the backfill script) then keeps the `vector` row and discards the `llm_confirmed` one for
that pair — the tag's `implements` assertion is not persisted for it. That is a real, accepted
loss: the pair is still evidence (via the retrieval row), just not attributed to the tagger for
that one overlapping case. It only bites pairs both sources found; a pair only the tagger found
is unaffected and persists as `llm_confirmed`.

Stated plainly because it is still a real weakness: this is not a measurement, it is an
assertion, floor-anchored rather than ranked. It means tag-derived evidence cannot be ranked
against itself, because every row carries the same score. Ranking within tag evidence is out of
scope; recording the tagger's own similarity is SP-2b work, and requires the provenance table
question to be settled first.

## 6. Scope

**In scope:** the four cron method fixes; a tag index built from one read; tag-derived
provenance merged into the backfill; before/after reporting so the delta is visible.

**Explicitly out of scope:**

- `MIN_EVIDENCE_SCORE` and the intersection-test finding — SP-1 parked it deliberately.
- `verdictConfidence` — SP-1's review showed it only restates the verdict and invites a
  "45% compliant" misreading that spec §6 forbids. Its own decision.
- The `role`-vs-`doc_type` staleness hazard.
- Retiring `document_control_provenance` and its three consumers.
- `/api/posture`'s untested auth gate. **Still a hard precondition before the route is wired
  to any caller.**

## 7. Success criteria

1. `/api/cron/sync-knowledge-base`, `run-assessment`, `run-threat-model` and
   `recalibrate-scrms` all export `GET` and are invocable by Vercel Cron.
2. The tag index is built from exactly one paginated read, and a control with no tagged chunks
   yields no tag-derived provenance rather than an error.
3. Tag-derived provenance is recorded with `method: 'llm_confirmed'`; retrieval-derived keeps
   `'vector'`. **Weakened during final review** — the original criterion said both are
   "distinguishable in `evidence_provenance` afterwards," full stop. That is unachievable as
   written: `evidence_provenance` is `unique (chunk_id, scf_control_code)`, so a (chunk, control)
   pair claimed by *both* sources can hold only one `method` row, precisely the case where the
   distinction is interesting. The achievable criterion is: distinguishable for any pair claimed
   by only one source. Making both durable for overlapping pairs too would need
   `unique (chunk_id, scf_control_code, method)` — SP-2b work, because `evidence_provenance`
   already carries production rows and widening its uniqueness constraint is a migration against
   live data, not a decision to make inside this increment.
4. A chunk found by both retrieval and tagging produces exactly one evidence link.
5. The backfill prints operational evidence counts before and after the tag source, so the
   change in `partial` → `conforming` is attributable rather than asserted.
6. `informal` does not grow faster than `conforming`. Tag evidence is operational-heavy, so a
   large jump in `informal` would mean controls are gaining operational evidence while their
   policy evidence is still not being found — a signal that the retrieval imbalance is worse
   than measured, not that this change worked.

## 8. Risks

| Risk | Handling |
|---|---|
| `TAG_CONFIDENCE` is an assertion, not a measurement | Stated in §5.1 and in the code. Revisit when the tagger's own scores are persisted. |
| The tagger's `implements` classification may be wrong on some chunks | It is stricter than the current similarity path, so this is an improvement even where imperfect. Every tag-derived link names its chunk, so a wrong one is inspectable. |
| Fixing the crons starts four jobs that have never run in production | They are additive pipelines, but `run-assessment` writes assessments and `recalibrate-scrms` shells out to a Python script whose default path is a developer's home directory. Fix the methods; **enabling each job is a separate, deliberate act**, and this spec does not schedule them. |
| Tag coverage grows only after the tagging cron actually runs | Expected. This increment unlocks 628 already-tagged operational chunks immediately. **Corrected during final review**: the remaining 977 do *not* follow "whenever the sweep runs" — `sync-knowledge-base` is not a sweep (see §3's correction); it reads the five newest documents, nightly, forever, and has no already-tagged skip. The method fix here makes the route invocable; draining the backlog needs the route to select documents whose chunks lack tags, which is SP-2b work, not delivered by this spec. |
