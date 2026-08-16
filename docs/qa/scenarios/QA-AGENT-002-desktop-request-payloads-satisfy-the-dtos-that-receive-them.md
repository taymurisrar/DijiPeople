---
SCENARIO_ID: QA-AGENT-002
aliases: [QA-AGENT-002]
TITLE: Desktop request payloads satisfy the DTOs that receive them
AREA: agent-desktop
MODULE: apps/agent-desktop
TYPE: INTEGRATION
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/src/modules/agent/agent-client-contract.spec.ts
RELATED_BUGS: [BUG-0034]
RELATED_REGRESSIONS: [REG-026]
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-AGENT-002 — Desktop request payloads satisfy the DTOs that receive them

## Preconditions

None — a static contract check across two workspaces.

## Steps

1. For each request the desktop client issues, take the payload shape.
2. Validate it against the DTO that receives it.

## Expected Result

Every payload validates. `forbidNonWhitelisted` turns an extra field into a 400,
so a DTO change that looks additive breaks every installed agent.

## Notes

The `cross-workspace-contract-drift` pattern. The desktop app is deployed to machines nobody can redeploy on demand.
