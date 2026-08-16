---
SCENARIO_ID: QA-DEPLOY-001
aliases: [QA-DEPLOY-001]
TITLE: Deployment smoke checks answer against the deployed environment
AREA: deployment-release
MODULE: scripts
TYPE: DEPLOYMENT_SMOKE
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: scripts/smoke-deployment.mjs
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 
LAST_RESULT: NOT_RUN
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-DEPLOY-001 — Deployment smoke checks answer against the deployed environment

## Preconditions

A deployed environment and its base URL.

## Steps

1. Run `node scripts/smoke-deployment.mjs` against the environment.
2. Record each check and its result.

## Expected Result

Every check either passes or is reported as `NOT_OBSERVED` with a reason. Nothing is inferred from the deployment having been triggered.

## Notes

A merge is Git state, not deployed state. This scenario exists to keep those separate.
