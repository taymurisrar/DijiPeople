---
WP_ID: WP-02
TASK_ID: TASK-0012
TITLE: Question escalation protocol and decision memory
STATUS: NOT_STARTED
OWNER_AGENT: Architect
DEPENDENCIES: [WP-01]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [DECISION, CURRENT_CONTEXT]
OBSIDIAN_IMPACT: CREATE_NODE
---

# WP-02 — Question escalation protocol and decision memory

## Goal

Let any specialist raise a genuine question at any point, route it
through the Architect to the user, and make the answer durable so the same
question is never asked twice.

Two failures are being fixed at once. A blanket "do not ask questions" rule made
agents guess at material business decisions to preserve autonomy. And answers
that did arrive lived only in chat, so the next session asked again.

Done when `docs/questions/` carries the record type, `WAITING_USER` exists at
both package and task level, a question scoped to one package cannot stall the
others, and an answered question becomes an ADR that later tasks retrieve.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `.agent/context/task-orchestration.md` — where the assumption register already lives
- `docs/decisions/` and `scripts/lib/id-allocator.mjs` — the ADR kind already exists
- `scripts/lib/task-records.mjs` — the status vocabularies

OPTIONAL:
- `docs/decisions/ADR-0001-ai-agent-workflow.md` — house style for a decision record

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `scripts/lib/question-records.mjs` — new
- `scripts/new-question.mjs`, `scripts/check-questions.mjs` — new
- `docs/questions/` — new record tree
- `.agent/context/question-protocol.md` — new

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | ADR ids already have an allocator entry, so decision memory needs no new numbering scheme | VERIFIED | `ID_KINDS.adr` in `scripts/lib/id-allocator.mjs` |
| A-02 | WAITING_USER must be distinct from BLOCKED or one question stalls a whole program | VERIFIED | TASK-0004 sits BLOCKED on an owner decision with eleven packages behind it |

## Implementation State

Not started.

## Validation State

Pending: `node scripts/check-questions.mjs`, plus simulations 40 and 41 in WP-12.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. Feeds the role files in WP-08 and the simulations in WP-12.
