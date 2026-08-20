---
WP_ID: WP-14
TASK_ID: TASK-0012
TITLE: Reviewer hardening and the completion contract
STATUS: NOT_STARTED
OWNER_AGENT: Reviewer
DEPENDENCIES: [WP-08, WP-12, WP-13]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [CURRENT_CONTEXT]
OBSIDIAN_IMPACT: UPDATE_NODE
---

# WP-14 — Reviewer hardening and the completion contract

## Goal

Make the Reviewer inspect evidence rather than summaries, and extend
the completion contract to the thirteen-role matrix and the new terminal fields.

For CRITICAL and HIGH the Reviewer opens the record, the resolution prose, the
QA retest prose, the named test and its result, and the implementation — five
artefacts, because the failure being prevented is a record that says VERIFIED
above a QA section that says the retest has not run. MEDIUM and LOW may be
sampled by risk.

Done when the contract carries the new fields with the same "never ASSUMED_PASS,
never omitted" rule, and the required-agent matrix covers all thirteen roles with
NOT_REQUIRED demanding a reason.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `.agent/agents/reviewer.md`
- `.agent/context/task-completion-contract.md`
- `.agent/context/agent-handoffs.md`

OPTIONAL:
- none

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `.agent/agents/reviewer.md`
- `.agent/context/task-completion-contract.md`
- `.agent/context/agent-handoffs.md`
- `AGENTS.md`

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | The contract is enforced by validate-framework, so new fields must be added to both together | VERIFIED | The contract section of the validator asserts each field name |

## Implementation State

Not started.

## Validation State

Pending: `npm run validate:framework`.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. Gates WP-15.
