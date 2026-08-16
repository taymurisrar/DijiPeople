---
SCENARIO_ID: QA-DEPLOY-002
aliases: [QA-DEPLOY-002]
TITLE: No URL is hardcoded where configuration is required
AREA: deployment-release
MODULE: scripts
TYPE: UNIT
RISK: HIGH
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: scripts/check-no-hardcoded-urls.mjs
RELATED_BUGS: [BUG-0026]
RELATED_REGRESSIONS: [REG-016]
LAST_RUN: 2026-08-16
LAST_RESULT: PASS
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
---

# QA-DEPLOY-002 — No URL is hardcoded where configuration is required

## Preconditions

None — static check.

## Steps

1. Scan the apps and the API for literal hosts.
2. Confirm each is either genuinely constant or read from configuration.

## Expected Result

No literal localhost or environment-specific host survives where the value differs per environment.

## Notes

The `silent-config-fallback` pattern produced production emails linking to localhost.
