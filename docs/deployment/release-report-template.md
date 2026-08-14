# Deployment Report — <environment> — <short-sha>

> Copy to `release-history/YYYY-MM-DD-<environment>-<short-sha>.md`.
> Records are history — do not edit after the fact, except to update the final
> verdict if the release is later rolled back.

## Metadata

| | |
|---|---|
| Environment | LOCAL / PRODUCTION |
| Date / time (UTC) | |
| Release SHA | full SHA |
| Source branch | |
| Previous release SHA | for rollback and diffing |
| Agent / operator | |
| Deployment target | Render service, Vercel project, … |

## Components

| Component | Deployed? | Version / SHA | Notes |
|---|---|---|---|

## Pre-Deployment Gates

| Gate | Result | Evidence |
|---|---|---|
| Git | | SHA pushed, tree clean |
| Architecture | | components + order |
| QA | PASS / PASS WITH RISKS | link to QA run |
| Reviewer | 0 CRITICAL, 0 HIGH blockers | link |
| Database | | migration review |
| Configuration | | env verified in target |
| Build | | all affected components |
| Smoke plan | | written before deploy |

**Readiness level reached:** BLOCKED / NOT_READY / READY_WITH_RISKS /
READY_FOR_STAGING / READY_FOR_PRODUCTION

## Database Changes

| Migration | Additive / Destructive | Rollback class | Reviewed by |
|---|---|---|---|

State "none" if the release contains no migrations. Note that
`preDeployCommand` applies migrations automatically.

## Deployment Sequence

State transitions actually taken:

```
PLANNED → BUILDING → VALIDATING → READY → DEPLOYING → DEPLOYED → VERIFYING → …
```

## Deployment Results

What happened per component, including anything that failed.

## Smoke Tests

| ID | Scenario | Result | Evidence |
|---|---|---|---|

## QA Report

Path to the deployment QA run under `docs/qa/runs/`, and its verdict.

## Reviewer Status

Outstanding findings accepted into the release, and why.

## Monitoring

Error-rate observations, new `ErrorLog` fingerprints, notable `PlatformEvent`
entries, and the window observed.

## Incidents

Anything unexpected, and how it was handled. "None" is a valid entry.

## Rollback Status

Rollback class, whether rollback was exercised, and the outcome.

## Final Verdict

**SUCCESS** / **SUCCESS WITH RISKS** / **FAILED** / **ROLLED_BACK**

## Knowledge Updated

Files written under `docs/knowledge/`, with categories.

## Obsidian Sync

`SYNCED` / `SKIPPED_NO_LOCAL_CONFIG` / `FAILED — <reason>`.

A sync failure never invalidates a successful deployment.
