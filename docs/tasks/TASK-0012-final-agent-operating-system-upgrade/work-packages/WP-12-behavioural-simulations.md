---
WP_ID: WP-12
TASK_ID: TASK-0012
TITLE: Behavioural simulations and mutation tests
STATUS: NOT_STARTED
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

Not started.

## Validation State

Pending: `npm run validate:framework`, plus a recorded mutation run per simulation.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. Feeds WP-14.
