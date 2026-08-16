---
SCENARIO_ID: QA-TENANT-003
aliases: [QA-TENANT-003]
TITLE: Attendance-integration credentials never cross a tenant boundary
AREA: tenant-isolation
MODULE: services/api/src/modules/attendance-integrations
TYPE: E2E
RISK: CRITICAL
AUTOMATION_STATUS: BLOCKED_INFRASTRUCTURE
TEST_REFERENCE: 
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 
LAST_RESULT: BLOCKED
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
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

`services/api/test/attendance-integrations-isolation.e2e-spec.ts`. Credentials make this the highest-value isolation target outside core HR data.
