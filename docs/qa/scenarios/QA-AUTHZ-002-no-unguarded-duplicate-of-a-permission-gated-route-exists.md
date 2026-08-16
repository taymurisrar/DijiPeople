---
SCENARIO_ID: QA-AUTHZ-002
aliases: [QA-AUTHZ-002]
TITLE: No unguarded duplicate of a permission-gated route exists
AREA: authorization
MODULE: services/api/src/common/constants
TYPE: SECURITY
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/common/constants/wiring-invariants.spec.ts
RELATED_BUGS: [BUG-0007]
RELATED_REGRESSIONS: [REG-007]
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-AUTHZ-002 — No unguarded duplicate of a permission-gated route exists

## Preconditions

None — static.

## Steps

1. Group handlers by the service method they call.
2. Where two routes reach the same method, compare their guards and decorators.

## Expected Result

Two routes onto one service method carry the same authorization, or the unguarded one does not exist. Reachability is what matters, not the decorator on the route somebody happened to read.

## Notes

The `duplicate-route-bypass` pattern. A guarded route is worth nothing if an unguarded sibling reaches the same code.
