---
SCENARIO_ID: QA-PAY-001
aliases: [QA-PAY-001]
TITLE: Payroll operations privileges are separated from employee-record access
AREA: payroll
MODULE: services/api/src/common/constants
TYPE: SECURITY
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/common/constants/rbac-matrix.payroll-operations.spec.ts
RELATED_BUGS: [BUG-0001]
RELATED_REGRESSIONS: [REG-001]
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-PAY-001 — Payroll operations privileges are separated from employee-record access

## Preconditions

Seeded roles, including a reporting manager with `employees.read` and no payroll privilege.

## Steps

1. Enumerate the payroll-operations privileges in the matrix.
2. Confirm none is implied by employee-record read.
3. Confirm each seeded role holds only what it should.

## Expected Result

Payroll privileges stand alone. A manager who can see a report can not thereby see their salary.

## Notes

The matrix half of `BUG-0001`. The service-level half is `employee-compensation-access.spec.ts`, which is not on `main` — see `BUG-0047`.
