---
SCENARIO_ID: QA-PAY-002
aliases: [QA-PAY-002]
TITLE: Compensation formulas evaluate deterministically
AREA: payroll
MODULE: services/api/src/modules/compensation
TYPE: UNIT
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/compensation/compensation-formula.service.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-PAY-002 — Compensation formulas evaluate deterministically

## Preconditions

Salary packages using each supported formula construct.

## Steps

1. Evaluate each formula against known inputs.
2. Evaluate with a missing referenced component.
3. Evaluate with zero and with a negative input.

## Expected Result

Known inputs give known outputs; a missing reference is an error rather than a silent zero. A formula that treats absence as zero produces a plausible wrong number, which is the worst kind.

## Notes

Money. Every case here is worth more than a UI test.
