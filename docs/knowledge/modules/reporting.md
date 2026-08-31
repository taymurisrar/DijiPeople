# Reporting

> Generated from repository evidence at `091bb375`.

## Purpose

The Reports & Analytics platform. Looks like a screen; behaves like a query
compiler with a security model attached.

It exists because `/reports` was a weaker copy of the Dashboard — four
unparameterised endpoints, no period, no comparison, no filters, no drill-down, no
export — and because two of those endpoints were quietly wrong.

## Main API / services

`services/api/src/modules/reporting/`, in four layers:

- `semantic/` — the allow-list of data sources and fields.
- `metrics/` — one authoritative calculation per business metric.
- `engine/` — period resolution, filter validation, row scope, field security,
  small-population suppression, and the single `planWhere` that assembles a query.
- `execution/`, `export/`, `schedule/`, `snapshot/` — the surfaces.

Routes live under `/reporting`. The four legacy `GET /reports/*-summary` endpoints
keep their paths and response shapes and are re-pointed at the engine.

The canonical contract is [[reports-and-analytics]]; metric-by-metric definitions
are [[reports-metric-definitions]].

## Authorization

Three checks, composed, each answering a different question.

`reports.read` plus `ENTITY_KEYS.REPORTS` decide whether someone may open the
workspace. **Which rows come back is decided by a different entity entirely** —
each data source declares its own `rbacEntityKey`, so workforce rows are scoped by
`employees:READ`, attendance by `attendance:READ`, recruitment by
`candidates:READ`.

That is the single most important design decision in the module. A reporting
surface scoped by its own permission would be a way around every scope the rest of
the product enforces; scoped by the data's own entity, a recruiter sees exactly the
employees they would see on the Employees screen, and cannot see more by asking a
chart instead of a list.

Field-level security runs on **every execution**, not only at save. A stored report
outlives its author's access: someone builds a report including salary while they
hold the permission, then loses it. Validated only at save, that report would keep
delivering salary — to them, and through a schedule to other people — indefinitely.

## Important business rules

**Nothing a client sends becomes a Prisma key.** Every field, operator,
aggregation and relation is resolved through the registry and rejected if absent.
`semantic-registry.spec.ts` walks `Prisma.dmmf` and asserts every declared path
actually exists, so a typo fails a test rather than producing a 500.

**A ratio is a ratio of sums, never an average of ratios.** Averaging
`DailyProductivitySummary.utilizationPercent` across employees is a ratio of ratios
and is a different, wrong number. It is a distinct calculation kind so that the
correct form is the easy one to reach for.

**Periods resolve in the tenant's timezone, and ranges are half-open.** An
inclusive `lte` on a timestamp silently drops everything after midnight on the
final day. `previous_period` shifts by the window's own length; `previous_month`
aligns on the calendar and may change length — different questions, and conflating
them is how a 31-day month appears to have grown against a 30-day one.

**Metric caveats are part of the metric.** A denominator that is agent uptime
rather than scheduled hours, a UTC day boundary, a reconstructed trend segment — a
number shown without its caveat is a misleading number, so the API returns them and
the UI renders them.

**Desktop analytics is bounded by what the agent actually captures.** Application
usage by category, per-app duration and browser domains are **not built**: the
schema has a raw `activeApp` string and no category table, so building them would
mean presenting inference as measurement. Clipboard and screenshot capture are
never joined into a data source at all — a *count* of an employee's clipboard
events is itself surveillance output. Labels stay neutral: Active time, Idle time,
Telemetry coverage; never Productive or Efficiency.

**Workforce history only becomes true from the day the snapshot job runs.**
`Employee` has no slowly-changing history, so a reorg rewrites the past. Backfilled
rows are marked `derivation = BACKFILLED` because they can only place someone in
their *current* department — the column is what lets a chart admit which part of a
line is reconstructed.

## Known bugs

[[BUG-2624]] — the old endpoints filtered on `tenantId` alone, so a
`PARENT_CHILD_BUSINESS_UNIT` manager read tenant-wide aggregates. Fixed by routing
them through the engine.

[[BUG-2625]] — the old headcount never filtered `isDeleted`, so Reports and
Employees disagreed. Fixed by the workforce source's `baseWhere`.

[[BUG-2623]] — `buildScopedAccessWhere` emits a predicate on `Employee.ownerTeamId`,
a column `Employee` does not have. Contained inside reporting by sanitising the
fragment against columns each source declares; the shared helper still needs its
own plan, because changing it moves row visibility in five modules.

[[BUG-2626]] — dashboard numbers render in the visitor's browser locale rather than
the tenant's. Deferred; out of this module's scope.

## Regressions

None yet. Promoted when the fixes for BUG-2624 and BUG-2625 are verified and the
security cases in [[PLAN-034]] first pass.

## Related

[[reports-and-analytics]] · [[rbac]] · [[multi-tenancy]] · [[employees]] ·
[[attendance]] · [[ADR-0004]] · [[TASK-0028]] · [[PLAN-034]]
