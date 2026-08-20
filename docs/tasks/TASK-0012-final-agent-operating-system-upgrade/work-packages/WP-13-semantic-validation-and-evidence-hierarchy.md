---
WP_ID: WP-13
TASK_ID: TASK-0012
TITLE: Semantic record validation, QA evidence hierarchy, id allocation
STATUS: NOT_STARTED
OWNER_AGENT: QA
DEPENDENCIES: [WP-03, WP-04, WP-07]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [QA_SCENARIO, REGRESSION]
OBSIDIAN_IMPACT: NONE
---

# WP-13 — Semantic record validation, QA evidence hierarchy, id allocation

## Goal

Stop a record's terminal status from contradicting its own prose, put a
floor under what evidence a PASS may rest on, and prove concurrent id allocation
is safe.

The evidence hierarchy L0 to L7 makes the required level explicit per scenario,
and a scenario whose actual level is below its required level cannot PASS — which
is what separates "a static test asserts the shape of the source" from "the
behaviour was observed". Semantic validation stays bounded to unambiguous
contradictions: VERIFIED beside "not yet verified" is a failure; anything
requiring interpretation is not a validator's job.

Done when contradiction detection runs, evidence levels gate PASS, and two
concurrent REG allocations are proven to produce distinct ids.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/lib/qa-records.mjs` — scenario and run vocabulary
- `scripts/lib/backlog-records.mjs` — status vocabulary
- `scripts/lib/id-allocator.mjs` — the existing REG kind

OPTIONAL:
- `docs/qa/regressions/index.md` — the contentOf target

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `scripts/lib/qa-records.mjs` — evidence levels
- `scripts/lib/backlog-records.mjs` — contradiction detection
- `scripts/validate-framework.mjs` — the concurrency simulation

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | REG ids already have an allocator entry and need proving, not building | VERIFIED | `ID_KINDS.regression` with a `contentOf` scan of `docs/qa/regressions/index.md` |
| A-02 | Contradiction detection must stay bounded to avoid false positives on ordinary prose | VERIFIED | The brief explicitly rules out speculative NLP checks |

## Implementation State

Not started.

## Validation State

Pending: simulations 68 to 71.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. Feeds WP-14.
