---
WP_ID: WP-07
TASK_ID: TASK-0012
TITLE: Test resource lifecycle and cleanup registry
STATUS: NOT_STARTED
OWNER_AGENT: QA
DEPENDENCIES: [WP-01]
LAST_VERIFIED_SHA: 4226e53
KNOWLEDGE_IMPACT: [QA_SCENARIO, CURRENT_CONTEXT]
OBSIDIAN_IMPACT: NONE
---

# WP-07 — Test resource lifecycle and cleanup registry

## Goal

Make every resource a test creates owned, accounted for and cleaned —
including when setup fails halfway through.

The rule underneath is that a test creates what it asserts on. A suite that
reaches for `findFirst()` against shared demo data is coupled to state it does
not own, and a teardown that deletes what it did not create is a data-loss
incident waiting for a scheduler. Cleanup records only the ids actually
created, runs idempotently, and reports its own failures instead of swallowing
them.

Done when UNACCOUNTED_TEST_RESOURCES is a computed number, a partially failed
setup cleans exactly what it made, and a silent cleanup failure blocks a QA
PASS.

## Context Manifest

What this package needs open, and what it must not open. The second list is the
half that saves budget: an agent that reads everything relevant-looking has
nothing left for the work.

REQUIRED:
- `.agent/context/testing-architecture.md`
- `scripts/assert-test-database.mjs` — the disposable-database guard
- `.agent/agents/qa.md`

OPTIONAL:
- `services/api/test/` — listed, not read in full, to see which suites create their own fixtures

DO_NOT_LOAD:
- the 87 records under `docs/bugs/` — this program changes how records are validated, not what any individual record says
- the Prisma schema, migrations and every `services/api/src/modules/` directory — no product code is in scope
- previous QA run transcripts under `docs/qa/runs/` — the evidence hierarchy is being defined here, not audited

LAST_VERIFIED_SHA: 4226e53 — re-read any summarised source that changed since.

## Relevant Files

- `scripts/lib/test-resources.mjs` — new run registry
- `.agent/context/test-resource-policy.md` — new

## Assumptions

| ASSUMPTION_ID | STATEMENT | STATE | EVIDENCE |
|---|---|---|---|
| A-01 | Provider objects that cannot be deleted must report ARCHIVED_PROVIDER_LIMITATION rather than DELETED | VERIFIED | Stripe test objects are not all deletable; a false DELETED is the dishonest state |
| A-02 | Durable evidence and ephemeral resources are different populations and cleanup must not confuse them | VERIFIED | Screenshots and traces are evidence; the tenant row the screenshot was taken against is not |

## Implementation State

Not started.

## Validation State

Pending: simulations 55 to 58.

## Evidence

Pending.

## Questions

None yet.

## Handoff

Pending. WP-13 wires cleanup status into the QA PASS condition.
