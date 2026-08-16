---
SCENARIO_ID: QA-DEPLOY-003
aliases: [QA-DEPLOY-003]
TITLE: The running API exposes the commit it was built from
AREA: deployment-release
MODULE: services/api/src/config
TYPE: UNIT
RISK: MEDIUM
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/config/deployed-commit.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-DEPLOY-003 — The running API exposes the commit it was built from

## Preconditions

A build carrying the commit SHA, and one without it.

## Steps

1. Read the health surface for a build with the SHA present.
2. Read it for a build without.

## Expected Result

The SHA is exposed when known, and its absence is reported as unknown rather than omitted. Without it `DEPLOYED_SHA` cannot be read and every drift check is `UNKNOWN`.

## Notes

Closes the read half of `ITEM-0010`. `DEPLOYMENT_DRIFT_STATUS` depends on this being present.
