---
SCENARIO_ID: QA-TENANT-004
aliases: [QA-TENANT-004]
TITLE: Workspace domain resolution cannot be pointed at another tenant
AREA: tenant-isolation
MODULE: services/api/src/modules/tenants
TYPE: E2E
RISK: HIGH
AUTOMATION_STATUS: BLOCKED_INFRASTRUCTURE
TEST_REFERENCE: 
RELATED_BUGS: [BUG-0017]
RELATED_REGRESSIONS: [REG-027]
LAST_RUN: 
LAST_RESULT: BLOCKED
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-TENANT-004 — Workspace domain resolution cannot be pointed at another tenant

## Preconditions

Two provisioned tenants with distinct workspace hostnames.

## Steps

1. Resolve tenant A's hostname and confirm it yields A.
2. Present tenant B's hostname with a tenant A session.
3. Present an unknown hostname.

## Expected Result

Hostname resolution never overrides the session's tenant, and an unknown hostname does not fall back to any tenant.

## Notes

`services/api/test/workspace-domain-isolation.e2e-spec.ts`. The base-domain single-source decision is `ADR-0002`.
