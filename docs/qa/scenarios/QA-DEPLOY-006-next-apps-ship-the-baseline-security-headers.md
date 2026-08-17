---
SCENARIO_ID: QA-DEPLOY-006
aliases: [QA-DEPLOY-006]
TITLE: Next applications ship the baseline security headers
AREA: deployment-release
MODULE: packages/config
TYPE: SECURITY
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: packages/config/security-headers.test.js
RELATED_BUGS: [BUG-0040]
RELATED_REGRESSIONS: [REG-035]
LAST_RUN: 2026-08-17
LAST_RESULT: PASS
CREATED_AT: 2026-08-17
UPDATED_AT: 2026-08-17
---

# QA-DEPLOY-006 — Next applications ship the baseline security headers

## Preconditions

The shared header configuration and all three Next application configs.

## Steps

1. Resolve headers for every path in web, admin and landing.
2. Assert HSTS, nosniff, referrer policy and frame protection.
3. Assert the CSP remains report-only until its explicit promotion decision.

## Expected Result

All three applications emit the five baseline headers, including DENY frame
protection, without silently promoting the observed CSP into enforcement.

## Notes

Reusable coverage for `REG-035`. The required CI security-header check passed in
GitHub Actions run `32009837400`.
