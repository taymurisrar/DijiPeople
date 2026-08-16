---
SCENARIO_ID: QA-PROV-004
aliases: [QA-PROV-004]
TITLE: A tenant failing before identities and billing is still recoverable
AREA: tenant-provisioning
MODULE: services/api/test
TYPE: E2E
RISK: CRITICAL
AUTOMATION_STATUS: BLOCKED_INFRASTRUCTURE
TEST_REFERENCE: 
RELATED_BUGS: [BUG-0015]
RELATED_REGRESSIONS: [REG-013]
LAST_RUN: 
LAST_RESULT: BLOCKED
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-PROV-004 — A tenant failing before identities and billing is still recoverable

## Preconditions

A live database and Stripe in test mode.

## Steps

1. Force a failure before identity creation, then retry.
2. Force a failure between identities and billing, then retry.
3. Confirm no duplicate identity or Stripe customer results.

## Expected Result

Each retry completes provisioning exactly once. Steps inside a retryable flow are idempotent individually, not merely as a whole.

## Notes

`services/api/test/tenant-provisioning-recovery.e2e-spec.ts`. Needs a database, so blocked here.
