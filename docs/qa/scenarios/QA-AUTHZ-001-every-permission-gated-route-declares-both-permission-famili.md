---
SCENARIO_ID: QA-AUTHZ-001
aliases: [QA-AUTHZ-001]
TITLE: Every permission-gated route declares both permission families
AREA: authorization
MODULE: services/api/src/common/constants
TYPE: SECURITY
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/common/constants/wiring-invariants.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-AUTHZ-001 — Every permission-gated route declares both permission families

## Preconditions

None — a static invariant over the controller decorators.

## Steps

1. Enumerate every non-`@Public()` handler.
2. For each, read its `@Permissions(...)` and `@RequirePermission(...)` declarations.
3. Confirm every key resolves in `permissions.ts` / `rbac-matrix.ts`.

## Expected Result

No handler declares one family without the other, and no declared key is
undefined. `PermissionsGuard` early-returns `true` when neither family is
declared, so a half-declared route is an open route.

## Notes

The single highest-value invariant in this repository: it catches the failure before a reviewer has to notice a missing decorator.
