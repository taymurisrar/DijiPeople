---
SCENARIO_ID: QA-AUTHZ-008
aliases: [QA-AUTHZ-008]
TITLE: Route proxies forward upstream refusals
AREA: authorization
MODULE: apps/web/app/api
TYPE: SECURITY
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: scripts/check-proxies-forward-refusals.mjs
RELATED_BUGS: [BUG-0039]
RELATED_REGRESSIONS: [REG-034]
LAST_RUN: 2026-08-17
LAST_RESULT: PASS
CREATED_AT: 2026-08-17
UPDATED_AT: 2026-08-17
---

# QA-AUTHZ-008 — Route proxies forward upstream refusals

## Preconditions

None. This is a static cross-route invariant.

## Steps

1. Scan route handlers for branches on upstream 401 and 403 responses.
2. Reject any branch that issues a different upstream request and returns it as success.
3. Permit only refresh-and-retry of the identical request through the named allowlist.

## Expected Result

A proxy never converts an authorization refusal into a successful response with
different data.

## Notes

Reusable coverage for `REG-034`. The required CI check passed in GitHub Actions
run `32009837400`.
