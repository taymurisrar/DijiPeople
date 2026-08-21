---
WP_ID: WP-14
TASK_ID: TASK-0012
TITLE: Reviewer hardening and the completion contract
STATUS: DONE
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

Done.

- **`.agent/agents/reviewer.md`** — the five artefacts to open for every
  CRITICAL and HIGH, risk-based sampling below that, semantic-contradiction
  rejection, the evidence-level floor, and the eight things verified on every
  review.
- **`.agent/context/task-completion-contract.md`** — eleven new terminal
  fields and four new `OBSIDIAN_*` counts, each with what "resolved" means.
- **`.agent/context/agent-handoffs.md`** — the matrix is now thirteen roles.
- **`AGENTS.md`** — the roster, and the four cross-role invariants pointed at
  rather than restated. Provenance lines moved, as that file requires.

The new fields are registered in `REQUIRED_COMPLETION_FIELDS` as well as
written into the contract, so deleting one from the prose is a validation
failure. Prose loses a line without anything noticing.

## Validation State

- `node scripts/validate-framework.mjs` → 3,078 checks; every new contract
  field is asserted present.
- All five record validators green.

## Evidence

- The Reviewer file now records the inverse rule as well as the rule: BUG-0034
  ran its retest, passed, and stated an end-to-end limit, and flagging that
  would teach people to stop writing limits down. Both halves are needed — a
  reviewer told only to hunt contradictions will find them in honest records.
- `NOT_REQUIRED` for the two new roles is explicitly hard to justify: a
  substantial task leaving the backlog untouched has usually failed to record
  something it found.

## Questions

None yet.

## Handoff

KNOWLEDGE_IMPACT: CURRENT_CONTEXT.
OBSIDIAN_IMPACT: UPDATE_NODE.
Gates WP-15.
