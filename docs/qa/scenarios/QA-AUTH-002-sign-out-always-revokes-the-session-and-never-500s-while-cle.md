---
SCENARIO_ID: QA-AUTH-002
aliases: [QA-AUTH-002]
TITLE: Sign-out always revokes the session and never 500s while clearing cookies
AREA: authentication
MODULE: apps/admin/app/api/auth
TYPE: API
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: apps/admin/app/api/auth/logout/logout-route.spec.ts
RELATED_BUGS: [BUG-0009, BUG-0010]
RELATED_REGRESSIONS: [REG-032]
LAST_RUN: 2026-08-17
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-17
---

# QA-AUTH-002 — Sign-out always revokes the session and never 500s while clearing cookies

## Preconditions

An authenticated admin session, with and without a refresh cookie present.

## Steps

1. Sign out with a refresh cookie present.
2. Sign out with the refresh cookie already absent.
3. Sign out where cookie options cause the clear step to throw.

## Expected Result

All three revoke the server-side session and return a success status. Revocation
never depends on the refresh cookie being readable, and a cookie-clearing failure
never becomes a 500 that leaves the user signed in.

## Notes

Two records, one scenario: `BUG-0009` was the missed revocation and `BUG-0010` the 500.
