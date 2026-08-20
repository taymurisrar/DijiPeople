---
WP_ID: WP-06
TASK_ID: TASK-0012
TITLE: Evidence cache and invalidation
STATUS: NOT_STARTED
OWNER_AGENT: Release/DevOps
DEPENDENCIES: [WP-05]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: NONE
---

# WP-06 — Evidence cache and invalidation

## Goal

Stop re-running expensive suites because an unrelated package moved,
and stop reusing results after the code they covered changed.

Both halves matter and they pull in opposite directions, which is why this is
one package. An evidence record names the command, the SHA, the scope it
covered and the result; reuse is legitimate only while no file inside that scope
has changed since.

Done when a database E2E result survives a documentation commit and is
invalidated by a fixture commit, both proven by simulation rather than asserted.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/lib/work-package-records.mjs` — LAST_VERIFIED_SHA lives there
- `scripts/ci-evidence.mjs` — the existing CI evidence capture
- `.agent/context/ci-operations.md`

OPTIONAL:
- `scripts/ci-metrics.mjs` — for how rolling signals are already stored

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `scripts/lib/evidence-ledger.mjs` — new
- `scripts/evidence.mjs` — new CLI: record, check, invalidate
- `docs/evidence/` — the ledger

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Scope can be expressed as path globs and resolved against `git diff --name-only` | VERIFIED | Every evidence-producing command in this repo is scoped by workspace or directory |
| A-02 | Evidence must be invalidated by content change, not by elapsed time | VERIFIED | A time-based cache would re-run a green suite that nothing touched, which is the cost being removed |

## Implementation State

Not started.

## Validation State

Pending: simulations 53 and 54 — same-SHA reuse, changed-scope invalidation.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. WP-13 consumes the ledger for QA evidence levels.
