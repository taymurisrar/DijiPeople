---
SCENARIO_ID: QA-PARTNER-005
aliases: [QA-PARTNER-005]
TITLE: An empty optional website does not block partner inquiry
AREA: partner-lifecycle
MODULE: apps/landing
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: e2e/tests/flow-b-partner-journey.spec.ts
RELATED_BUGS: [BUG-0048]
RELATED_REGRESSIONS: [REG-039]
LAST_RUN: 2026-08-17
LAST_RESULT: PASS
CREATED_AT: 2026-08-17
UPDATED_AT: 2026-08-17
---

# QA-PARTNER-005 — An empty optional website does not block partner inquiry

## Preconditions

The landing partner form, API and disposable browser-test database are running.

## Steps

1. Fill every required partner inquiry field and leave Company website blank.
2. Submit through the real browser form.
3. Confirm the success status carries a reference and exactly one inquiry row exists.

## Expected Result

The optional empty input is normalized as absent, the inquiry succeeds, and URL
validation remains in force when a non-empty malformed value is supplied.

## Notes

The B1 assertion in Flow B is the reusable coverage for `REG-039`. It passed in
the exact-base browser job in GitHub Actions run `32009837400`. This result does
not cover Flow B's separate skipped BUG-0019 assertion.
