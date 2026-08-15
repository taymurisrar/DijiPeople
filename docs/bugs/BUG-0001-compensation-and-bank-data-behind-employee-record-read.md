---
ID: BUG-0001
aliases: [BUG-0001]
Title: Compensation and bank data returned behind an employee-record read
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: REGRESSION_REGISTER
DetectedDate: 2026-08-14
DetectedInSha: 13e720e
AffectedModules: [services/api/src/modules/employees]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-001
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt: 2026-08-14
---

# BUG-0001 — Compensation and bank data returned behind an employee-record read

## Summary

`getCurrentCompensation` was gated only on `assertEmployeeAccess` — the
employee-record READ check — and returned the whole `EmployeeCompensation` row
with no `select`. Because `getProfile` embeds the same value, `GET /employees/:id`
leaked it too. Any reporting manager clears `assertEmployeeAccess` for their
entire subtree without holding a single payroll permission.

## Expected Behavior

Salary and bank details require a compensation or payroll permission, not merely
the right to read the employee record they hang off.

## Actual Behavior

A reporting manager with `employees.read` and no payroll permission received
`basicSalary`, `bankAccountNumber`, `bankIban`, `bankRoutingNumber` and
`taxIdentifier` for every direct and indirect report.

## Reproduction

See the scenario in [REG-001](../qa/regressions/index.md#reg-001--compensation-and-bank-data-behind-employee-record-read).

## Evidence

Regression register entry REG-001, and the spec that pins it:
`services/api/src/modules/employees/employee-compensation-access.spec.ts`.

## Root Cause

**Authorization was matched to the entity, not to the sensitivity of the data
returned.** The permission for "read this employee" was treated as sufficient
for every field reachable from that employee.

## Impact

Sensitive personal and financial data exposed to a large population of ordinary
managers inside the tenant. No cross-tenant exposure.

## Affected Areas

`services/api/src/modules/employees` — `getCurrentCompensation`, `getProfile`,
and every consumer of `GET /employees/:id`.

## Proposed Resolution

Resolved: gate the compensation read on a payroll/compensation permission and
apply an explicit `select` so sensitive columns cannot be returned by accident.

## Acceptance Criteria

A reporting manager without a compensation permission receives `null`, and none
of the five sensitive fields appears anywhere in the response.

## Regression Coverage

[REG-001](../qa/regressions/index.md) —
`services/api/src/modules/employees/employee-compensation-access.spec.ts`.
Proven to fail against the unfixed code.

## Dependencies

None.

## Related Items

Bug pattern [[sensitive-field-overexposure]]. Module [[employees|Employees]].
Same authorization-vs-sensitivity failure as [[BUG-0007-unguarded-duplicate-of-a-permission-gated-route]],
which also returned a `subscription.finalPrice` nobody had asked for.

## Resolution

Fixed 2026-08-14 on branch `agent/authz-batch0-compensation`.

## QA Retest

Verified by the regression spec; the register records it `Active: yes`.

## History

- 2026-08-14 — found, fixed, regression added as REG-001.
- 2026-08-15 — imported into the durable bug system from the regression register.
