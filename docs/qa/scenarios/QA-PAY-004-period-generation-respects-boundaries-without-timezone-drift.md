---
SCENARIO_ID: QA-PAY-004
aliases: [QA-PAY-004]
TITLE: Period generation respects boundaries without timezone drift
AREA: payroll
MODULE: services/api/src/modules/payroll
TYPE: UNIT
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/payroll/payroll-period-generation.service.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-PAY-004 — Period generation respects boundaries without timezone drift

## Preconditions

Tenants in different timezones with monthly and fortnightly cycles.

## Steps

1. Generate periods for each cycle.
2. Inspect the first and last day of each.
3. Generate across a daylight-saving transition.

## Expected Result

Boundaries land on the intended calendar dates in the tenant's terms, not shifted by a UTC conversion.

## Notes

Paired with `payroll-date-only.spec.ts`, which exists because a date that is really a timestamp moves a period end by a day.
