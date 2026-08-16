---
SCENARIO_ID: QA-TENANT-005
aliases: [QA-TENANT-005]
TITLE: Tenant erasure removes rows in dependency order and leaves nothing reachable
AREA: tenant-isolation
MODULE: services/api/src/modules/tenants
TYPE: DATABASE
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

# QA-TENANT-005 — Tenant erasure removes rows in dependency order and leaves nothing reachable

## Preconditions

A live database and a tenant with data across the related models.

## Steps

1. Run the erasure dry run and record the planned order.
2. Execute erasure.
3. Query each affected model for rows carrying the erased tenantId.

## Expected Result

The dry run's order is the order executed, no foreign-key violation occurs, and no row survives under the erased tenant.

## Notes

`tenant-erasure-order.e2e-spec.ts` and `tenant-erasure-dry-run.e2e-spec.ts`. 424 relations use `Cascade`, so the order is derived, not guessed.
