---
WP_ID: WP-11
TASK_ID: TASK-0012
TITLE: Engineering Control Center expansion
STATUS: NOT_STARTED
OWNER_AGENT: Product & Backlog Steward
DEPENDENCIES: [WP-03, WP-04]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-11 — Engineering Control Center expansion

## Goal

Make one page answer "what is the state of engineering right now"
without opening anything else: active sessions and their leases, ready and
waiting packages, the database writer, the develop queue, open CRITICAL and HIGH,
ownerless and aging work, the ten Obsidian counters, test-resource cleanup
failures, agent-health regressions, and the computed next best actions.

Every number must be derived at generation time. A dashboard that restates what
someone typed is a second source of truth, which is the thing it exists to
prevent.

Done when `knowledge:dashboards` emits all of it and `--check` fails on
staleness.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/generate-dashboards.mjs` — the existing Control Center
- the WP-03 detectors and the WP-04 verifier outputs
- `scripts/session.mjs` — live session and lease state

OPTIONAL:
- `docs/knowledge/dashboards/` — current output, for format

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `scripts/generate-dashboards.mjs` — extended

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Every counter has a computable source; none needs manual entry | UNVERIFIED | To be proven while implementing — any counter without a source is dropped rather than faked |

## Implementation State

Not started.

## Validation State

Pending: `npm run knowledge:dashboards:check`, simulation 67.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending.
