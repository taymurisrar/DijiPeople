---
SCENARIO_ID: QA-PARTNER-002
aliases: [QA-PARTNER-002]
TITLE: A live partner cannot be demoted through the generic update route
AREA: partner-lifecycle
MODULE: services/api/src/modules/partners
TYPE: API
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/partners/partner-lifecycle-guards.spec.ts
RELATED_BUGS: [BUG-0025]
RELATED_REGRESSIONS: [REG-015]
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-PARTNER-002 — A live partner cannot be demoted through the generic update route

## Preconditions

One partner in `ACTIVE`.

## Steps

1. Attempt the demotion through the lifecycle route.
2. Attempt the same field change through the generic partner update.

## Expected Result

Both are refused. The guard lives where the write happens, so every route that reaches the field is covered.

## Notes

The recurring lesson across this repository: protect the write, not the route.
