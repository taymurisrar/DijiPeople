# Engineering History — Reports analytics platform

| | |
|---|---|
| **Task Title** | Reports analytics platform |
| **Task Type** | FEATURE (the platform) followed by BUGFIX (the post-deploy repair) |
| **Date** | 2026-08-31 |
| **Architect Plan** | [`EXECPLAN-0030`](../../plans/EXECPLAN-0030-enterprise-reports-and-analytics-platform.md) (PLAN-033), decomposed into 15 work packages under [`TASK-0028`](../../tasks/TASK-0028-enterprise-reports-and-analytics-platform.md) |
| **Agents Used** | Architect, Backend/API, Frontend, UI/UX, Database, Security, Integration, QA, Reviewer, Integrator, Release/DevOps, Product & Backlog Steward, Knowledge & Graph. No specialist was skipped that the work needed; the desktop-agent surface was read-only, so no agent modified `apps/agent-desktop` |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/reports-analytics-platform-fixes` |
| **Base SHA** | `cace6cdb0f207dcd73f0e4085d9e9172bb8c141d` |
| **Final Task SHA** | `d833e69490ac6d36c22c4d84d33f3646690f2206` |
| **Target Branch** | `main` |
| **Merge Commit** | `dae0e370cad316ef9e4e4ac7cd9c9791bcffec53` (PR #65) |
| **Final Target SHA** | `dae0e370cad316ef9e4e4ac7cd9c9791bcffec53` — tree byte-identical to the CI-verified `d833e694` |

### Commits

```
1139f81b fix(reports): repair two defects post-deploy validation exposed
5d1d5e7a Merge main into develop after the reports release
d833e694 fix(reports): the caveat panel said the same thing twice
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c22889ab [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/dijipeople-reports                    d833e694 [agent/reports-analytics-platform-fixes]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

58 file(s) against `origin/main`.

```
M	.agent/context/component-index.md
M	apps/web/app/(authenticated)/reports/_components/analytics-breakdown-card.tsx
M	apps/web/app/(authenticated)/reports/_components/analytics-surface-view.tsx
M	apps/web/app/(authenticated)/reports/_components/analytics-trend-card.tsx
M	apps/web/app/(authenticated)/reports/_components/metric-tile.tsx
M	apps/web/app/(authenticated)/reports/_components/my-reports-workspace.tsx
M	apps/web/app/(authenticated)/reports/_components/report-builder-workspace.tsx
M	apps/web/app/(authenticated)/reports/_components/report-list.tsx
M	apps/web/app/(authenticated)/reports/_components/report-records-table.tsx
M	apps/web/app/(authenticated)/reports/_components/report-runner-view.tsx
M	apps/web/app/(authenticated)/reports/_components/reports-landing.tsx
M	apps/web/app/(authenticated)/reports/_components/reports-layout-shell.tsx
M	apps/web/app/(authenticated)/reports/_components/scheduled-reports-list.tsx
A	apps/web/app/(authenticated)/reports/_lib/formatting-and-layout-invariants.spec.ts
M	apps/web/app/components/charts/area-chart.tsx
M	apps/web/app/components/charts/bar-chart.tsx
M	apps/web/app/components/charts/chart-frame.tsx
M	apps/web/app/components/charts/donut-chart.tsx
M	apps/web/app/components/charts/funnel-chart.tsx
M	apps/web/app/components/charts/horizontal-bar-list.tsx
M	apps/web/app/components/charts/line-chart.tsx
M	apps/web/app/components/charts/sparkline.tsx
M	docs/backlog/completed.md
M	docs/backlog/index.md
M	docs/backlog/open.md
M	docs/bugs/BUG-2624-the-reports-endpoints-return-tenant-wide-aggregates-regardle.md
M	docs/bugs/BUG-2625-reports-headcount-counts-soft-deleted-employees-and-disagree.md
A	docs/bugs/BUG-2647-reporting-record-tables-and-metric-tiles-format-without-the-.md
A	docs/bugs/BUG-2648-reports-pages-scroll-sideways-at-1440-because-grid-items-can.md
A	docs/bugs/BUG-2657-analytics-caveat-panels-list-the-same-note-twice-in-differen.md
A	docs/deployment/release-history/2026-08-31-production-cace6cd.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-REPORTING-001-reporting-row-scope-narrows-by-the-caller-access-level.md
A	docs/qa/scenarios/QA-REPORTING-002-reporting-scope-sanitiser-fails-closed-on-an-unverifiable-pr.md
A	docs/qa/scenarios/QA-REPORTING-003-reporting-headcount-excludes-soft-deleted-employees.md
A	docs/qa/scenarios/QA-REPORTING-004-reporting-pages-never-scroll-the-document-sideways.md
A	docs/qa/scenarios/QA-REPORTING-005-reporting-formatters-always-receive-the-tenant-context.md
A	docs/qa/scenarios/QA-REPORTING-006-analytics-caveat-panel-lists-each-note-once.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-034-reports.md
M	docs/qa/test-plans/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	services/api/src/modules/reporting/metrics/attendance.metrics.ts
M	services/api/src/modules/reporting/metrics/desktop.metrics.ts
M	services/api/src/modules/reporting/metrics/leave.metrics.ts
M	services/api/src/modules/reporting/metrics/recruitment.metrics.ts
A	services/api/src/modules/reporting/semantic/caveat-uniqueness.spec.ts
A	services/api/src/modules/reporting/semantic/caveats.ts
M	services/api/src/modules/reporting/semantic/data-sources/attendance.source.ts
M	services/api/src/modules/reporting/semantic/data-sources/desktop-activity.source.ts
M	services/api/src/modules/reporting/semantic/data-sources/index.ts
M	services/api/src/modules/reporting/semantic/data-sources/leave.source.ts
M	services/api/src/modules/reporting/semantic/data-sources/recruitment.source.ts
A	services/api/src/modules/reporting/semantic/workforce-soft-delete.spec.ts
```

## Conflicts

None.

Both integrations into `develop` were fast-forwards, and both merges into
`main` were clean. That is not luck: `develop` was ref-pushed to the exact
CI-verified SHA rather than merged, so its tip could not drift from what CI
verified, and `main` was reconciled back into the task branch before the second
release rather than left to collide later.

## Conflict Resolutions

None required.

One decision belongs here even though it was not a merge conflict. `main` is a
merge commit that CI never ran against by SHA, so the SHA alone proves nothing
about what was deployed. Both releases were therefore verified by comparing
`main`'s **tree** against the CI-verified commit's tree — identical in both
cases, with an empty `git diff --name-only`. Choosing to trust the SHA instead
would have meant deploying a commit no gate had ever seen.

## QA

| | |
|---|---|
| **QA Report** | [`2026-08-31-reports-analytics-platform-96ff155`](../../qa/runs/2026-08-31-reports-analytics-platform-96ff155.md) — **PASS WITH RISKS**. Post-deploy validation is recorded in the two deployment reports |
| **Bug IDs** | Fixed and VERIFIED: BUG-2624, BUG-2625. Introduced by this task, found post-deploy, fixed and verified in production: BUG-2647, BUG-2648, BUG-2657. Created and deferred: BUG-2623 (contained), BUG-2626, BUG-2662 (pre-existing, not reporting) |
| **Backlog Items** | None created. Six regressions promoted: REG-380 … REG-385. Six QA scenarios created: QA-REPORTING-001 … QA-REPORTING-006 |

## CI

| | |
|---|---|
| **CI Run ID** | `33355434501` for the repair release (`d833e694`); `33350531645` for the feature release (`e5258e80`) |
| **CI Result** | PASS. Each SHA carried three independent green runs of all 14 jobs, and each verdict was read on the exact SHA merged |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

The merged tree is byte-identical to the verified tree in both releases, so the
branch suites describe the merged result exactly. What was run *against the
deployed environment* is the part that matters, and it is where every remaining
defect was found:

| Check | Result |
|---|---|
| Deployed commit at `/api/health` | `dae0e370…`, matching `main` |
| React #418 on a report runner | 0 console errors |
| Server HTML date format | 12 tenant-format dates, 0 fallback |
| Horizontal overflow | 6 pages × 4 widths → 0 overflowing |
| Caveat panel duplication | 13/13, 13/13, 12/12, 6/6 unique |
| Workforce snapshot worker | 12 rows for 08/30/2026, `OBSERVED` |
| XLSX export | built, downloaded, 22,118 bytes, `PK\x03\x04` |
| Unauthenticated `/api/reporting/catalog` | 401 `AUTH_TOKEN_MISSING` |
| Reporting routes | all 13 render |

Branch suites at the merged tree: API 6,326 / 297 suites, web 1,524 / 67, 7
DB-backed isolation tests, framework 4,868 checks, lint 0 errors across four
workspaces, both typechecks clean.

## Release / Deployment Impact

Deployed to **production**, twice, under the owner's standing authorisation.

| | |
|---|---|
| Feature release | `cace6cdb` — [record](../../deployment/release-history/2026-08-31-production-cace6cd.md). Rollback class `DATABASE_ADDITIVE` |
| Repair release | `dae0e370` — [record](../../deployment/release-history/2026-08-31-production-dae0e37.md). Rollback class `CODE_ONLY` |

Rolled out to all tenants immediately, per the owner's decision. Four
`REPORTS_*` environment variables were set on the Render service directly,
because `render.yaml` is not synced to it.

## Knowledge Capture

- [`docs/knowledge/modules/reporting.md`](../../knowledge/modules/reporting.md) — module knowledge for the new area
- [`docs/architecture/reports-and-analytics.md`](../../architecture/reports-and-analytics.md) and [`reports-metric-definitions.md`](../../architecture/reports-metric-definitions.md)
- [`ADR-0004`](../../decisions/ADR-0004-recurring-background-jobs-in-the-api-process.md) — recurring background jobs in the API process
- Regressions REG-380 … REG-385 and scenarios QA-REPORTING-001 … 006

The durable lessons are in the section below and in the regression register's
Note fields, which is where a future agent actually reads them.

## Obsidian Sync

Ran. 23 notes written, 1,177 already current, 6 skipped as empty by the
empty-note policy.

`knowledge:verify` reports `OBSIDIAN_SYNC_STATUS = PASS`: 1,200 graph nodes,
0 orphans, 0 stale nodes, 0 provenance or status mismatches, 32 standalone notes
explicitly allowed. Manual notes untouched.

## Cleanup

The task worktree `D:/My Work/hrm-dijipeople/dijipeople-reports` is removed
through `scripts/remove-worktree.mjs`, never `git worktree remove` — that
command follows the `node_modules` junction and has previously deleted
thousands of tracked files out of the user's primary checkout.

The primary checkout was returned to exactly its recorded baseline: one
pre-existing untracked file, `tenant-settings-reader-coverage.spec.ts`, which
belongs to the user and was never touched. Playwright writes screenshots and
snapshots into the repository root and refuses a scratchpad path, so those were
moved out after each browser session and the checkout re-checked.

Throwaway databases `dijipeople_reports_test` and `dijipeople_reports_fresh`
are dropped. `dijipeople_fixture_test` was **left alone**: its name is generic,
six other sessions are active on this machine, and dropping a database another
session may still be using is not a cleanup. The populated `dijipeople`
development database was never touched.

## What Was Asked

Deliver Reports & Analytics as a complete enterprise product capability — explicitly not a dashboard redesign, a set of hard-coded statistic cards, or a proof of concept — and carry it through fifteen stages ending in a deployed, validated, and if necessary repaired production feature.

Four decisions were the owner's: deploy through to `main` under standing authorisation; roll out to all tenants immediately; build scheduled reports fully enabled; and restrict individual desktop telemetry to HR/admin with employees seeing their own.

## What Was Built

A reporting platform rather than a second dashboard. The separation the brief demanded is enforced in the product's own words — every analytics surface states what the Dashboard shows and what this shows instead.

- **A semantic layer** over the domain schema: 12 data sources, ~250 allow-listed fields. Report fields resolve through this registry and nothing else, so a custom report cannot become a data-exfiltration interface.
- **A metric registry** with one authoritative calculation per business metric, as a closed union of calculation kinds.
- **A query engine** composing tenant, row and field security, a period/comparison engine (half-open ranges, DST- and offset-safe), a filter engine, and small-population suppression that removes buckets rather than zeroing them.
- **The workspace**: five analytics surfaces, 16 standard reports, a custom report builder, saved views, favourites, recents, CSV/XLSX/PDF exports with expiring artifacts, and scheduled email delivery.
- **The platform's first recurring scheduler**, recorded as ADR-0004.

Charts are hand-built inline SVG. That reversed an early lean toward a chart library, on two pieces of evidence: the codebase had already declined one in a comment on `ChartCard`, and `apps/web` runs jest with no jsdom, so a library's output could not be tested where the rest of the app is tested.

## What Was Deliberately Not Built

Application usage by category, per-application duration and browsing domains were **not** implemented, because the data does not exist: `ActivityEvent` carries a raw process name with no category table and no duration column. Clipboard and screenshot capture were never joined into any data source. Turnover by reason, headcount as-of a past date, leave balance as-of, offer-accept rates and interview scheduling metrics were refused for the same reason — no source of truth.

Inventing any of these would have produced a number that looked authoritative and meant nothing. The absences are stated on the surfaces themselves rather than hidden.

## Key Decisions

**Row scope uses each data source's own `rbacEntityKey`, not `reports`.** `reports.read` opens the workspace; the data's owning entity decides the rows. This is what stops a reporting surface becoming a second, weaker authorization system.

**Permission keys were collapsed onto derivable ones.** Bespoke multi-segment keys are not produced by the matrix synthesis, and `PermissionBootstrapService` runs at tenant provisioning rather than at deploy — so every existing tenant would have been refused. Verified live that HR sees the desktop metrics without reseeding.

**`periodScoped: false`** on `workforce`, `leave_balances` and `desktop_devices`. Without it "headcount" silently meant "hired in this window".

## What Went Wrong, And What It Cost

Seventeen defects were found and fixed during the task. Four are worth carrying forward.

**The sanitiser widened instead of failing closed.** Dropping an unverifiable predicate from an `AND` leaves the tenant-wide remainder. Unknown predicates are now *replaced* with a poison pill, which narrows inside an `OR` and fails closed inside an `AND`. Three sources had been exposed at business-unit level.

**Then the same sanitiser denied everything.** Its `knownColumns` read the raw options a source declared while `buildScopedAccessWhere` applies defaults, so every source not naming `businessUnitIdField` was poisoned and every sub-tenant reader saw zero rows. Found from a live API returning headcount `0` — not from a test, because every fixture user in the DB-backed isolation suite was tenant-level, the one scope where the bug is invisible. **A security test that exercises only the widest role proves the least.**

**A QA script reported "0 problems" over a broken page.** Its console filter included `hydration-mismatch`, so the "Unexpected error" dialog covering every analytics page was filtered out of its own report. The screenshot caught what the counter hid. Reading the artifact, not the pipeline.

**Post-deploy validation found three more defects that no local gate could have caught** — a hydration mismatch needing a production build plus a real server render, a horizontal overflow at a viewport width local QA had not measured, and a caveat panel that visibly repeated itself. Deploying and then actually opening the thing is a distinct activity from testing it, and it earned its place here.

## Validation

| | |
|---|---|
| API tests | 6,326 across 297 suites |
| Web tests | 1,524 across 67 suites |
| DB-backed isolation | 7 against real PostgreSQL |
| Framework validation | 4,868 checks |
| Lint | 0 errors in all four workspaces |
| Migrations | 225 applied to a fresh database |
| Browser | 13 pages, local and production |

Verified against a live database rather than a double: headcount reconciles with the database and its breakdown sums; a standard report returns real rows with relations resolved; an XLSX export downloads and validates by magic bytes; `/api/reporting/catalog` returns 401 unauthenticated.

## What A Future Agent Should Know

**`render.yaml` is not synced to the Render service.** Thirteen of its sixteen literal-valued keys are absent from the live environment. Both new workers are off unless their flag is `true`, and "disabled" is logged at `LOG` level, which production suppresses — so the feature would have shipped silently inert with no error anywhere. Never assume a variable declared in `render.yaml` is set.

**Render captures a deploy's environment when the deploy is created**, not when the container starts. Env vars set after a deploy has begun do not reach that container.

**Tailwind v4 emits `min-width:calc(var(--spacing) * 0)`, not `min-width:0`.** Grepping built CSS for the literal value suggests a utility was never generated when it was.

**A near-duplicate test that compares prefixes is worth nothing.** The first version of the caveat-uniqueness test compared a 60-character prefix and passed on the broken tree, because the shipped pair diverged at the fourth word. It was caught only by deliberately reverting the fix to confirm the test failed — and it did not.

