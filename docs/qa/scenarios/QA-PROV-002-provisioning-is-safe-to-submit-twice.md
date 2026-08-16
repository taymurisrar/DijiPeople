---
SCENARIO_ID: QA-PROV-002
aliases: [QA-PROV-002]
TITLE: Provisioning is safe to submit twice
AREA: tenant-provisioning
MODULE: services/api/src/modules/super-admin
TYPE: UNIT
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/super-admin/tenant-provisioning-idempotency.spec.ts
RELATED_BUGS: [BUG-0022]
RELATED_REGRESSIONS: [REG-030]
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-PROV-002 — Provisioning is safe to submit twice

## Preconditions

A provisioning request that has not yet completed.

## Steps

1. Submit the same provisioning request twice concurrently.
2. Submit it again after the first has completed.

## Expected Result

Exactly one tenant exists afterwards. The uniqueness is enforced where the write happens, not by checking first and then writing.

## Notes

The `check-then-act` pattern — a read-then-write gap is a race under any concurrency.
