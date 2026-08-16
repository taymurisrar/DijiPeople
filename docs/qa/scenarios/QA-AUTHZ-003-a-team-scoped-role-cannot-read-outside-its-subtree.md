---
SCENARIO_ID: QA-AUTHZ-003
aliases: [QA-AUTHZ-003]
TITLE: A TEAM-scoped role cannot read outside its subtree
AREA: authorization
MODULE: services/api/src/modules/employees
TYPE: UNIT
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/employees/employee-access.service.spec.ts
RELATED_BUGS: [BUG-0003]
RELATED_REGRESSIONS: [REG-003]
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-AUTHZ-003 — A TEAM-scoped role cannot read outside its subtree

## Preconditions

A manager with direct reports, and a peer employee outside that subtree.

## Steps

1. As the manager, list employees.
2. As the manager, read the peer's record by id directly.

## Expected Result

The list contains the subtree only, and the direct read of the peer is refused. `readTeam` means the team, not the tenant.

## Notes

`BUG-0003` made `readTeam` tenant-wide — a fail-open scope. Per `BUG-0047` the fix is not on `main`.
