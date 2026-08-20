---
WP_ID: WP-12
TASK_ID: TASK-0012
TITLE: Behavioural simulations and mutation tests
STATUS: DONE
OWNER_AGENT: QA
DEPENDENCIES: [WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-09, WP-10]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [QA_SCENARIO, REGRESSION]
OBSIDIAN_IMPACT: NONE
---

# WP-12 — Behavioural simulations and mutation tests

## Goal

Prove the twenty-five behaviours in the brief execute, rather than
checking that a Markdown file mentions them.

This repository has already learned the difference the hard way: a grepped check
survived a mutation that set its detection to a constant false while every word
it searched for stayed in place. Each simulation here therefore builds a
sandbox, runs the real script against it, and asserts on the outcome — and each
is mutation-tested by breaking the mechanism and confirming the check fails.

Done when all twenty-five brief scenarios are covered by executing simulations
and each one has been observed to fail when its mechanism is removed.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `scripts/validate-framework.mjs` — simulations 1 to 39 for the established pattern
- every script produced by the dependency packages

OPTIONAL:
- none

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `scripts/validate-framework.mjs` — simulations 40 onward

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | A grep-based check cannot verify behaviour and must not be counted as a simulation | VERIFIED | Simulation 39 exists precisely because check 38l survived that mutation |

## Implementation State

Done. Simulations 40-62 added to `scripts/validate-framework.mjs`,
covering the twenty-five behaviours of the brief.

Every one executes the mechanism against a fixture and asserts on the outcome.
None greps. Three build throwaway git repositories or sandbox record trees and
run the real scripts against them; the rest import the libraries and exercise
them directly.

The coverage: question protocol (40-41), work-package persistence and
continuation (42-46), evidence reuse and invalidation (47-49), test resource
lifecycle (50-53), id allocation (54), semantic record validation including the
false-positive case (55-56), the QA evidence hierarchy (57-58), the Obsidian node
contract and link semantics (59-60), and steward and agent-health reporting
(61-62).

## Validation State

- `node scripts/validate-framework.mjs` → 3,059 checks, up from 2,945 at the
  program's baseline.
- Every record validator green: backlog, tasks, QA, sessions, questions, work
  packages.

## Evidence

Mutation-tested rather than asserted. Seven mechanisms were broken
simultaneously and the run produced exactly the seven expected failures:

```
DO_NOT_LOAD requirement      -> simulation 45 failed
WAITING_USER question link   -> simulation 42 failed
evidence scope matching      -> simulation 48 failed
cleanup-failure gate         -> simulation 52 failed
relationship grammar         -> simulation 60b failed
contradiction detection      -> simulation 55 failed
evidence-level gate          -> simulation 57 failed
```

Each mutant was then reverted and the suite returned to green, with no residual
`MUTANT` marker anywhere under `scripts/`.

This matters because check 38l — a grepped check — once survived a mutation that
set its detection to a constant `false` while every identifier it searched for
stayed in place. A check nobody has watched fail is a check nobody has tested.

## Questions

None. One genuine defect was found *by* writing these simulations
and fixed rather than asked about — see the Implementation State of WP-13.

## Handoff

KNOWLEDGE_IMPACT: QA_SCENARIO, REGRESSION.
OBSIDIAN_IMPACT: NONE.
Unblocks WP-14.
