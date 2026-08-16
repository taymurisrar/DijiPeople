---
SCENARIO_ID: QA-PARTNER-004
aliases: [QA-PARTNER-004]
TITLE: The partner journey completes in a real browser
AREA: partner-lifecycle
MODULE: apps/admin
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: e2e/tests/flow-b-partner-journey.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN:
LAST_RESULT: NOT_RUN
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-PARTNER-004 — The partner journey completes in a real browser

## Preconditions

The admin and landing apps running, and a database the spec can reach.

## Steps

1. Submit a partner enquiry from the public surface.
2. Open the onboarding review screen in the admin console.
3. Walk the review to activation.

## Expected Result

Each screen is reachable by navigation — not only by URL — and the review
transitions are offered in the order the state machine allows.

## Notes

This spec is the direct answer to `BUG-0019`, where the partner inquiry and
onboarding review screens existed and nothing routed to them. A browser journey
fails on an unreachable screen; a unit test on the same components passes.
Report-only in CI.
