---
SCENARIO_ID: QA-AUTHZ-005
aliases: [QA-AUTHZ-005]
TITLE: A permission change takes effect on the next request
AREA: authorization
MODULE: services/api/test
TYPE: E2E
RISK: HIGH
AUTOMATION_STATUS: BLOCKED_INFRASTRUCTURE
TEST_REFERENCE: 
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 
LAST_RESULT: BLOCKED
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-AUTHZ-005 — A permission change takes effect on the next request

## Preconditions

A live PostgreSQL, seeded roles, and an authenticated session.

## Steps

1. Sign in and confirm a gated route is refused.
2. Grant the permission to the role.
3. Repeat the request on the same session, without signing in again.

## Expected Result

The route is now permitted, and revoking the grant refuses it again on the next request. Authorization is loaded per request, not baked into the token.

## Notes

`services/api/test/permission-propagation.e2e-spec.ts` implements this and needs a live database, so it cannot run in this checkout. Not a pass — the question is unanswered here.
