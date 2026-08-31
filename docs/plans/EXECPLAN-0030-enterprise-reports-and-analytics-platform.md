---
ID: PLAN-033
aliases: [PLAN-033, EXECPLAN-0030]
Title: Enterprise Reports and Analytics platform
Status: APPROVED
Session: SESSION-0087
Type: FEATURE
Size: LARGE
CreatedAt: 2026-08-31
UpdatedAt: 2026-08-31
---
# EXECPLAN-0030 — Enterprise Reports and Analytics platform

```
CONTEXT_FILES_REQUIRED:
  - .agent/context/backend-architecture.md
  - .agent/context/frontend-architecture.md
  - .agent/context/auth-rbac.md
  - .agent/context/tenant-context.md
  - .agent/context/database-prisma.md
  - .agent/context/ui-design-system.md
  - .agent/context/testing-architecture.md
  - .agent/context/agent-health.md
  - .agent/context/deployment-runtime.md
  - .agent/context/task-completion-contract.md

SPECIALIST_AGENTS_REQUIRED:
  - Architect            — owns the semantic-layer contract and reconciles the parallel streams
  - Database             — schema, migration, indexes, backfill
  - Backend/API          — semantic registry, metric registry, query engine, endpoints
  - Security             — tenant isolation, row scope, field-level security, export/schedule bypass
  - Frontend             — analytics workspace, chart primitives, builder, library
  - UI/UX                — Dashboard-vs-Reports separation, density, empty/loading/error states
  - QA                   — browser validation of every surface, permission matrix, responsive
  - Integration          — desktop-agent telemetry as a data source; email attachment plumbing
  - Reviewer             — diff review against the Security checklist
  - Integrator           — branch, PR, CI verdict, merge, develop integration
  - Release/DevOps       — main release, migration deploy, post-deploy health and validation
  - Product & Backlog    — triage of every finding this work produces
  - Knowledge & Graph    — docs, metric definitions, Obsidian sync

DELIBERATELY_NOT_USED:
  - none — this task touches every surface the roster covers.

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma
  - services/api/prisma/migrations/**
  - services/api/src/common/constants/permissions.ts
  - services/api/src/common/constants/rbac-matrix.ts
  - services/api/src/app.module.ts
  - apps/web/lib/security-keys.ts

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/doc-code-drift.md

KNOWN_MISTAKES_TO_AVOID:
  - BUG-2148 — dashboard severity conveyed by colour alone and hidden from assistive tech
  - BUG-2149 — every metric card offering a link named only "Open"
  - BUG-2010 — raw ISO-8601 timestamps rendered instead of tenant-formatted dates
  - BUG-2043 — the number of rows loaded reported as the tenant total
  - BUG-2026 — export columns that the matching import template does not accept
  - BUG-1745 — money aggregated without the reporting-currency contract
  - BUG-1654 / BUG-1752 / BUG-1559 — an empty list that does not say which kind of empty it is
  - BUG-2461 — a static route shadowed by a parameterised one declared before it

REGRESSION_ENTRIES_IN_SCOPE:
  - to be allocated on QA promotion (tenant isolation, field-level security, schedule authorization)

RELATED_OPEN_RECORDS:
  - BUG-2618 (OPEN, FIX_NOW) — "the API has no scheduler". This plan builds one.
  - ITEM-0083 (DEFERRED) — scheduled reconciliation sweep; unblocked by the same worker pattern.
  - ITEM-0048 (BLOCKED) — the xlsx advisory; this plan writes XLSX but parses none.

ADR_REQUIRED:
  - yes — the recurring-job pattern is a new shared abstraction (see Backend impact).

TARGET_BRANCH:            develop, then main
TARGET_ENVIRONMENT:       LOCAL then PRODUCTION
DEPLOYMENT_REQUIRED:      yes
DEPLOYMENT_COMPONENTS:    api | web
DEPLOYMENT_ORDER:         database -> api -> web
ROLLBACK_CLASS:           DATABASE_ADDITIVE
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  yes
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    5 ACTIVE sessions on develop (SESSION-0061, -0064, -0071, -0076, -0083);
                          none holds a lease; schema lease held by SESSION-0087.
ENVIRONMENT_DEPENDENCIES: REPORTS_SCHEDULER_ENABLED, REPORTS_ARTIFACT_RETENTION_DAYS,
                          REPORTS_WORKFORCE_SNAPSHOT_ENABLED — registered in packages/config
                          validation, turbo.json globalEnv, render.yaml, docs/environment-variables.md
```

## Objective

DijiPeople gains a Reports & Analytics capability that is a reporting *platform*, not a
second dashboard: a semantic layer over the domain schema, one authoritative definition per
business metric, a validated query engine that enforces tenant, row and field security, and a
tenant-facing workspace with analytics surfaces, a standard report library, a custom report
builder, saved views, exports and scheduled delivery. Desktop-agent telemetry becomes a
first-class, privacy-bounded data source. Adding a new metric, field or subject area afterwards
is a registry entry, not a new endpoint.

## Business requirement

The owner asked for the Reports capability to be delivered as a complete enterprise product
feature, explicitly distinguished from the Dashboard: Dashboard answers *what is happening now
and what needs my attention*; Reports answers *what happened, how is it changing, how does it
compare, and what can I extract*. Four decisions were confirmed by the owner on 2026-08-31:

1. **FACT** Release to `main` and deploy production directly — "absolute and unconditional
   permission".
2. **FACT** The workspace is enabled for **all tenants immediately**, not flagged to demo.
3. **FACT** Scheduled reports ship **fully enabled**, sending real email to validated recipients.
4. **FACT** Desktop Activity analytics is **HR/admin-only, plus employees seeing their own**;
   managers get no individual desktop telemetry by default.

## Existing behavior

**FACT** `/reports` (`apps/web/app/(authenticated)/reports/page.tsx`) is a server component that
gates on business-unit scope, then fetches four unparameterised endpoints in parallel and renders
four sections of stat cards plus a bar list. It has no filters, no date range, no comparison, no
drill-down, no export, and no `loading.tsx` or `error.tsx`.

**FACT** The API surface is `services/api/src/modules/reports/reports.controller.ts` — four GET
handlers (`headcount-summary`, `leave-summary`, `attendance-summary`, `recruitment-summary`), no
parameters, backed by a 305-line service.

**FACT** The Dashboard (`apps/web/app/(authenticated)/page.tsx` → `/dashboard/summary`) is already
richer than Reports: it carries workforce distribution, leave-by-status, leave-taken-by-type over
6 months, attendance mix over 6 months, data-quality warnings, recent activity and quick actions.
Reports currently duplicates a strict subset of it, worse.

Two defects in the current implementation must be preserved as *fixed*, not carried forward:

- **FACT** Every query in `reports.service.ts` is `where: { tenantId }` with no
  `buildScopedAccessWhere`. A `manager` holding `reports:READ` at `PARENT_CHILD_BUSINESS_UNIT`
  reads tenant-wide aggregates. This is a live row-scope leak.
- **FACT** `reports.service.ts` contains zero occurrences of `isDeleted`, while
  `employees.service.ts` filters `isDeleted: false, deletedAt: null` in every read. The Reports
  page therefore counts soft-deleted employees and disagrees with the Employees screen.

Both get bug records and are fixed by routing the legacy endpoints through the new engine.

## Existing architecture

**FACT** `modules/data/` is a real generic read layer — `entity-registry.ts` (`EntityMetadata`,
`EntityFieldMetadata` with `selectable/filterable/sortable/searchable`), `entity-query-parser.ts`,
`entity-query-validator.ts` (12 allow-listed operators), `entity-prisma.mapper.ts`, and
`entity-scope.resolver.ts` which is a thin adapter over `buildScopedAccessWhere`. It has **no
aggregation** and registers exactly one entity (`employees`). This is the thing to extend.

**FACT** `common/security/rbac-query-scope.ts` exposes `resolveEffectiveAccessLevel` and
`buildScopedAccessWhere(user, entityKey, privilege, options)`, producing a Prisma `where`
fragment per access level, field names configurable through `ScopedWhereOptions`.

**FACT** Field-level security already exists: `FieldSecurityPolicy`, `FieldSecurityRule`,
`FieldSecurityPolicyRole`, `FieldSecurityPolicyTeam`, with `tenant-settings/field-security.controller.ts`.

**FACT** `ENTITY_KEYS.REPORTS` exists in `rbac-matrix.ts` with CEO/HR/manager/payroll-manager
overrides; `MISC_PERMISSION_KEYS.REPORTS_EXPORT = 'reports.export'` exists. There is **no**
`reports.read` permission — `matrixPrivilegeToPermissionKey` maps `reports:read → employees.read`
at rbac-matrix.ts:1432.

**FACT** Background work is `setInterval` in `OnModuleInit` with a `running` re-entrancy guard;
`outbox-worker.service.ts` is the reference (env flag, `timer.unref()`), and
`data-management/data-job-worker.service.ts` shows the DB-backed claim (`updateMany` with the
current status in the `where`) and the run-as-submitter identity pattern.

**FACT** `StorageService` is local-disk only. `render.yaml` mounts a 5 GB persistent disk at
`/var/data` and states the tradeoff: the disk pins the API to a **single instance**. Async export
artifacts are therefore durable and downloadable, and a `setInterval` worker cannot double-run.

**FACT** `ExcelExportService.buildWorkbookBuffer` writes XLSX with SheetJS; parsing untrusted
workbooks uses ExcelJS deliberately. `common/utils/csv.util.ts` provides `toCsv`/`csvCell`.
`pdfkit` is used only in `contracts.service.ts`.

**FACT** Email attachments are defined on `EmailAttachment`/`EmailSendPayload` and forwarded by
`SmtpEmailProvider.send`, but are **not plumbed** through `SendTemplateEmailInput` or
`NotificationDispatchInput`. Three edits connect them.

**FACT** `apps/web` has no chart library and no chart SVG. `ChartCard` in
`dashboard-widget-renderer.tsx` carries an explicit design decision: *"Drawn with plain elements
rather than a charting library: these are ranked proportions, and a dependency would cost more
than it explains."* `apps/web/jest.config.js` is `testEnvironment: "node"`, matches `*.spec.ts`
only, and has no jsdom or testing-library.

## Requirements

1. A reporting **semantic layer**: data sources, business-named fields, dimensions, measures and
   relations, declared in code, allow-listed, with `reportable/filterable/sortable/groupable/
   aggregatable`, supported aggregations, sensitivity and permission requirements per field.
2. A **metric registry** where each metric has exactly one calculation, reused by analytics,
   reports, exports and schedules.
3. A **query engine** that resolves only registry-declared fields into Prisma, and enforces —
   in this order — tenant, row scope (`buildScopedAccessWhere`), and field-level security.
4. A reusable **filter model** and a **date/comparison engine** with presets and previous-period
   comparison, correct in the tenant's timezone.
5. **Analytics surfaces** for Workforce, Attendance, Leave, Recruitment and Desktop Activity, each
   with KPIs, visualisations, breakdown, and drill-down to underlying records.
6. A **standard report library** (code-defined) and a **custom report builder** (persisted),
   both executing through the same engine.
7. **Saved views**, favourites and recents.
8. **Exports** in CSV, XLSX and PDF, honouring identical security to the UI; async for large
   result sets with an expiring artifact.
9. **Scheduled reports** with execution-time authorization, real email delivery with attachment.
10. **Desktop Activity analytics** using only telemetry that provably exists, with neutral labels,
    HR/admin + own visibility, small-population suppression and retention-window disclosure.
11. **Workforce history** that is true going forward: a daily snapshot aggregate, plus a bounded
    backfill that is labelled as reconstructed.
12. No fake affordance: a control that cannot work is not rendered.

## Dependencies

- Schema lease `schema` (held by SESSION-0087) for the duration of the migration.
- A local throwaway database — `dijipeople_reports_test`, baselined and seeded.
- Production release authority — confirmed by the owner (see Business requirement).
- Tenant email is LIVE on production; test runs must use non-deliverable addresses.

## Files / modules affected

**Single-writer (flagged):** `services/api/prisma/schema.prisma`, `prisma/migrations/**`,
`common/constants/permissions.ts`, `common/constants/rbac-matrix.ts`, `src/app.module.ts`,
`apps/web/lib/security-keys.ts`.

**services/api** — new `src/modules/reporting/` (semantic registry, metric registry, query engine,
period engine, filter model, execution, export, schedule, worker, controllers, DTOs, specs);
edits to `modules/reports/` (legacy endpoints re-pointed at the engine); `modules/notifications/`
(attachment plumbing); `common/constants/audit-actions.ts`; `common/errors/error-catalog.ts`;
`prisma/` (migration, snapshot backfill, analytics fixture seed).

**apps/web** — new `app/(authenticated)/reports/**` (landing, analytics, library, my-reports,
builder, scheduled, drill-down, `loading.tsx`, `error.tsx`); new `app/components/charts/**`;
new `app/components/filters/**` (date range + comparison); new `app/api/reports/**` proxies;
edits to `_components/navigation.ts` + `navigation.spec.ts`, `lib/security-keys.ts`,
`lib/tenant-branding-client.ts`, `app/globals.css` (chart tokens, missing success/warning
utilities), `app/components/dashboard/dashboard-widget-renderer.tsx` (import the shared palette).

**docs** — architecture, metric definitions, API, operations, security, desktop-agent reporting;
QA plan + scenarios; knowledge notes; bug records; engineering history.

## Database impact

Additive only. No column dropped, no type narrowed, no uniqueness changed, no `NOT NULL` added to
an existing table. `ROLLBACK_CLASS = DATABASE_ADDITIVE`.

New models: `ReportDefinition`, `ReportSavedView`, `ReportFavorite`, `ReportRecentView`,
`ReportSchedule`, `ReportRun`, `WorkforceSnapshotDaily`.
New enums: `ReportVisibilityScope`, `ReportScheduleFrequency`, `ReportExportFormat`,
`ReportRunTrigger`, `ReportRunStatus`, `WorkforceSnapshotDerivation`.

Migration `20260831120000_reports_analytics_platform`, authored with
`prisma migrate diff --from-schema … --to-schema … --script` because `migrate dev` is
interactive-only in this environment.

Uniqueness includes `tenantId` everywhere: `ReportDefinition @@unique([tenantId, key])`,
`ReportSavedView @@unique([tenantId, surfaceKey, slug])`,
`ReportFavorite`/`ReportRecentView @@unique([tenantId, userId, targetKey])`,
`WorkforceSnapshotDaily @@unique([tenantId, snapshotDate, employeeId])`.

Favourites, recents, schedules and runs address either a code-defined standard report or a
persisted custom one through a single canonical `targetKey` string (`std:` / `def:` / `srf:`)
rather than nullable alternative FKs — in PostgreSQL a nullable composite unique does not
constrain, because NULLs compare distinct.

Indexes: every `(tenantId, <filter column>)` pair the surfaces sort or filter by, plus
`ReportSchedule (isEnabled, nextRunAt)` for the worker sweep, `ReportRun (status, claimedAt)` for
the claim, and `ReportRun (expiresAt)` for the artifact sweep.

**Backfill:** `prisma/backfill-workforce-snapshots.ts` — restartable, idempotent (upsert on the
composite unique), bounded (`--from`, `--to`, `--tenant`, `--batch`), logged, tenant-safe, run
manually and never at startup. It reconstructs from `hireDate`/`terminationDate` and can only
place an employee in their *current* department, so every row it writes is
`derivation = BACKFILLED` and the UI says so.

## Backend impact

New module `services/api/src/modules/reporting/`:

- `semantic/` — `data-source.registry.ts`, `field.registry.ts`, `dimension.registry.ts`,
  `relation.registry.ts`. Field descriptors extend `EntityFieldMetadata` from `modules/data`
  rather than defining a second vocabulary.
- `metrics/` — `metric.registry.ts` plus one file per subject area. Every metric declares key,
  label, description, data source, value type, calculation, supported dimensions/filters/
  comparisons, permission, and a `caveats` list rendered in the UI.
- `engine/` — `query-planner.ts`, `query-executor.ts`, `period.engine.ts`, `filter.model.ts`,
  `field-security.resolver.ts`, `scope.resolver.ts`, `population-threshold.ts`.
- `execution/` — `report-execution.service.ts`, `standard-report.registry.ts`,
  `report-definition.service.ts` (+ validator), `saved-view.service.ts`,
  `favorite.service.ts`.
- `export/` — `report-export.service.ts` (CSV/XLSX/PDF), `report-artifact.service.ts` (+ expiry sweep).
  XLSX is **written** with `ExcelExportService.buildWorkbookBuffer` (SheetJS) and no report path
  ever *parses* a workbook, which is the half of ITEM-0048 that carries the advisory. CSV cells are
  escaped against formula injection, which `csvCell` does not currently do.
- `schedule/` — `report-schedule.service.ts`, `report-scheduler.worker.ts`, `next-run.ts`.

**This is the platform's first scheduler, and that is an architecture decision, not an
implementation detail.** BUG-2618 records the absence ("abandonExpired has no caller and the API
has no scheduler") and ITEM-0083 is deferred behind it. The worker therefore ships as a reusable
recurring-job pattern — env-gated, re-entrancy-guarded, claiming rows with a conditional
`updateMany` — documented in an ADR so the next scheduled job extends it instead of inventing a
second one. Fixing BUG-2618 and ITEM-0083 themselves is **out of scope** here; they are noted as
unblocked follow-ups so the Architect can triage them separately.
- `reporting.controller.ts` + `reporting-admin.controller.ts`, `dto/`, colocated `*.spec.ts`.

Endpoints (all `@UseGuards(JwtAuthGuard, PermissionsGuard)`, static routes declared before
parameterised ones to satisfy `route-shadowing.invariant.spec.ts`):

```
GET    /reporting/catalog                     semantic catalog for this user (fields filtered)
GET    /reporting/metrics                     metric registry, permission-filtered
POST   /reporting/analytics/query             { surface, period, comparison, filters, breakdown }
POST   /reporting/analytics/records           drill-down rows, paged
GET    /reporting/reports                     library: standard + custom, visibility-filtered
POST   /reporting/reports                     create custom definition
GET    /reporting/reports/:reportId
PATCH  /reporting/reports/:reportId
DELETE /reporting/reports/:reportId
POST   /reporting/reports/:reportId/duplicate
POST   /reporting/reports/execute             run standard or custom by targetKey
POST   /reporting/exports                     queue an export run
GET    /reporting/exports/:runId              status
GET    /reporting/exports/:runId/download     StreamableFile
GET/POST/PATCH/DELETE /reporting/saved-views
GET/POST/DELETE       /reporting/favorites
GET/POST/PATCH/DELETE /reporting/schedules
POST   /reporting/schedules/:id/run-now
```

Legacy `/reports/*-summary` keep their paths and response shapes and are re-implemented on the
engine, which fixes the row-scope leak and the `isDeleted` disagreement.

Transactions: definition writes and their audit rows share one `$transaction`; a run claim is a
single conditional `updateMany`.

Money metrics go through the existing reporting-currency contract in
`docs/architecture/platform-fx-reporting.md` — only the nullable `*Reporting` columns on
`PayrollRunEmployee`/`PayrollRunLineItem` are summable across employees, rows with a null
reporting amount are excluded rather than coalesced to the local amount, and the legacy
`PayrollCycle`/`PayrollRecord` fact tables are never summed alongside `PayrollRunEmployee`.
BUG-1745 is precisely the failure this avoids.

Reused rather than reimplemented: `buildScopedAccessWhere`, `EntityMetadata`, `ExcelExportService`,
`csv.util`, `StorageService`, `AuditService`, `FeatureAccessService`, `TenantSettingsResolverService`,
`resolveLiveStatus` and `compareSemver`/`resolveUpdateStatus` from `tenant-apps.service.ts`.

## Frontend impact

`apps/web`. **The analytics surfaces are bespoke pages, deliberately.** The module runtime
(`StandardModuleRuntimeSpec` + `StandardModuleListPage`/`RecordPage`) is a record-CRUD engine —
entity, fields, forms, views, commands, record navigation. An analytics surface is a KPI grid over
cross-module aggregates with a period and comparison, and a report definition's editor is a query
builder, not a metadata form; neither is expressible as an entity spec. Per `apps/web/AGENTS.md`
this is stated here explicitly. The registries `registerModule`/`registerCommand`/
`registerEntityMetadata` are inert scaffolding (BUG-0044 / ITEM-0036) and are not called.

Routes under `app/(authenticated)/reports/`: landing, `analytics/[surface]`, `library`,
`my-reports`, `builder`, `scheduled`, plus `loading.tsx` and `error.tsx`. Sub-navigation follows
the `payroll-nav.tsx` + `payroll-layout-shell.tsx` pattern; `DashboardNavItem` stays flat.

New shared primitives: `app/components/charts/` (line, area, stacked/grouped bar, horizontal bar,
donut, funnel, sparkline, axes, legend, tooltip) built as **inline SVG**, and
`app/components/filters/` (date-range with presets, comparison selector, analytics filter bar).

**Charting decision, and why it reverses the obvious one.** No chart library is added. The
codebase already declined one in a code comment on `ChartCard`, and `apps/web`'s jest is
`testEnvironment: "node"` matching `*.spec.ts` only — a library's rendering could not be tested
here at all, whereas hand-built primitives let the geometry (scales, ticks, stacking, slice
bucketing, path generation) live in plain `.ts` modules that jest *can* reach. This mirrors the
existing technique of exporting `formatValue` from the dashboard renderer solely so a spec can
import it. The cost is real drawing code; the benefit is testable, tokenised, dark-mode-correct
output and no 7.4 MB dependency.

Reused, non-negotiably: `DataTable` (+ pagination, toolbar), `Button`, `EmptyState`, `SectionCard`,
`StatusPill`, `Dialog`, every `form-control` field, `ModuleViewSelector`, `AccessDeniedState`,
`PermissionGate`, `apiRequestJson`/`proxyApiJsonResponse`/`proxyErrorResponse`/`proxyApiFileResponse`,
and `lib/formatting-context.ts` for every date, number and currency.

Token work: add `--dp-chart-1..8` to `:root` and `@theme inline`; add the missing
`--color-success` and `--color-warning` utilities (`bg-success`/`bg-warning` are already used by
`dashboard-widget-renderer.tsx` but are not generated by the theme block); point that renderer's
`CHART_SERIES_COLORS` at the shared palette module instead of its local literal.

States: loading skeletons per surface, `error.tsx` on the `leaves` shape, `EmptyState` copy per
surface that says what would make data appear, and `AccessDeniedState` for scope and permission
denial. Filter changes update the URL (and delete `page`), following the attendance-exceptions
precedent, so a view is bookmarkable and shareable.

Responsive: charts scale to their container with `viewBox`; tables scroll inside
`overflow-x: auto`; the filter bar collapses to a sheet below `md`.

Accessibility: every chart has a text alternative and an adjacent data table; series are
distinguished by label and pattern, never colour alone; `StatusPill` carries text.

## Permission / RBAC impact

New legacy keys in `common/constants/permissions.ts` (each added to
`FOUNDATION_PERMISSION_DEFINITIONS` **and** granted to at least one role, or
`wiring-invariants.spec.ts` fails):

```
reports.read                    reports.builder.use            reports.schedule.manage
reports.definitions.manage      reports.saved-views.manage     reports.data-quality.read
desktop-analytics.read.own      desktop-analytics.read.organization
desktop-analytics.device-health.read
```
`reports.export` already exists and is reused.

New RBAC matrix entities: `ENTITY_KEYS.DESKTOP_ANALYTICS = 'desktop-analytics'` (category
Operations). `ENTITY_KEYS.REPORTS` is extended with `CREATE`/`WRITE`/`DELETE`/`SHARE` overrides.

**Landmine investigated and deliberately left alone.** `matrixPrivilegeToPermissionKey` maps
`reports:read → employees.read` (rbac-matrix.ts:1432), which looks like it must change. It must
not. `AuthAccessService.loadAccessContext` (auth-access.service.ts:202-208) independently
synthesises `<entityKey>.<privilege lowercased>` into `permissionKeys` for every non-NONE
role privilege, so a role holding `reports:READ` in the matrix **already** carries the string
`reports.read`. The 1432 mapping serves the separate legacy-bridging direction; rewriting it would
have removed the synthesised `employees.read` from every role that holds `reports:READ` and only
reaches employee data that way. The new keys are therefore added to
`FOUNDATION_PERMISSION_DEFINITIONS` and granted explicitly in `BASE_ROLE_PERMISSION_KEYS`, and
line 1432 is untouched. A spec asserts the synthesis, so the reasoning cannot rot silently.

Access levels by role — desktop analytics reflects the owner's decision:

| Role | reports:READ | reports:EXPORT | desktop-analytics:READ |
|---|---|---|---|
| global-admin / system-admin | TENANT (elevated bypass) | TENANT | TENANT |
| ceo | TENANT | TENANT | ORGANIZATION |
| hr | ORGANIZATION | ORGANIZATION | ORGANIZATION |
| payroll-manager | ORGANIZATION | ORGANIZATION | NONE |
| manager | PARENT_CHILD_BUSINESS_UNIT | NONE | **NONE** |
| employee | NONE | NONE | **SELF** |

Row scope is applied by `buildScopedAccessWhere` inside the engine, per data source, with
`ScopedWhereOptions` declared on the data source (models without `organizationId` pass
`organizationIdField: null`). Both `SELF`/`USER` and `PARENT_CHILD_BUSINESS_UNIT(S)` spellings are
handled, since both are live enum members.

`hasElevatedTenantRole` bypass is untouched and nothing is added to the elevated list.

Mirrored into `apps/web/lib/security-keys.ts` by hand (there is no generator).

## Tenant-isolation impact

Every engine query derives `tenantId` from `request.user.tenantId` only; no DTO accepts
`tenantId`, and the validator rejects a filter whose field key resolves to a tenant column. The
planner composes `where: { AND: [ { tenantId: user.tenantId }, buildScopedAccessWhere(...) , ...filters ] }`
— `buildScopedAccessWhere` is nested inside `AND`, never spread, because at TENANT level it
returns a bare `{ tenantId }` that would otherwise clobber a sibling key.

A reviewer can confirm isolation by three means: the planner has one construction site for
`where`; `reporting-tenant-isolation.e2e-spec.ts` proves tenant A cannot read tenant B through
each of query, records, execute, export, download and schedule; and a unit spec asserts the exact
`where` shape per access level, as `entity-scope.resolver.spec.ts` does today.

Export downloads re-check `tenantId` on the `ReportRun` before opening the artifact. Scheduled
runs load the owner's access context at execution time and fail closed if it cannot be loaded.
There is no platform (cross-tenant) path in this feature.

## Audit / event / logging impact

New `AUDIT_ACTIONS` entries and `AUDIT_ENTITY_TYPES` for `ReportDefinition`, `ReportSchedule`,
`ReportRun`: `REPORT_DEFINITION_CREATED/UPDATED/DELETED/DUPLICATED`, `REPORT_SHARED`,
`REPORT_EXPORTED`, `REPORT_SCHEDULE_CREATED/UPDATED/DELETED/EXECUTED`,
`SENSITIVE_REPORT_EXPORTED`, `DESKTOP_ANALYTICS_VIEWED`.

Deliberately **not** audited: ordinary chart repaints and analytics queries. Auditing every filter
change would bury the security events in noise. `REPORT_VIEWED` is recorded only as a
`ReportRecentView` upsert, which is product state, not an audit trail.

Structured logs (never containing report data or filter values that could carry personal
identifiers): execution duration, row count, data source, tenant and report id, query failures,
export generation duration and size, schedule execution outcome, snapshot job lag.

## Integration impact

Desktop agent: **consumed, not changed.** No agent build, no new telemetry, no new endpoint the
agent calls. The reporting layer reads `DailyProductivitySummary`, `WorkSession`, `ActivityEvent`,
`EmployeeDevice` and `AgentTrackingSettings` only.

Notifications: `SendTemplateEmailInput` and `NotificationDispatchInput['email']` gain
`attachments?: EmailAttachment[]`, passed through `email-execution.service.ts` to the
`EmailSendPayload` the SMTP provider already forwards. Backward compatible — the field is optional.

Gateway and Stripe: untouched.

## Migration / data compatibility

All new tables start empty; every existing query is unaffected. Already-deployed web clients keep
working because the four legacy `/reports/*-summary` paths and response shapes are preserved.
The API can ship before the web app: new endpoints simply go uncalled. The web app must **not**
ship before the API, since its pages would 404 — hence `DEPLOYMENT_ORDER: database -> api -> web`.
`WorkforceSnapshotDaily` is empty until the daily job or the backfill runs; the trend surfaces
render an empty state that says history begins accumulating from enablement, rather than a
misleading flat line.

## Parallel-safe tasks

`PARALLEL_SAFE` — chart primitives and their maths specs; the date/comparison engine and its
specs; the analytics fixture generator; documentation and metric definitions; the QA plan and
scenarios; the security threat model; web filter components.

## Dependency-blocked tasks

`DEPENDENCY_BLOCKED` — everything touching `schema.prisma`/`migrations/` (single-writer, and
blocked on the migration landing); all backend services (blocked on the regenerated Prisma
client); permissions and rbac-matrix edits (single-writer); frontend pages (blocked on the API
contract being fixed); scheduler (blocked on the attachment plumbing); backfill (blocked on the
migration).

## Integration tasks

`INTEGRATION` — wiring `ReportingModule` into `app.module.ts`; re-pointing the legacy `/reports`
endpoints at the engine; nav + security-keys mirroring; the end-to-end browser pass; the release.

## Testing strategy

Commands, all from AGENTS.md: `npm --workspace api run test`, `npm --workspace api run test:e2e`,
`npm --workspace api run check-types`, `npm --workspace api run lint`,
`npm --workspace web run test`, `npm --workspace web run check-types`,
`npm --workspace web run lint`, `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run prisma:validate`, `npm run prisma:migrate:status`, `npm run db:preflight`,
`npm run db:postflight`, `npm run validate:framework`, `npm run backlog:check`, `npm run qa:check`,
`npm run repo:health`.

New API specs: metric calculations per subject area; period/comparison boundaries including tenant
timezone and the Fri/Sat weekend default; filter validation and operator allow-listing; field
security resolution; row-scope `where` shapes per access level; report-definition validation
(unknown field, inaccessible field, unsupported aggregation, invalid relation, prohibited
grouping); schedule next-run computation across DST; desktop metric derivation including the
`SUM/SUM` re-derivation and the retention-window bound; small-population suppression.

New e2e: `reporting-tenant-isolation`, `reporting-authorization` (row and field level, plus a
manipulated definition referencing a forbidden field), `reporting-export`, `reporting-schedule`
(execution-time authorization, including a schedule whose owner lost access).

Extended existing: `wiring-invariants.spec.ts`, `rbac-matrix.*.spec.ts`,
`navigation.spec.ts`, `audit-actions.spec.ts`.

Web specs (`*.spec.ts`, node env): chart geometry and bucketing; period presets; filter
serialisation/deserialisation; report-config client validation; nav visibility.

**Fixtures:** `prisma/seed-analytics-fixture.ts` — `seed-demo` yields 15 employees, 1 attendance
entry, 1 leave request, 0 candidates and 0 telemetry, which cannot validate analytics. The
generator produces two tenants, multiple organizations/business units/departments/teams/locations,
employees across ACTIVE/PROBATION/NOTICE/TERMINATED with joiners and leavers across periods,
`AttendanceDay` rows with scheduled/worked/late minutes, leave requests across types and statuses,
a recruitment pipeline with `ApplicationStageHistory` transitions, and desktop telemetry including
devices that stop reporting. Deterministic seed, so metric assertions have exact expected values.
Dev/test only, guarded by `assert-test-database.mjs`.

Browser QA: the full §52 checklist against a locally driven stack first, then the deployed demo
tenant, with console and network error capture at 1440×900, 1920×1080 and a narrow laptop width.

## Risks

1. **Cross-tenant or cross-scope leakage through a dynamic query engine (likelihood MEDIUM,
   impact CRITICAL).** A field registry that resolves user input into Prisma is exactly the shape
   that leaks. Mitigation: no request value ever reaches a Prisma path directly; every field,
   operator, aggregation and relation is looked up in the registry and rejected if absent; one
   construction site for `where`; e2e proving isolation on every route including export and
   schedule; a spec asserting the `where` per access level.
2. **A scheduled report mailing data the recipient may not see (MEDIUM / CRITICAL).** Schedules
   run unattended and email is live in production. Mitigation: authorization is evaluated at
   execution time under the owner's freshly loaded access context, recipients are validated tenant
   users at both create and run time, and a run whose owner lost access fails rather than falling
   back to a service identity.
3. **Field-level security bypassed on an export or a manipulated definition (MEDIUM / HIGH).**
   Mitigation: the field-security resolver runs inside the engine, so UI, drill-down, export and
   schedule share one path; a definition is re-validated against the registry on every execution,
   not only on save, because a user's access can shrink after a report is saved.
4. **Desktop telemetry misread as productivity (MEDIUM / HIGH).** Mitigation: neutral labels only;
   `utilizationPercent` is never averaged across employees; the pre-BUG-0036 contamination and the
   UTC-day boundary are surfaced as metric caveats; managers get no individual telemetry;
   application-usage-by-category is not built at all because the source data does not exist.
5. **Backfilled workforce history read as observed fact (MEDIUM / MEDIUM).** Mitigation: the
   `derivation` column and a visible chart annotation.
6. **Performance on a tenant far larger than the demo (MEDIUM / MEDIUM).** Mitigation: pre-
   aggregated daily snapshot for workforce trends; `AttendanceDay` already carries per-day
   aggregates; bounded result windows and server-side pagination; measured query timings recorded
   in the plan's validation section rather than assumed.
7. **The legacy `/reports` scope fix changes numbers a manager sees (HIGH / LOW).** A manager will
   see smaller, correct figures. This is the fix, not a regression; it is recorded as a bug and
   called out in the release notes.

## Rollback considerations

Reversible. The migration is additive, so rolling back the API and web deployments to the previous
release restores previous behaviour while the new tables sit unused; no forward-only data change
is required. Dropping the tables afterwards is optional cleanup, not part of rollback.

If web ships without the API, the new routes 404 — hence the deployment order. If the API ships
without web, nothing changes for users. If the migration is applied and the API is rolled back,
the extra tables are inert.

The scheduler and the snapshot job are both behind env flags, so either can be disabled without a
deploy by unsetting `REPORTS_SCHEDULER_ENABLED` / `REPORTS_WORKFORCE_SNAPSHOT_ENABLED`.

## Definition of Done

- [ ] Semantic layer, metric registry, query engine, period engine and filter model implemented
- [ ] Analytics surfaces, report library, builder, saved views, exports and schedules implemented
- [ ] Desktop Activity analytics limited to telemetry that provably exists, with caveats surfaced
- [ ] Legacy `/reports/*-summary` preserved and re-pointed at the engine; both inherited defects fixed
- [ ] Permissions wired in **both** systems and mirrored into `apps/web/lib/security-keys.ts`
- [ ] Tenant scoping verified for every new query; field-level security applied on every path
- [ ] Audit in place for definition, share, export and schedule events; no chart-repaint noise
- [ ] Migration applied cleanly to a fresh database and to an existing one; backfill idempotent
- [ ] Analytics fixture generator produces deterministic data for two tenants
- [ ] Unit, integration, API and e2e tests written and passing; validation commands run and reported honestly
- [ ] Browser QA completed locally and against the deployed environment, including responsive widths
- [ ] No fake affordance: every rendered control works
- [ ] Docs, metric definitions and Obsidian sync updated; agent instructions updated
- [ ] Deployed to production and validated there; findings recorded as durable records and triaged
- [ ] No unrelated changes in the diff
