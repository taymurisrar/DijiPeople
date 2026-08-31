---
PLAN_ID: PLAN-034
aliases: [PLAN-034]
TITLE: Reports and analytics
AREA: reports
STATUS: CURRENT
MODULES: [services/api/src/modules/reporting, services/api/src/modules/reports, apps/web/app/(authenticated)/reports, apps/web/app/components/charts]
RISK: HIGH
COVERAGE_UNIT: GAP
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-2623, BUG-2624, BUG-2625, BUG-2626]
RELATED_REGRESSIONS: []
CREATED_AT: 2026-08-30
UPDATED_AT: 2026-08-30
VERIFIED_AGAINST_SHA: 091bb375
---

# PLAN-034 — Reports and analytics

## Scope

The reporting platform: the semantic layer and metric registry
(`modules/reporting/semantic`, `modules/reporting/metrics`), the query engine
(`modules/reporting/engine`), report execution, definitions, saved views and
favourites (`modules/reporting/execution`), exports (`modules/reporting/export`),
scheduled delivery (`modules/reporting/schedule`), the workforce snapshot job
(`modules/reporting/snapshot`), and the tenant workspace at
`apps/web/app/(authenticated)/reports` with its chart primitives.

It also covers the four legacy `GET /reports/*-summary` endpoints, which are
preserved and re-pointed at the engine.

**Deliberately excluded:** the Dashboard (`modules/dashboard`), which answers a
different question and shares no code; `/payroll/reports`, which is a separate
pre-existing tabular runner; and the DLP capture tables, which are a separate
authorization domain and are not joined into any reporting data source.

## Risks

Ranked, drawn from the records rather than from imagination.

1. **Cross-tenant or cross-scope leakage through a dynamic query surface.** A
   reporting engine that resolves client input into database queries is the exact
   shape that leaks. The mitigation — an allow-listed registry, one `where`
   construction site, and row scope taken from each source's own RBAC entity —
   is only as good as the tests that prove it.
2. **The row-scope defect this feature replaces.** `BUG-2624`: the old endpoints
   filtered on `tenantId` alone, so a `PARENT_CHILD_BUSINESS_UNIT` manager read
   tenant-wide aggregates. The fix makes their numbers *smaller*; a test must
   prove the new number matches what they can actually list.
3. **A scheduled report delivering data the recipient may not see.** Schedules run
   unattended, and tenant email is live in production. Authorization is evaluated
   at execution time under the owner's freshly loaded context; a revoked owner
   must fail the run, not fall back to something broader.
4. **Field-level security bypassed on an export or a replayed definition.** A
   stored definition outlives its author's access. Validation must run at
   execution, not only at save.
5. **`BUG-2623` — `buildScopedAccessWhere` emits a predicate on `Employee.ownerTeamId`,
   a column that does not exist.** Contained inside reporting by sanitising the
   fragment; the containment itself needs a test.
6. **Metric correctness that looks plausible and is wrong.** Averaging a per-row
   percentage; counting soft-deleted employees (`BUG-2625`); including
   `AttendanceDayStatus.PENDING` in a rate denominator; summing legacy and modern
   payroll fact tables together.
7. **Presentation misstating a true number.** `BUG-2043` (a page count reported as
   the total), `BUG-2010`/`BUG-2626` (browser locale instead of the tenant's),
   `BUG-2148` (severity by colour alone), `BUG-2149` (a link named only "Open"),
   and the bar list that scaled to the max rather than the total and floored width
   at 10%.
8. **Desktop telemetry presented as measurement when it is inference.** Nominal
   totals, a UTC day boundary, known-inflated pre-`dedupeKey` rows, and a
   retention window that silently truncates long lookbacks.

## Preconditions

- A throwaway PostgreSQL database seeded by `prisma/seed-analytics-fixture.ts`
  (`--confirm`), which refuses to run against a non-test database.
- Two tenants: the fixture tenant and its `-secondary`, which exists so isolation
  has something to prove against.
- Roles exercised: `global-admin` (elevated bypass), `ceo` (TENANT), `hr`
  (ORGANIZATION), `manager` (PARENT_CHILD_BUSINESS_UNIT), `recruiter`
  (BUSINESS_UNIT), `employee` (SELF, desktop-own only).
- For scheduled delivery: recipients must be non-deliverable
  `@demo.dijipeople.com` addresses. Tenant email is LIVE in production.
- For browser cases: the tenant workspace, signed in as an account with
  `reports.read`.

## Test Types

| Type | Applies | Notes |
|---|---|---|
| UNIT | yes | Period maths, filter validation, scope fragments, metric calculations, chart geometry. |
| API | yes | Every `/reporting/*` route, with negatives. |
| DATABASE | yes | Migration forward on a fresh database and over a seeded one; the snapshot job's idempotency. |
| INTEGRATION | yes | Export rendering, scheduled delivery with an attachment, the snapshot and backfill jobs. |
| E2E | yes | Tenant isolation and authorization across the whole surface. |
| BROWSER_E2E | yes | The workspace, filters, drill-down, builder, responsive widths. |
| SECURITY | yes | Mandatory: this area reads tenant-owned employee, attendance, leave, recruitment and workstation data. |
| PERFORMANCE | partial | Measurable against the fixture (240 employees, ~30k attendance days). Not representative of a 10,000-employee tenant; that gap is stated rather than hidden. |

## Data Requirements

`prisma/seed-analytics-fixture.ts`, deterministic and idempotent, produces per main
tenant: 240 employees across ACTIVE/PROBATION/NOTICE/TERMINATED/INACTIVE with a
four-level manager chain; 2 organizations, 4 business units (including a
parent/child pair), 8 departments, 12 teams, 4 locations; ~30,000 `AttendanceDay`
rows including 151 `PENDING` that must be excluded from rate denominators, with
weekends on **Friday/Saturday**; 525 leave requests across all four statuses
including half days; 12 job openings, 150 candidates, 200 applications and 838
`ApplicationStageHistory` transitions with 32 hires linked via
`sourceApplicationId`; 60 devices and ~4,400 daily telemetry rows including one
stale device, one outdated agent version, one orphaned session and 180 employees
with no device at all; and deliberate data-quality defects (4 employees with no
department, 5 with no location, 5 with no manager).

The generator prints derived expected values — active headcount 195, joiners and
leavers 10/10 in the last 30 days, attendance rate 89.1652%, approved leave 362
requests / 1,572 days — so metric assertions have a single source rather than
being written to match whatever the code returned.

The secondary tenant (30 employees) shares no ids with the first.

## Security Cases

Mandatory. Each must be a negative that fails loudly, not an empty result that
could equally mean "no data".

- Tenant A cannot read tenant B through `analytics/query`, `analytics/records`,
  `reports/execute`, a saved view, a favourite, an export download, or a schedule.
- A `PARENT_CHILD_BUSINESS_UNIT` manager's headcount equals the employees they can
  list, and is strictly less than the tenant total (`BUG-2624`).
- A caller without `employees:READ` gets `REPORT_SOURCE_FORBIDDEN` on the workforce
  source rather than an empty chart.
- A restricted field (compensation, `cnic`, `dateOfBirth`, candidate salary) is
  absent from `/reporting/catalog`, refused as a column, refused as a filter and
  refused as a breakdown for a caller without its permission.
- A stored definition naming a restricted field is refused **at execution** for a
  reader who lacks it, even though it saved successfully for its author.
- An export contains no column the requester could not see on screen.
- A schedule whose owner has been deactivated fails and records the reason; it does
  not run under a service identity.
- A recipient outside the tenant is refused at schedule creation.
- A manager cannot read another employee's desktop activity
  (`desktop-analytics:READ` is `SELF` for that role by owner decision).
- A desktop breakdown bucket below the population threshold is withheld, and the
  withholding is reported rather than silent.
- Report ids are UUIDs and enumeration returns `REPORT_NOT_FOUND`, not a 403 that
  confirms existence.

## Negative Cases

- Unknown `sourceKey`, unknown field key, unknown metric key.
- An operator a field does not support; a value of the wrong type; an enum value
  outside the Prisma enum; an `in` list over 200 entries; a string over 500 chars.
- A malformed date (`2026-02-30`, `yesterday`), an inverted range, a window beyond
  the 1,100-day maximum.
- A custom period missing one endpoint.
- A breakdown on a non-groupable field, or on a relation field with no
  `groupByField`.
- An unknown body field — the global pipe runs `forbidNonWhitelisted`, so this must
  be a 400.
- An export whose row count exceeds the cap must **refuse**, not truncate.
- A download of a run that is not `COMPLETED`, or belongs to another tenant.

## State Transitions

`ReportRun`: `QUEUED → RUNNING → COMPLETED | FAILED`, and `COMPLETED → EXPIRED` by
the sweep. Illegal and to be rejected: claiming a run already claimed; completing a
run that was never started; downloading anything not `COMPLETED`; a second worker
claiming the same schedule slot (the conditional `updateMany` must make exactly one
winner).

`ReportSchedule`: enabled ↔ disabled; five consecutive failures must disable it
rather than continue mailing an error.

`ReportDefinition`: soft-deactivation on delete, so schedules and run history keep
their referent. A deleted definition must not execute.

## Integration Cases

- Scheduled delivery sends an email **with the file attached** — the attachment
  path had to be plumbed through `SendTemplateEmailInput`, so this is new code, not
  an assumed capability.
- The export artifact survives being written and re-read from the persistent disk.
- The expiry sweep deletes the file and marks the run `EXPIRED`.
- The snapshot job is idempotent: running the same day twice produces the same rows.
- The backfill writes `derivation = BACKFILLED` and never `OBSERVED`, and refuses
  without `--confirm`.
- A tenant whose `historyRetentionDays` has already purged telemetry gets an honest
  partial answer with the window stated, not a silently short chart.

## Browser Cases

Tooling status: `apps/web` has **no** jsdom and no testing-library, and its jest
matches `*.spec.ts` only — component rendering cannot be unit-tested in this
workspace at all. Browser coverage is therefore genuinely browser-driven, via the
Playwright MCP session against a running stack, and the geometry beneath the charts
is unit-tested separately as plain TypeScript.

What a browser must prove: the workspace loads for each role; period, comparison
and filters change the numbers and survive a reload from the URL; a KPI drills
through to underlying records and on to a business record; the builder saves a
report that then runs; an export downloads and its contents match the screen;
empty states name *which* kind of empty; caveats and suppression notices are
visible; no console or network errors; and the layout holds at 1440×900,
1920×1080 and a narrow laptop width.

Explicitly compare `/` against `/reports`: if Reports reads as "Dashboard with more
cards", it has failed regardless of what the tests say.

## Regression Links

None yet. Regressions are promoted when the fixes for `BUG-2624` and `BUG-2625`
are verified, and when the security cases above first pass — each will own a
`REG-nnn` entry naming the spec that must fail without the fix.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Bugs — [[BUG-2623]], [[BUG-2624]], [[BUG-2625]], [[BUG-2626]]

<!-- GRAPH:END -->
