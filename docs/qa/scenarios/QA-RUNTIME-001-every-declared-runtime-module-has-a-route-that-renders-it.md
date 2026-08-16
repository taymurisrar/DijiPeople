---
SCENARIO_ID: QA-RUNTIME-001
aliases: [QA-RUNTIME-001]
TITLE: Every declared runtime module has a route that renders it
AREA: runtime-modules
MODULE: apps/admin/lib/runtime
TYPE: UNIT
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: apps/admin/lib/runtime/module-routes.invariant.spec.ts
RELATED_BUGS: [BUG-0019]
RELATED_REGRESSIONS: [REG-028]
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-RUNTIME-001 — Every declared runtime module has a route that renders it

## Preconditions

None — static invariant over the registry and the route tree.

## Steps

1. Enumerate every module in the registry.
2. Resolve the route each declares.
3. Confirm the route exists and renders that module.

## Expected Result

No declared module is unreachable. A registry entry with no route is a feature that exists only in configuration.

## Notes

The `unreachable-surface` pattern: `BUG-0019` was two screens nobody could navigate to.
