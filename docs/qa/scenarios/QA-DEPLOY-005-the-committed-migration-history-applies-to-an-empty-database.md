---
SCENARIO_ID: QA-DEPLOY-005
aliases: [QA-DEPLOY-005]
TITLE: The committed migration history applies to an empty database
AREA: deployment-release
MODULE: scripts
TYPE: DATABASE
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

# QA-DEPLOY-005 — The committed migration history applies to an empty database

## Preconditions

An empty PostgreSQL instance — CI provides one; this checkout does not.

## Steps

1. Apply every committed migration to an empty database.
2. Confirm the schema reports fully migrated.
3. Run `seed:config` then `seed:verify`.

## Expected Result

The history applies cleanly and the seeds verify. This is exactly what a new deployment does, so a failure here is a failure to deploy at all.

## Notes

The `database-migration` CI job is this scenario. `verify-database.mjs` is the entry point; never weaken a migration to make it green.
