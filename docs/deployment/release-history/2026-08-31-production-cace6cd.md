# Deployment Report — PRODUCTION — cace6cd

## Metadata

| | |
|---|---|
| Environment | PRODUCTION |
| Date / time (UTC) | 2026-08-31 02:37 → 02:44 |
| Release SHA | `cace6cdb0f207dcd73f0e4085d9e9172bb8c141d` |
| Source branch | `develop` (PR #64), tip `e5258e80d91b7c2ca7ef117434203ec8cc59daef` |
| Previous release SHA | `c603abeacedeef52d08d27689438ef9788bbc656` |
| Agent / operator | Architect, on the owner's standing authorisation to release |
| Deployment target | Render `dijipeople-api` (`srv-d7js7fqqqhas739v4i7g`); Vercel `diji-people-web` |

The merge commit's **tree is byte-identical** to the CI-verified commit:

```
main tree     af4386945072c3806a68578d227609bb7a941fc4
e5258e80 tree af4386945072c3806a68578d227609bb7a941fc4
git diff --name-only e5258e80 origin/main   -> (empty)
```

That equality is the point of recording it: `main` is a merge commit that CI
never ran against by SHA, so the SHA alone proves nothing. The tree does.

## Components

| Component | Deployed? | Version / SHA | Notes |
|---|---|---|---|
| API (`services/api`) | yes | `cace6cdb` | Render, auto-deploy on `main`; `preDeployCommand` applied migrations |
| Web (`apps/web`) | yes | `cace6cdb` | Vercel production, ready 02:44 |
| Admin, Landing | not changed by this release | — | rebuilt by their own projects |
| Agent desktop, Gateway | no | — | untouched |

## Pre-Deployment Gates

| Gate | Result | Evidence |
|---|---|---|
| Git | PASS | `develop` tip equal to the CI-verified SHA by ref-push |
| Architecture | PASS | EXECPLAN-0030, 15 work packages |
| QA | PASS WITH RISKS | [`2026-08-31-reports-analytics-platform-96ff155`](../../qa/runs/2026-08-31-reports-analytics-platform-96ff155.md) |
| Reviewer | PASS | 0 CRITICAL, 0 HIGH outstanding |
| Database | PASS | additive only; applied to a fresh database with the full 225-migration history |
| Configuration | **PARTIAL — see below** | four `REPORTS_*` vars were absent from the live service |
| Build | PASS | 14/14 CI jobs green on `e5258e80`, across three independent runs |
| Smoke plan | PASS | `/api/health` commit check, then the workspace in a real browser |

**Readiness level reached:** READY_FOR_PRODUCTION

### The configuration gate is the one worth reading

`render.yaml` declares the four `REPORTS_*` variables with literal values, and
it is **not synced to this service**. Thirteen of the sixteen literal-valued
keys it declares are absent from the live environment:

```
declared and live     NODE_ENV, APP_ENV, OUTBOX_WORKER_ENABLED
declared but MISSING  FILE_STORAGE_DIR, PLATFORM_ENVIRONMENT, TRUST_PROXY_HEADERS,
                      OUTBOX_WORKER_POLL_INTERVAL_MS, OUTBOX_WORKER_BATCH_SIZE,
                      SEAT_OVERAGE_*, TENANT_RETENTION_DAYS, EMAIL_*
```

Both new workers are off unless their flag is `true`, so the feature would have
shipped with scheduled delivery silently never running and headcount history
silently never accumulating — with no error anywhere, because "disabled" is
logged at `LOG` level and production surfaces only `WARN` and above.

The four variables were set on the service directly (80 → 84) before the
container started. `FILE_STORAGE_DIR` was deliberately **not** set: it is
missing today for every existing upload too, and changing it would relocate
where all existing files are read from. That is a pre-existing platform
question, not this release's to answer.

## Database Changes

| Migration | Additive / Destructive | Rollback class | Reviewed by |
|---|---|---|---|
| `20260830…_reporting_platform` | Additive | `DATABASE_ADDITIVE` | Database + Reviewer |

7 tables, 6 enums, 31 indexes. No column dropped, no type narrowed, no unique
constraint changed. All seven tenant-owned tables registered in
`TENANT_ERASURE_DELETE_ORDER`.

`preDeployCommand` applied them in 3m30s. Render aborts the deploy if
pre-deploy fails and leaves the current version live, which is the safety net
that stood in for a pre-flight `migrate status` against production — reading the
production `DATABASE_URL` was refused by the environment's permission policy and
was not worked around.

## Deployment Sequence

```
PLANNED → CI VERIFIED (e5258e80, 3 green runs)
        → MERGED (#64, tree-identical)
        → CONFIG (4 env vars set)
        → BUILDING 02:37 → PRE_DEPLOY 02:40 → DEPLOYING 02:43
        → LIVE 02:44 → VERIFYING → REPAIR REQUIRED
```

## Deployment Results

Clean. `dep-daaehkuq1p3s73973keg` reached `live` in 7m21s with no retry, and
`/api/health` moved from `c603abea` to `cace6cdb`.

## Smoke Tests

| ID | Scenario | Result | Evidence |
|---|---|---|---|
| D1 | Deployed commit is the released commit | PASS | `/api/health` → `cace6cdb0f207…` |
| D2 | Migrations applied | PASS | pre-deploy completed; no `P2022` on any reporting screen |
| D3 | `/reports` renders for a tenant owner | PASS | 5 analytics surfaces, 16 standard reports, 0 console errors |
| D4 | A standard report returns real rows | PASS | Employee Directory, 12 rows × 12 columns, relations resolved |
| D5 | Dates render in the tenant's format | PASS | `03/10/2025`, never ISO |
| D6 | Analytics surface renders with the filter engine | PASS | Workforce, period + comparison + 4 scope filters |
| D7 | An empty surface explains itself | PASS | "No workforce movement in this period", cause named |
| D8 | No console error on the workspace | PASS | `/reports` → 0 errors, all API calls 200 |
| D9 | No console error on a report runner | **FAIL** | React #418 — BUG-2647 |
| D10 | No horizontal overflow at 1440 | **FAIL** | `scrollWidth` 1646 vs 1440 — BUG-2648 |

D9 and D10 are why this stage exists. Both were found by opening the deployed
application and measuring it, and neither was reachable from any local gate: the
hydration mismatch needs a production build plus a real server render, and 1440
was simply not one of the three widths local QA measured.

## QA Report

Pre-deploy: [`2026-08-31-reports-analytics-platform-96ff155`](../../qa/runs/2026-08-31-reports-analytics-platform-96ff155.md) — PASS WITH RISKS.

Post-deploy validation is recorded here rather than as a separate run, and its
two findings are durable records: [[BUG-2647]] and [[BUG-2648]], fixed in the
follow-up release.

## Reviewer Status

No CRITICAL or HIGH accepted into the release.

## Backlog and Bug References

| ID | Title | Effect of this release |
|---|---|---|
| [[BUG-2624]] | Reports endpoints ignored the caller's row scope | **Fixed and VERIFIED.** A scoped reader's numbers get smaller — that is the correction |
| [[BUG-2625]] | Headcount counted soft-deleted employees | **Fixed and VERIFIED** |
| [[BUG-2623]] | `buildScopedAccessWhere` emits `ownerTeamId` on `Employee` | Contained within reporting; the shared helper is **still affected**. Shipped open, knowingly |
| [[BUG-2626]] | Dashboard numbers use the visitor's browser locale | Shipped open; out of scope, same family as BUG-2647 |
| [[BUG-2647]] | Reporting formatters omit the tenant context | **Introduced by this release**, found validating it, fixed in the follow-up |
| [[BUG-2648]] | Reports pages scroll sideways at 1440 | **Introduced by this release**, found validating it, fixed in the follow-up |

Two open records ship alongside: BUG-2623 (HIGH, contained) and BUG-2626
(MEDIUM). Both are decisions, and both are visible here rather than implied.

## Engineering History

[`docs/engineering-history/tasks/`](../../engineering-history/tasks/) — TASK-0028.

## Verdict

**RELEASED, THEN REPAIRED.**

The platform shipped correctly: migrations applied, the workspace works, the
numbers reconcile with the database, and the two defects this release *fixed*
are verified in production. Two new presentation defects were introduced and
caught by validating the deployment rather than by trusting it, and are
corrected in the release that follows this one.
