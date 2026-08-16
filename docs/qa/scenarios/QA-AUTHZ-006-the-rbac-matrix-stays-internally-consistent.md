---
SCENARIO_ID: QA-AUTHZ-006
aliases: [QA-AUTHZ-006]
TITLE: The RBAC matrix stays internally consistent
AREA: authorization
MODULE: services/api/src/common/constants
TYPE: UNIT
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/common/constants/rbac-matrix.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-AUTHZ-006 — The RBAC matrix stays internally consistent

## Preconditions

None — static.

## Steps

1. Check every entity key referenced by a privilege exists.
2. Check every seeded role's privileges resolve.
3. Check no entity is defined twice.

## Expected Result

One home per entity key and per privilege. A second definition is a regression even where it compiles — the `divergent-duplicate-guard` pattern applied to the matrix itself.

## Notes

Extended per family in `rbac-matrix.benefits/claims/loans/payroll-operations.spec.ts`.
