---
SCENARIO_ID: QA-LANDING-003
aliases: [QA-LANDING-003]
TITLE: The demo form reports validation errors accessibly and submits
AREA: landing
MODULE: apps/landing
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: e2e/tests/flow-c-landing-public-surface.spec.ts
RELATED_BUGS: [BUG-0063]
RELATED_REGRESSIONS: [REG-059]
LAST_RUN: 2026-08-18
LAST_RESULT: PASS
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
---

# QA-LANDING-003 — The demo form reports validation errors accessibly and submits

## Preconditions

The landing app and the API are running, so a submission can actually reach `/api/leads`. No authentication is required.

## Steps

1. Open `/request-demo` and confirm the submit control is operable on load.
2. Submit the form empty.
3. Inspect the first invalid input for `aria-invalid` and `aria-describedby`, and check where focus went.
4. Fill every required field with valid values and submit.
5. Submit the identical payload a second time.

## Expected Result

Submit is enabled on load. An empty submission marks each invalid field with `aria-invalid`, links its message by `aria-describedby`, announces it through a live region, and moves focus to the first invalid control. A valid submission returns 201 and announces success. The identical repeat produces no second row. The route carries exactly one `h1`.

Guards BUG-0063, where the submit button was disabled until the form was already
complete — which made the validation messages unreachable for exactly the case
they were written for.

## Notes

Created 2026-08-18 at `c332992`.
