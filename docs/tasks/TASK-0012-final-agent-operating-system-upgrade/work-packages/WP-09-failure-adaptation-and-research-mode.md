---
WP_ID: WP-09
TASK_ID: TASK-0012
TITLE: Failure adaptation, failure budget and research mode
STATUS: NOT_STARTED
OWNER_AGENT: Architect
DEPENDENCIES: [WP-01]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [BUG_PATTERN, CURRENT_CONTEXT]
OBSIDIAN_IMPACT: NONE
---

# WP-09 — Failure adaptation, failure budget and research mode

## Goal

Classify failures, cap repetition, and bound external research.

Three related rules. Every meaningful failure gets a FAILURE_CLASS and an
ADAPTATION_ACTION, so the response to a tooling gap is not the response to a bad
assumption. The same approach may fail twice, never a third time — after two
materially identical failures the method changes, which is the rule that would
have stopped the shell-quoting and Playwright-selector loops this repository has
already paid for. And any specialist may enter research mode with a source
budget and a recorded finding, rather than a new permanent Research agent.

Done when the failure taxonomy is durable, the budget of two is stated where an
agent will hit it, and a systemic rule change requires evidence rather than one
incident.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `.agent/agents/architect.md`
- `docs/qa/known-bug-patterns/` — where lessons already land
- `.agent/context/task-completion-contract.md`

OPTIONAL:
- `docs/knowledge/` — for where a durable lesson belongs

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `.agent/context/failure-adaptation.md` — new
- `.agent/context/research-mode.md` — new

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | A single incidental failure must not rewrite permanent agent instructions | VERIFIED | The brief requires evidence, root cause, simulation and review before a systemic change |

## Implementation State

Not started.

## Validation State

Pending: simulations 63 and 64.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. Feeds WP-10 (agent health regressions come from classified failures).
