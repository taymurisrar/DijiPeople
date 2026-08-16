---
SCENARIO_ID: QA-ONBOARD-003
aliases: [QA-ONBOARD-003]
TITLE: Commercial bootstrap runs end to end from lead to provisioned customer
AREA: commercial-onboarding
MODULE: services/api/test
TYPE: E2E
RISK: HIGH
AUTOMATION_STATUS: BLOCKED_INFRASTRUCTURE
TEST_REFERENCE: 
RELATED_BUGS: [BUG-0024]
RELATED_REGRESSIONS: []
LAST_RUN: 
LAST_RESULT: BLOCKED
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-ONBOARD-003 — Commercial bootstrap runs end to end from lead to provisioned customer

## Preconditions

A live database, seeded plans and workflows, Stripe in test mode.

## Steps

1. Create a lead through the public surface.
2. Convert it, sign the agreement, complete onboarding.
3. Confirm the customer, subscription and invoice exist.

## Expected Result

Each step has a real caller and leaves a consistent record set. A declared step with no caller fails this scenario rather than passing silently.

## Notes

`services/api/test/commercial-bootstrap.e2e-spec.ts`. `BUG-0024` was exactly a step nothing invoked.
