# Reports and Analytics

This is the canonical contract for the reporting platform: the semantic layer,
the metric registry, the query engine, and how tenant, row and field security
compose inside them. It describes how reporting **works**; the definition of each
metric — what it counts and what it cannot — is
[`reports-metric-definitions.md`](reports-metric-definitions.md).

It is not about the Dashboard. `modules/dashboard` answers *what needs attention
now*; this answers *what happened, how is it changing, and what can I extract*.
The two deliberately do not share code, because they do not share a question.

---

## The shape of it

```
                     Prisma schema
                          │
        ┌─────────────────┴──────────────────┐
        │        semantic layer              │   modules/reporting/semantic
        │  data sources · fields · dimensions│
        └─────────────────┬──────────────────┘
                          │
        ┌─────────────────┴──────────────────┐
        │        metric registry             │   modules/reporting/metrics
        │  one calculation per business metric│
        └─────────────────┬──────────────────┘
                          │
   ┌──────────────────────┴───────────────────────┐
   │                query engine                  │   modules/reporting/engine
   │  period → filters → row scope → field security│
   └──────────────────────┬───────────────────────┘
                          │
   ┌──────────┬───────────┼────────────┬──────────┐
   │ analytics│  reports  │  exports   │ schedules│   modules/reporting/{execution,export,schedule}
   └──────────┴───────────┴────────────┴──────────┘
```

| Surface | Route | Backed by |
|---|---|---|
| Analytics surfaces | `POST /reporting/analytics/query` | `AnalyticsService` |
| Drill-down records | `POST /reporting/analytics/records` | `AnalyticsService.records` |
| Report library | `GET /reporting/reports` | `ReportExecutionService.library` |
| Run a report | `POST /reporting/reports/execute` | `ReportExecutionService.run` |
| Custom report CRUD | `/reporting/reports/*` | `ReportDefinitionService` |
| Saved views | `/reporting/saved-views` | `SavedViewService` |
| Favourites, recents | `/reporting/favorites`, `/reporting/recents` | `ReportFavoriteService` |
| Legacy summaries | `GET /reports/*-summary` | preserved; re-pointed at the engine |

---

## Who owns what

There is exactly one owner for each decision. Adding a second one is a regression
even if it compiles.

| Decision | Owner |
|---|---|
| Which data sources exist, and their Prisma models | `modules/reporting/semantic/data-sources/index.ts` |
| Which fields are reportable, filterable, groupable, restricted | each `*.source.ts` |
| What a business metric *means* | `modules/reporting/metrics/metric.registry.ts` |
| What a period resolves to, in the tenant's timezone | `engine/period.engine.ts` |
| Whether a filter is legal, and how it becomes Prisma | `engine/filter.model.ts` |
| How a `where` is assembled | `engine/query-planner.ts` — one function, `planWhere` |
| Which rows a caller may read | `engine/scope.resolver.ts` |
| Which fields a caller may see | `engine/query-planner.ts` — `visibleFields` |
| When a bucket is too small to show | `engine/population-threshold.ts` |
| Whether a stored report is still valid for its reader | `execution/report-definition.validator.ts` |
| Artifact retention | `export/report-artifact.service.ts` |
| When a schedule next runs | `schedule/next-run.ts` |

---

## The semantic layer

A report is described in business terms and resolved into Prisma in exactly one
place. **Nothing a client sends ever becomes a Prisma key.** A field key, a filter
operator, an aggregation and a relation are each looked up in the registry and
rejected if absent.

That allow-list *is* the security model of the query engine. A dynamic reporting
surface that interpolates request values into a query is not a feature with a
vulnerability; it is an exfiltration interface with a UI. So:

- `REPORT_DATA_SOURCES` is a `ReadonlyMap` built at module load, with no dynamic
  registration, no merging of tenant-supplied entries, and no lookup that falls
  back to the request.
- A duplicate source key throws at module load rather than silently shadowing.
- `semantic-registry.spec.ts` walks `Prisma.dmmf` and asserts every model,
  relation hop and scalar path actually exists — so a typo in a string path fails
  a test instead of producing a 500 in production.

### Why field metadata reuses `modules/data`'s vocabulary

`ReportFieldDefinition` extends the `selectable` / `filterable` / `sortable`
shape that `modules/data/entity-registry.ts` already uses, rather than inventing a
second one, and adds what reporting needs and record listing does not:
`groupable`, `aggregatable`, `supportedAggregations`, `sensitivity` and
`permission`.

### Grouping through a relation

Prisma `groupBy` only accepts scalar columns on the model being grouped. So
"headcount by department" is `groupBy(['departmentId'])` with names resolved in a
second query — which is what the old `reports.service.ts` did by hand. A field
that is groupable *and* reached through a relation must declare `groupByField`
(the scalar FK), `labelLookup` (how to turn it into a name) and `nullLabel` (what
to show when it is null). The registry spec enforces all three.

---

## The metric registry

One authoritative calculation per business metric. The dashboard, a KPI tile, a
report column, an export and a scheduled email must not be able to disagree about
what "headcount" means, so a caller names a metric and never supplies a
calculation.

`ReportMetricCalculation` is a closed union. One member is worth calling out:

```ts
{ kind: 'ratio', numerator, denominator, asPercent }
```

**A ratio is a ratio of sums, never an average of ratios.** Averaging
`DailyProductivitySummary.utilizationPercent` across employees is a ratio of
ratios and is a different, wrong number. Making the correct form its own
calculation kind is what stops the wrong one being the easy one to reach for.

Metrics carry `caveats[]`, and those are load-bearing rather than decorative — a
denominator that is agent uptime rather than scheduled hours, a day boundary that
is UTC rather than the tenant's, a trend segment that was reconstructed. The API
returns them and the UI renders them. A metric shown without its caveat is a
misleading number.

---

## Security

Three independent checks, composed. Each answers a different question.

### 1. May this caller use reporting at all?

`@Permissions('reports.read')` plus `@RequirePermission(ENTITY_KEYS.REPORTS, 'read')`
on every handler. `PermissionsGuard` requires **all** declared legacy keys and
**at least one** matrix privilege.

### 2. Which rows?

**Not** `reports:READ`. Each data source declares its own `rbacEntityKey` —
`employees` for workforce, `attendance` for attendance, `candidates` for
recruitment — and `ReportScopeResolver` builds the row filter from that.

This composition is the point. A recruiter holding `reports:READ` sees exactly the
employees they would see on the Employees screen. The reporting surface can never
be a route around a scope the rest of the product enforces, and that property is
structural rather than something each endpoint has to remember.

`buildScopedAccessWhere` is nested inside `AND`, never spread: at `TENANT` level it
returns a bare `{ tenantId }` that would overwrite a sibling key if merged.

The fragment is then **sanitised against the columns each source declares**.
`buildOwnedRecordWhere` unconditionally adds `{ ownerTeamId: { in: teamIds } }` for
a caller who belongs to any team, and `Employee` has no such column — see
[`BUG-2623`](../bugs/BUG-2623-buildscopedaccesswhere-filters-employee-on-ownerteamid-a-col.md).
Predicates naming an undeclared column are dropped and logged. Dropping a term
from an `OR` can only narrow a result set, so this cannot leak; an entirely
emptied fragment fails closed with the same poison-pill id the `NONE` level uses.

### 3. Which fields?

`visibleFields()` removes any field whose `sensitivity` is `RESTRICTED` unless the
caller holds its declared `permission`. Restricted fields are absent from the
catalog, refused as columns, refused as filters, and refused as breakdowns.

**This runs on every execution, not only at save time.** A stored report outlives
the access of whoever saved it: someone builds a report including salary while
they hold the permission, then loses it. Validated only at save, that report would
keep delivering salary — to them, and through a schedule to other people —
indefinitely.

### Small populations

An aggregate over two people is not an aggregate; it is those two people with a
coat of arithmetic. `population-threshold.ts` withholds buckets below a threshold
on the desktop sources, where the data is about a person's workstation. The bucket
is **removed rather than zeroed** — rendering zero is a lie that looks like data
and still reveals that a small group exists — and the count of withheld buckets is
returned so the surface can say plainly that something was withheld.

Workforce headcount is deliberately **not** suppressed: a three-person department
is not a secret, and suppressing it would break every ordinary HR report.

---

## Periods and comparison

`period.engine.ts` is pure and timezone-explicit.

- Boundaries are resolved in the **tenant's** timezone via `Intl`, not by adding a
  fixed offset — an offset is wrong for half the year in any zone observing DST,
  and reporting windows routinely straddle the change. The old
  `/reports/attendance-summary` used `new Date(); setHours(0,0,0,0)`, which is the
  *server's* midnight.
- Instant ranges are **half-open** (`{ gte: start, lt: end }`). An inclusive `lte`
  on a timestamp column silently drops everything after midnight on the last day.
- `previous_period` shifts by the window's own length; `previous_month` aligns on
  the calendar and may therefore change length. Those are different questions, and
  conflating them is how a 31-day month appears to have grown against a 30-day one.
- `addMonths` clamps: 31 January minus one month is 28 or 29 February, never 3 March.

---

## Workforce history

`Employee` carries no slowly-changing history. `departmentId`, `businessUnitId`,
`teamId`, `managerEmployeeId` and `employmentStatus` are mutable current state, so
a reorg silently rewrites every historical breakdown. Compensation *is*
effective-dated and schedule *is*; org placement is not.

`WorkforceSnapshotDaily` fixes this **going forward**: one row per employee per
day, written by a daily job, `upsert` on `(tenantId, snapshotDate, employeeId)` so
re-running a day is idempotent.

A bounded backfill reconstructs earlier days from `hireDate`/`terminationDate`, but
it can only place an employee in their *current* department and cannot see a status
that flipped and flipped back. Every backfilled row is therefore
`derivation = BACKFILLED`, and the UI says which part of a line is reconstructed.
That column is the difference between an honest chart and a confident wrong one.

---

## Desktop activity

Built only on telemetry that provably exists: `DailyProductivitySummary`,
`WorkSession`, `EmployeeDevice`, `AgentTrackingSettings`.

**Not built, because the source data does not exist:** application usage by
category, per-application duration, and browser domains. `ActivityEvent` stores a
raw `activeApp` string and a window title; there is no category table and no
duration column anywhere in the schema. Building those would mean inventing a
taxonomy and presenting inference as measurement.

**Never surfaced, though it exists:** `ClipboardCaptureEvent`, `ScreenCaptureEvent`
and `DlpAlert`. These are a separate authorization domain (`dlp.review`), default
off in every tenant, and a *count* of an employee's clipboard events is itself
surveillance output. They are not joined into a reporting data source at all.

Labels are neutral — Active time, Idle time, Session time, Telemetry coverage —
and never Productive, Efficiency or Productivity score. The existing
`utilizationPercent` column is surfaced as "active share of agent uptime", with the
caveat that its denominator is how long the agent ran, not how long the person was
scheduled to work.

Three caveats ship with every desktop metric: the day boundary is **UTC** and does
not line up with the tenant's attendance day; totals are **nominal**
(`samples × heartbeatInterval`), not measured elapsed time; and rows written before
the `ActivityEvent.dedupeKey` fix are known-inflated and were never corrected
(`ITEM-0032`).

Lookbacks are bounded by the tenant's `AgentTrackingSettings.historyRetentionDays`
(default 90), which is actively enforced by deletion. The platform deliberately
does **not** keep a longer-retention copy: that would circumvent the tenant's own
retention policy, which is a privacy regression rather than a feature.

---

## Exports and schedules

Exports run through the same engine as the screen — same tenant predicate, same
row scope, same field security. An export that bypassed any of those would be the
whole feature's failure mode.

- CSV cells are guarded against formula injection (`=`, `+`, `-`, `@`, tab, CR),
  which the shared `csvCell` in `common/utils/csv.util.ts` does not do.
- XLSX is **written** with SheetJS through `ExcelExportService`; no reporting path
  ever *parses* a workbook, which is the half of `ITEM-0048` carrying the advisory.
- Row counts are capped and the cap **refuses** rather than truncating.
  `data-management`'s exporter silently stops at 10,000 rows, producing a file that
  looks complete and is not.
- Artifacts expire and are swept. `DataJob.resultFileKey` has no expiry and its
  files accumulate on the disk forever.

Schedules evaluate authorization **at execution time**, under the owner's freshly
loaded access context. If that context cannot be loaded — deactivated user,
revoked access — the run fails and is recorded as failed; it never falls back to a
service identity. Revoking someone's access must stop their schedules leaking, not
leave a standing export of data they can no longer see arriving monthly.

The recurring-job pattern itself is [`ADR-0004`](../decisions/ADR-0004-recurring-background-jobs-in-the-api-process.md).

---

## Production configuration checklist

1. `REPORTS_SCHEDULER_ENABLED=true` — without it, schedules are editable but
   nothing is delivered.
2. `REPORTS_WORKFORCE_SNAPSHOT_ENABLED=true` — without it, headcount history stops
   accumulating. Existing rows are unaffected.
3. `REPORTS_ARTIFACT_RETENTION_DAYS` — default 7.
4. The API must keep its persistent disk. Export artifacts live on it, and the disk
   is also what pins the service to a single instance.
5. Run `backfill-workforce-snapshots` once per tenant to seed history. It is
   restartable, idempotent, bounded and refuses to run without `--confirm`.

---

## Tests

| What | Where |
|---|---|
| Period, comparison, DST, month-end clamping | `modules/reporting/engine/period.engine.spec.ts` |
| Every field path resolves against `Prisma.dmmf` | `modules/reporting/semantic/semantic-registry.spec.ts` |
| Metric calculations reference real fields | `modules/reporting/metrics/metric-registry.spec.ts` |
| CSV formula-injection safety | `modules/reporting/export/csv-safety.spec.ts` |
| Artifact tenant isolation and expiry | `modules/reporting/export/report-artifact.service.spec.ts` |
| Next-run across DST and month ends | `modules/reporting/schedule/next-run.spec.ts` |
| Chart geometry, shares, stacking, bucketing | `apps/web/app/components/charts/chart-geometry.spec.ts` |
| Cross-tenant isolation on every route | `services/api/test/reporting-tenant-isolation.e2e-spec.ts` |
| Row and field authorization | `services/api/test/reporting-authorization.e2e-spec.ts` |

Fixtures come from `prisma/seed-analytics-fixture.ts` — deterministic, idempotent,
two tenants, 240 employees, ~30k attendance days, a recruitment funnel with stage
history, and desktop telemetry including deliberate gaps. `seed-demo` produces one
attendance row and zero candidates, which cannot validate analytics.
