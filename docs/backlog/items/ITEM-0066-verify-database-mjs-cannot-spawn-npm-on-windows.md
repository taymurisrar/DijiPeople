---
ID: ITEM-0066
aliases: [ITEM-0066]
Title: verify-database.mjs cannot spawn npm on Windows
Type: TECH_DEBT
Status: DEFERRED
Priority: P3
Severity: LOW
AffectedModules: [scripts]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation: TASK-0008 WP-08
TargetMilestone:
BlockedBy:
---

# ITEM-0066 — verify-database.mjs cannot spawn npm on Windows

## Summary

`scripts/verify-database.mjs` prepares a database for the e2e suites — assert
ephemeral, generate, migrate deploy, migrate status, seed config, verify seed.
Every one of those steps after the first fails on Windows.

It shells out with `execFileSync('npm', [...])` and no `shell: true`. On Windows
`npm` is `npm.cmd`, and `execFileSync` will not resolve a `.cmd` without a shell,
so the very first `run()` dies. The script reports it honestly —
`DB_FAILURE_CLASS = TEST_INFRA_FAILURE`, `stage: Prisma generate` — which is
what made it quick to diagnose, but it names the stage rather than the cause, so
the obvious reading is "Prisma is broken" when the same command run by hand
succeeds in twelve seconds.

## Why it is deferred rather than fixed

CI runs on `ubuntu-latest`, so nothing gated is affected. The cost falls
entirely on a developer or agent running the database-backed suites locally on
Windows, and the workaround is to run the four npm scripts by hand in order —
which is what the WP-08 QA campaign did.

Fixing it is a one-line change (`shell: true`, or invoke `node` against the
resolved bin directly), but the *right* fix is to check whether the other
repo-level scripts have the same shape rather than patching one and leaving
five. That is a sweep, not a drive-by inside an onboarding parent.

## What it costs while deferred

Local database-backed QA on Windows needs the steps run manually, and the error
points at the wrong thing. An agent that trusts the stage name will go looking
at Prisma, find it working, and lose time before noticing the spawn.

## Proposed Resolution

Audit every `execFileSync` / `spawnSync` in `scripts/` that names `npm`, `npx`
or another `.cmd` shim, and give them all the same Windows-safe invocation. Add
a note to the failure output distinguishing "the step failed" from "the step
could not be started" — the two send a reader to entirely different places.

## Evidence

```
$ node scripts/verify-database.mjs
── Assert the target database is ephemeral
OK — localhost:5432/dijipeople_wp08_test is an ephemeral test database.

── Prisma generate

DB_FAILURE_CLASS = TEST_INFRA_FAILURE
stage: Prisma generate

$ npm --workspace api run prisma:generate
✔ Generated Prisma Client (v7.9.1) in 12.34s
```

`scripts/verify-database.mjs:86` — `run('Prisma generate', 'npm', [...])`.

## Related Items

- [[TASK-0008]] — found while preparing the WP-08 QA campaign.
