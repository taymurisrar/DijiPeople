---
SCENARIO_ID: QA-PAY-005
aliases: [QA-PAY-005]
TITLE: Payslip notifications reach only the payslip's owner
AREA: payroll
MODULE: services/api/src/modules/notifications
TYPE: UNIT
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/notifications/notification-events.payslip.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-PAY-005 — Payslip notifications reach only the payslip's owner

## Preconditions

A completed run producing payslips for several employees.

## Steps

1. Resolve the notification audience for each payslip.
2. Confirm no manager or HR role is included by default.

## Expected Result

The audience is the employee. A payslip notification fanned out to a manager is a salary disclosure.

## Notes

Notification scope resolution is shared; `notification-scope-chain.spec.ts` covers the chain itself.
