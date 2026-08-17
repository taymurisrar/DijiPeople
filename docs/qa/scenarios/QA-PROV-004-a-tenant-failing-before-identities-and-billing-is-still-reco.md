---
SCENARIO_ID: QA-PROV-004
aliases: [QA-PROV-004]
TITLE: A tenant failing before identities and billing is still recoverable
AREA: tenant-provisioning
MODULE: services/api/test
TYPE: E2E
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/test/tenant-provisioning-recovery.e2e-spec.ts
RELATED_BUGS: [BUG-0015]
RELATED_REGRESSIONS: [REG-013]
LAST_RUN: 2026-08-17
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-17
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

The named suite passed against ephemeral PostgreSQL in GitHub Actions run
`32009837400`. A local checkout may still lack a safe database, but the durable
scenario is automated and runnable.
