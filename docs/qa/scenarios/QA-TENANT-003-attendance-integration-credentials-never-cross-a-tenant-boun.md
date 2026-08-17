---
SCENARIO_ID: QA-TENANT-003
aliases: [QA-TENANT-003]
TITLE: Attendance-integration credentials never cross a tenant boundary
AREA: tenant-isolation
MODULE: services/api/src/modules/attendance-integrations
TYPE: E2E
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/test/attendance-integrations-isolation.e2e-spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-17
LAST_RESULT: FAIL
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-17
---

# QA-TENANT-003 — Attendance-integration credentials never cross a tenant boundary

## Preconditions

A live database, two tenants, each with a configured gateway and encrypted device credentials.

## Steps

1. Configure a gateway under tenant A with credentials.
2. From tenant B, list gateways, read A's gateway by id, and attempt a credential read.
3. Ingest a raw punch for A and attempt to read it from B.

## Expected Result

No gateway, credential or raw punch belonging to A is reachable from B, in any shape — including in an error message.

## Notes

The named suite is executable in CI against ephemeral PostgreSQL. It failed in
GitHub Actions run `32009837400`; WP-04 owns fixture isolation and residual
tenant-isolation proof. Credentials make this the highest-value isolation
target outside core HR data.
