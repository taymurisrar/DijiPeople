---
SCENARIO_ID: QA-AUTHZ-007
aliases: [QA-AUTHZ-007]
TITLE: Organization structure mutations require explicit management permission
AREA: authorization
MODULE: services/api/src/modules/organization
TYPE: SECURITY
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/organization/organization-structure-authorization.spec.ts services/api/src/modules/organization/organization-structure-tenant-scope.spec.ts
RELATED_BUGS: [BUG-0006, BUG-0047]
RELATED_REGRESSIONS: [REG-006]
LAST_RUN: 2026-08-17
LAST_RESULT: PASS
CREATED_AT: 2026-08-17
UPDATED_AT: 2026-08-17
---

# QA-AUTHZ-007 — Organization structure mutations require explicit management permission

## Preconditions

An ordinary tenant employee and an HR actor holding `organization.manage`.

## Steps

1. Attempt create, update and delete on organizations and business units as the ordinary employee.
2. Repeat each operation as the authorized HR actor.
3. Check controller metadata for every organization-structure mutation.

## Expected Result

The ordinary employee receives 403 on all six mutation routes. The authorized
actor succeeds, and every new mutation must declare the same permission family.

## Notes

Reusable coverage for `REG-006`. Both named specs were present and passed in the
exact-base API unit job in GitHub Actions run `32009837400`.
