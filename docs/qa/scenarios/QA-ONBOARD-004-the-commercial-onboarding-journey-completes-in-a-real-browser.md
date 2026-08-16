---
SCENARIO_ID: QA-ONBOARD-004
aliases: [QA-ONBOARD-004]
TITLE: The commercial onboarding journey completes in a real browser
AREA: commercial-onboarding
MODULE: apps/admin
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: e2e/tests/flow-a-commercial-onboarding.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN:
LAST_RESULT: NOT_RUN
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-ONBOARD-004 — The commercial onboarding journey completes in a real browser

## Preconditions

The admin app running, seeded plans and workflows, and a database the spec can reach. `npm run test:browser:install` once, then `npm run test:browser`.

## Steps

1. Capture a lead through the public surface.
2. Convert it in the admin console and sign the agreement.
3. Complete onboarding and confirm the customer exists.

## Expected Result

Every screen in the journey loads, every control the flow needs is reachable, and
the records the API reports match what the UI showed. A screen that renders but
cannot be navigated to fails here and passes every unit test.

## Notes

Runs in CI as `browser-e2e-report` — **report-only, not a gate**. Promotion
criteria are in `.github/workflows/ci.yml` and `docs/development/ci.md`.
Covers the happy path; the negative cases in `PLAN-004` are not yet scripted.
