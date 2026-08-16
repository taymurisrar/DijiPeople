---
SCENARIO_ID: QA-ATT-006
aliases: [QA-ATT-006]
TITLE: An employee cannot approve their own attendance correction
AREA: attendance
MODULE: services/api/src/modules/attendance
TYPE: SECURITY
RISK: HIGH
AUTOMATION_STATUS: MANUAL
TEST_REFERENCE: 
RELATED_BUGS: [BUG-0002, BUG-0047]
RELATED_REGRESSIONS: [REG-002]
LAST_RUN: 
LAST_RESULT: NOT_RUN
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-ATT-006 — An employee cannot approve their own attendance correction

## Preconditions

An employee who also holds an approval permission — common for managers correcting their own attendance.

## Steps

1. As that user, request a correction to your own attendance.
2. As the same user, approve it.
3. As a different approver, approve it.

## Expected Result

Step 2 is refused and step 3 succeeds. Holding the approval permission is not the same as being allowed to approve *this* record.

## Notes

**This scenario has no active automated test on `main`.**
`REG-002` names `attendance.correction-authorization.spec.ts`, which exists only
on the unmerged `agent/authz-batch0-attendance` branch — see `BUG-0047`. Until
that lands this is a manual check, and the area's SECURITY coverage is declared
`GAP` rather than covered.
