---
WP_ID: WP-02
TASK_ID: TASK-0012
TITLE: Question escalation protocol and decision memory
STATUS: DONE
OWNER_AGENT: Architect
DEPENDENCIES: [WP-01]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [DECISION, CURRENT_CONTEXT]
OBSIDIAN_IMPACT: CREATE_NODE
---

# WP-02 — Question escalation protocol and decision memory

Work package of [[TASK-0012]].

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


Done.

- `scripts/lib/question-records.mjs` — the record type, ten categories, four
  statuses, three blocking scopes.
- `scripts/new-question.mjs` and `scripts/rebuild-questions.mjs` — raise,
  validate, index.
- `docs/questions/` — record tree with generated `index.md` and `open.md`.
- `.agent/context/question-protocol.md` — the cross-role invariant.
- `WAITING_USER` added to both `WP_STATUSES` and `TASK_STATUSES`, distinct
  from `BLOCKED`.
- `question` added to `ID_KINDS`, so ids are allocated atomically.

Decision memory: `docs/decisions` moved from retrieval authority 6 to 2 and
`docs/questions` added at 3. The one source able to stop an agent re-asking a
settled product question was previously ranked below QA runs and engineering
history — the least likely thing to surface.

## Validation State


- `node scripts/rebuild-questions.mjs --check` → valid, indexes current.
- `node scripts/allocate-id.mjs question` → `QUESTION-0001`, allocated atomically.
- `node scripts/validate-framework.mjs` → 2,986 checks pass.

## Evidence


- The validator refuses an `ANSWERED` question in a durable category with no
  `DECISION_ID`, which is the specific shape of an answer that gets lost.
- It refuses an `OPEN` question with no `## Agent Recommendation`, because
  routing bare options moves the analysis onto the user.
- `check-work-packages.mjs` refuses a `WAITING_USER` package naming no
  `QUESTION-nnnn` — without the reference, "waiting" and "stalled" are
  indistinguishable.
- Behavioural coverage lands in WP-12 (simulations 40 and 41).

## Questions

None yet.

## Handoff


KNOWLEDGE_IMPACT: DECISION, CURRENT_CONTEXT.
OBSIDIAN_IMPACT: CREATE_NODE — `docs/questions` needs a vault mapping in WP-04.
Unblocks WP-08. The role files consume the protocol rather than restating it.
