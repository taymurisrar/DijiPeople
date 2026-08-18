---
SCENARIO_ID: QA-BILLING-006
aliases: [QA-BILLING-006]
TITLE: Seat and plan changes apply immediately upward and at renewal downward
AREA: subscription-changes
MODULE: billing
TYPE: DATABASE
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/test/seat-plan-change.e2e-spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-18
LAST_RESULT: PASS
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
---

# QA-BILLING-006 — Seat and plan changes apply immediately upward and at renewal downward

## Preconditions

A tenant on a cheap plan with 20 seats and a known renewal date, plus a dearer
plan. Both plans need an active PlanPrice in the same currency and cycle.

## Steps

1. Request 30 seats.
2. Request 22 seats.
3. Request 40 seats while the decrease is pending.
4. Activate 3 employees, then request 2 seats.
5. Request 25 seats, then run the scheduler past the renewal date.
6. Preview a downgrade.
7. Request an upgrade, then a downgrade, then run the scheduler.
8. Inspect the outbox.

## Expected Result

1. Applied immediately; capacity is 30.
2. Scheduled for the renewal date. Capacity stays 30 — the period is paid for.
3. Capacity becomes 40 and the pending decrease is CANCELLED. Otherwise it
   would fire at renewal and undo the increase they just paid for.
4. Refused, naming the 3 active employees. Locking them out at renewal, when
   nobody remembers this request, is worse than refusing now.
5. After the scheduler runs, capacity is 25 and scheduledSeats is null.
6. A pure read: direction DOWNGRADE, dataRetained true, and the plan has NOT
   moved because somebody looked at the consequences screen.
7. The upgrade applies immediately; the downgrade is SCHEDULED and the tenant
   stays on the plan it paid for until the scheduler runs past renewal.
8. SEAT_CHANGE_REQUESTED, SEAT_CHANGE_APPLIED, PLAN_CHANGE_REQUESTED and
   PLAN_CHANGE_APPLIED are all present.

## Notes

Created 2026-08-18 at `ce9bb56`.
