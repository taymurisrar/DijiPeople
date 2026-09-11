# DBQ — Database access patterns and query performance

Audit area: how the application actually queries Postgres — connection
management, N+1 and loop-driven queries, unbounded reads, over-fetching,
transaction shape, index support for real query shapes, search/sort/filter
cost, and reporting-vs-transactional load. Schema shape and indexes-as-declared
are a separate specialist's territory; this report only flags an index when a
*specific application query* lacks the index it needs, or has one it doesn't.

**Cross-referenced, not duplicated, per the briefing:** RES-01 (default pool,
waits forever), RES-02 (payroll inline per-employee), RES-09 (239/241
`$transaction` on the default 5s timeout), RES-15 (payslip numbering, up to 101
sequential queries/employee), ORCH-04 (~26 round trips per authenticated
request), ORCH-05 (business-unit table read unbounded and filtered in memory).
Where this report goes deeper on one of those, it says so explicitly.

**Live facts used as given (not re-derived):** Postgres 17 on Neon,
autoscaling 0.25–2 CU, `pooler_enabled: false` (direct connection, no
PgBouncer), scale-to-zero disabled, ~130 MB today, single Render instance in
`us-east-1`, co-located with the Neon compute.

---

## 1. Connection management

### DBQ-01 — The runtime connection is confirmed direct (non-pooled); the pool itself is undersized only relative to itself, not to Neon's ceiling

- **Category:** Performance / Connection management
- **Severity:** LOW (informational — quantifies RES-01, does not replace it)
- **Confidence:** CONFIRMED
- **Known:** NEW (the computation; the underlying pool-config gap is RES-01)
- **Component:** `services/api/src/common/prisma/prisma.service.ts`,
  `docs/deployment/platform-access.md`
- **Evidence:**
  `prisma.service.ts:24-31`:
  ```ts
  const connectionString = process.env.DATABASE_URL?.trim();
  ...
  super({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn'] : [],
  });
  ```
  No `max`, no `connectionTimeoutMillis` — this is RES-01's finding, confirmed
  independently by the same read. What DBQ adds: `docs/deployment/platform-access.md:201,232-234`
  states, and ORCH-10 confirms live, that `DATABASE_URL` in production is
  currently the **direct** endpoint (`pooler_enabled: false`), so `PrismaPg`
  opens a plain `pg.Pool` straight to Postgres with `pg`'s own default
  `max: 10`.
- **Current behaviour / computation:** One Render instance → one `pg.Pool` →
  at most 10 physical connections held by the API at any moment (RES-01 already
  covers what happens when those 10 are all busy: unbounded queueing). Neon's
  published non-pooled connection ceiling scales with compute size; even at the
  bottom of this project's autoscaling range (0.25 CU) it is documented in the
  low hundreds, and at the top of the range (2 CU) several times that. A single
  instance's hard-coded 10 is therefore nowhere near Neon's connection ceiling
  today — **the binding constraint is the pool's own size (RES-01), not
  Neon's limit.** A second Render instance, added with no other change, would
  open a second independent 10-connection pool (each `PrismaService` is
  process-local); at 20 total connections the platform would *still* be far
  under Neon's ceiling at any autoscaling tier. Horizontal scaling is safe from
  a raw-connection-count perspective; RES-10's concurrency-safety concerns
  (duplicate worker execution) are the actual blocker to scaling out, not the
  connection ceiling.
- **Expected behaviour:** Documented, not just computed — the pool `max` should
  be set with Neon's ceiling for the *minimum* autoscaling tier (0.25 CU) as
  the design constraint, since a scale-down event can happen at any time
  (`suspend_timeout_seconds: 0` only disables suspend, not autoscaling between
  0.25 and 2 CU).
- **Risk:** None distinct from RES-01. Documented here so remediation of RES-01
  is not blocked by an unfounded worry about Neon's connection ceiling, and so
  a future decision to run 2+ instances is evaluated against RES-10 (the real
  blocker) rather than re-litigating connection headroom that already exists.
- **Remediation:** Fold into RES-01's remediation. When sizing `max`, use the
  0.25 CU tier's ceiling as the design floor, not the 2 CU tier's.
- **Difficulty:** N/A (informational)
- **Regression risk:** N/A
- **Fix now:** NO — informs RES-01, does not replace it.

### Healthy connection-management findings (see also the Healthy section)

- No `new PrismaClient()` anywhere in `services/api/src` outside the shared
  `PrismaService` — `grep -rn "new PrismaClient(" services/api/src` matches
  nothing. The only other constructions are one-off CLI scripts under
  `services/api/prisma/*.ts` (seeding, legal publishing) and e2e test
  bootstraps under `services/api/test/`, none of which run inside the live API
  process.
- `main.ts:42` calls `app.enableShutdownHooks()`, so `PrismaService.onModuleDestroy`
  (`prisma.service.ts:147-149`, `await this.$disconnect()`) actually fires on a
  graceful shutdown rather than leaking the pool.
- Migration connections are deliberately kept separate from the runtime
  connection (`services/api/prisma.config.ts`), and the drift between them is
  itself documented and tracked (BUG-0086, `docs/deployment/platform-access.md`
  "Known drift" section) — this is a case where a past connection-management
  bug was fixed and the fix's residual risk was written down rather than
  assumed closed.

---

## 2 & 5. N+1 / loop-driven queries, and transaction shape

### DBQ-02 — Notification fan-out is O(rules × recipients) sequential round trips, inline on the triggering request

- **Category:** Performance / N+1
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/notifications/notifications.service.ts`
- **Evidence:**
  `notifications.service.ts:645-751` — nested loop, rules outer, recipients
  inner:
  ```ts
  for (const rule of rules) {
    const recipientUserIds = await this.resolveRecipients({...});   // 1 query
    ...
    const template = await this.notificationsRepository.findNotificationTemplate({...});  // 1 query
    ...
    for (const recipientUserId of recipientUserIds) {
      const existing = await this.notificationsRepository.findActiveNotificationByDedupeKey({...});  // 1 query
      if (existing) continue;
      ...
      created.push(await this.notificationsRepository.createTrackedNotification({...}));  // 1 query
    }
  }
  ```
  The recipient set is not bounded — `resolveRoleRecipients`
  (`notifications.service.ts:1195-1220`) runs:
  ```ts
  const users = await this.prisma.user.findMany({
    where: { tenantId: input.tenantId, userRoles: { some: { role: { tenantId: input.tenantId, ...roleWhere } } } },
    select: { id: true },
  });
  ```
  with no `take`, and is reached whenever a rule's `recipientResolverType` is
  `HR_ROLE`, `MANAGER_ROLE` or `CUSTOM_ROLE` — i.e. exactly the rules that
  target "all HR admins" or "all managers of X", which is where recipient
  counts are largest.
- **Current behaviour:** `emit()` is the single entry point every
  state-changing module calls to notify (leave approval, payroll events,
  contract signatures, onboarding steps, etc. — `grep -rn "notificationsService.emit("`
  across `services/api/src/modules` returns call sites in a dozen modules). For
  R matching rules and N total resolved recipients, `emit()` issues
  `R × (1 template lookup) + R (resolveRecipients queries, 0-1 each) + ΣN (1
  dedupe check + up to 1 insert)` sequential round trips, synchronously, on the
  HTTP request that triggered the event. A tenant with 20 HR/manager-role users
  matched by 2 rules is 2 + 2 + 40 (dedupe) + up to 40 (insert) = roughly 84
  sequential DB round trips inside one `leave.approve` or `payrollRun.finalize`
  request, none of them batched.
- **Expected behaviour:** Batch the dedupe check with one `findMany({ where: {
  dedupeKey: { in: [...] } } })` per rule instead of one `findFirst` per
  recipient, and batch the inserts with `createMany`. Recipient resolution
  should be capped or paged for role-based resolvers, since an unbounded
  `HR_ROLE`/`MANAGER_ROLE` result set is itself the amplifier.
- **Risk:** Every business event with a role-based notification rule pays a
  request-latency cost linear in tenant headcount for that role, and the
  connection stays checked out (RES-01's pool) for the whole sequence. This is
  the database-query half of RES-06 (the synchronous SMTP half); together they
  mean a single leave approval, on a tenant with a normal-sized HR team, can
  hold one of the API's 10 pooled connections for the sum of ~80+ round trips
  plus however many of those recipients also get a synchronous email (RES-06).
- **Remediation:** In `notifications.service.ts:645-751`: (1) batch-check
  dedupe keys with one `findMany` per rule instead of N `findFirst` calls; (2)
  batch-insert with `createMany` (accepting that `createMany` cannot return the
  created rows, so callers needing them re-`findMany` once); (3) cap
  `resolveRoleRecipients` or paginate it for very large role assignments.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW — the dedupe semantics are unchanged, only batched.
- **Fix now:** YES

### DBQ-03 — The onboarding list issues a tenant-wide `employee.count()` for every row on the page

- **Category:** Performance / N+1
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/onboarding/onboarding.service.ts`
- **Evidence:**
  `onboarding.service.ts:186-193` (`findOnboardings`, the list endpoint):
  ```ts
  return {
    items: await Promise.all(
      items.map((item) => this.mapOnboardingWithReadiness(item)),
    ),
  ```
  `mapOnboardingWithReadiness` (`:1198-1210`) calls
  `getOnboardingReadinessBlockers` (`:992`), which for any onboarding that is
  not top-level calls `canSkipReportingManager` (`:1322-1339`):
  ```ts
  private async canSkipReportingManager(onboarding) {
    if (isTopLevelOnboarding(onboarding)) return true;
    const employees = await this.prisma.employee.count({
      where: {
        tenantId: onboarding.tenantId,
        isDeleted: false,
        isDraftProfile: false,
        ...(onboarding.employeeId ? { id: { not: onboarding.employeeId } } : {}),
      },
    });
    return employees === 0;
  }
  ```
- **Current behaviour:** `GET /onboardings` (a standard paginated list, default
  page size per `OnboardingQueryDto`) issues one `employee.count()` scanning
  **every active, non-draft employee in the tenant** for each non-top-level row
  on the page — this check exists only to answer "is this the tenant's very
  first employee", yet it re-derives that answer per row instead of once per
  request.
- **Expected behaviour:** Compute `isTenantFirstEmployee` once per request
  (outside the per-item map), not once per onboarding row.
- **Risk:** Linear in page size × tenant employee count. At a 20-row page on a
  2,000-employee tenant this is 20 full tenant-employee counts per list-screen
  load — wasted work that scales with the wrong variable (tenant size, not
  page size).
- **Remediation:** In `findOnboardings`, compute
  `const isFirstEmployee = await canSkipReportingManagerForTenant(tenantId)`
  once before the `Promise.all`, and pass the boolean into
  `getOnboardingReadinessBlockers` instead of having each row re-derive it via
  `canSkipReportingManager`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

### DBQ-04 — Timesheet bulk-import confirmation runs an unbounded per-row loop, up to 4 queries per row, inside one interactive transaction on Prisma's default 5-second timeout

- **Category:** Performance / Transactions / N+1
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW (deepens RES-09, which already flags the default-timeout
  surface generally but does not name this call site)
- **Component:** `services/api/src/modules/timesheets/timesheets.service.ts`
- **Evidence:**
  `timesheets.service.ts:780-868`:
  ```ts
  await this.prisma.$transaction(async (tx) => {
    for (const row of preview.rows) {
      if (!row.payload || row.severity === 'error') continue;
      let timesheet = await this.timesheetsRepository.findMONTHLYTimesheet(..., tx);   // 1
      if (!timesheet) {
        timesheet = await this.timesheetsRepository.createTimesheet({...}, tx);        // 1
      } else {
        await this.timesheetsRepository.updateTimesheet(..., tx);                       // 1
      }
      const existingEntry = await this.timesheetsRepository.findEntryByDate(..., tx);  // 1
      if (existingEntry) {
        await this.timesheetsRepository.updateTimesheetEntry(..., tx);                 // 1
      } else {
        await this.timesheetsRepository.createTimesheetEntry({...}, tx);               // 1
      }
    }
  });
  ```
  No `{ timeout: ... }` option is passed to this `$transaction` call, so it
  inherits Prisma's default 5-second interactive-transaction timeout (the same
  default RES-09 documents). `preview.rows` comes from a parsed import file
  with **no row-count cap** found anywhere in `timesheets.service.ts` or
  `PayslipQueryDto`-style DTOs for this endpoint (`grep -n "MAX.*ROW\|rows.length"`
  over the file finds no cap); the only indirect limit is the API's default
  1 MB request-body cap (`main.ts:158-186`), which an `.xlsx`/`.csv` file with a
  few thousand short data rows fits inside easily.
- **Current behaviour:** Confirming a timesheet import performs up to 4
  sequential round trips per row, all inside one transaction. At a
  conservative 10 ms/round-trip (matching RES-02's own estimate for the same
  Neon connection), 4 queries/row means the transaction starts risking the 5 s
  default timeout at roughly **125 rows** — a single tenant importing a
  quarter's worth of daily entries for a modest team (e.g. 20 employees × 65
  working days = 1,300 rows) is an order of magnitude past that. When the
  timeout fires, Prisma aborts the whole transaction: every row committed so
  far in that `$transaction` call is rolled back (interactive transactions are
  all-or-nothing), so the import fails **entirely**, including the rows that
  had already succeeded, with an opaque "transaction expired" error rather than
  a partial-success report.
- **Expected behaviour:** Either (a) pass an explicit, generous `{ timeout:
  ... }` sized to a realistic worst-case row count, or (b) — better, since (a)
  still fails atomically for a large-enough import — commit each row (or a
  chunk of rows) in its own short transaction and report partial success/failure
  per row the way the `data-management` `DataJobWorkerService` already does
  (`import-execution.service.ts:273-350`, chunked with `CHUNK_SIZE` and no
  enclosing transaction across chunks).
- **Risk:** A whole-batch, all-or-nothing failure for any timesheet import
  above roughly a hundred rows, indistinguishable to the end user from a bug in
  their data — it succeeds identically for a small pilot import and fails for
  the production-sized one the pilot was meant to de-risk. This is the same
  failure *class* as BUG-0900 (CRITICAL, provisioning) and RES-02 (payroll):
  a loop's cost scales with row count, but the timeout budget does not.
- **Remediation:** Follow `import-execution.service.ts`'s pattern: commit in
  bounded chunks (a few hundred rows) with each chunk in its own short
  transaction, track `processedRows`/`failedRows` on the import batch row, and
  drop the single enclosing transaction. If atomicity across the whole batch is
  a genuine product requirement, pass an explicit `timeout` proportional to
  `preview.rows.length` instead, with a hard cap on importable row count.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — changes the failure semantics from
  all-or-nothing to partial-success, which is the correct behaviour but is a
  visible contract change for the import-confirmation screen.
- **Fix now:** YES

### DBQ-05 — `bcrypt.hash` (CPU-bound, ~100–300 ms at cost factor 12) runs synchronously inside open provisioning transactions, adding to the same 5-second budget RES-09 flags

- **Category:** Performance / Transactions
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED for the call sites; LIKELY for the exact millisecond
  cost of cost-factor-12 bcrypt on the production instance's CPU, which was not
  measured live
- **Known:** NEW (additional evidence inside the transaction RES-09 already
  names; not a new transaction, a new cost inside it)
- **Component:** `services/api/src/modules/super-admin/platform-onboarding.service.ts`,
  `services/api/src/modules/tenant-control-plane/tenant-access.service.ts`,
  `services/api/src/modules/tenants/tenants.service.ts`
- **Evidence:**
  `platform-onboarding.service.ts:201` opens the transaction RES-09 already
  names (`provisionTenantForCustomer`'s `$transaction`, no explicit timeout);
  inside it, `:241-243`:
  ```ts
  const placeholderPasswordHash = await bcrypt.hash(
    `onboarding-${tenant.id}-${Date.now()}`,
    12,
  );
  ```
  The same shape recurs at `tenant-access.service.ts:211`
  (`await bcrypt.hash(unguessableSecret(), 12)`, inside the `$transaction`
  traced at `tenant-access.service.ts:204-273`) and
  `tenants.service.ts:223` (`await bcrypt.hash(dto.password, 12)`, inside the
  `$transaction` at `tenants.service.ts:134-296`).
- **Current behaviour:** bcrypt is deliberately slow (that is its security
  property); at cost factor 12 it is commonly 100–300 ms of pure synchronous
  CPU on Node's single thread. Run inside an open interactive transaction, that
  time (a) counts against the same 5-second default timeout as every other
  awaited step in the transaction (RES-09), and (b) — per RES-11's finding that
  synchronous CPU work blocks the whole event loop — freezes every other
  concurrent request on the single instance for that duration while a database
  connection sits idle-but-claimed.
- **Expected behaviour:** Compute the hash before opening the transaction (it
  depends on no data read inside the transaction in any of the three call
  sites — `placeholderPasswordHash` at `platform-onboarding.service.ts:241`
  uses only `tenant.id`, which the transaction has already created by that
  point, so this specific one needs a small reorder; the other two depend on
  nothing from inside the transaction at all and can move out unconditionally).
- **Risk:** A few hundred milliseconds added to transactions already at risk of
  the 5-second cliff (RES-09) and to the API's single-threaded responsiveness
  for every other tenant's concurrent request (RES-11's freeze mechanism)
  during exactly the moment a new customer is signing up.
- **Remediation:** Hoist `bcrypt.hash(...)` outside the `$transaction` callback
  wherever it does not read data the transaction itself produced;
  `tenant-access.service.ts:211` and `tenants.service.ts:223` can move
  unconditionally, `platform-onboarding.service.ts:241` needs the tenant id
  computed first (already available before the hash is needed) or the
  placeholder string reworked to not depend on it.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

### Loop/N+1 sweep — what else was checked and found bounded or already covered

A repository-wide scan for `for`/`forEach`/`.map(async` blocks containing an
`await this.prisma`/`await this.*Repository`/`await this.*Service` call found
59 loop bodies with at least one such call. Beyond DBQ-02–DBQ-05 above and the
RES findings this report cross-references (RES-02 payroll, RES-15 payslip
numbering), the rest resolved to one of:

- **Bounded by design and already correct.** `attendance.service.ts:755`
  (`mapCorrectionRequest` per list row) does not issue its extra
  `approvalRequest.findFirst` on the list path — `includeApproval` defaults
  `false` and is only `true` on the single-record `getCorrectionRequest` path
  (`attendance.service.ts:2208-2213`). `notifications.service.ts`'s own
  `resolveRecipients` (the per-rule call inside DBQ-02's outer loop) is itself
  1 query, not N.
- **Background workers, chunked, off the request thread.**
  `data-management/import-execution.service.ts:273-350` — generic bulk import
  — does up to 3 queries per row (`findExisting`, create/update, row-status
  update) with no batching, but runs in `CHUNK_SIZE`-bounded pages inside a
  `setInterval` worker (`DataJobWorkerService`), not inline on a request and
  not inside one long transaction. This is real, unbatched query cost (a
  10,000-row import is ~30,000 sequential round trips, taking minutes) but it
  does not hold a request or a transaction open, so it is a throughput
  concern, not a correctness or availability one. Worth batching (`createMany`
  where the executor interface allows it) but not urgent.
- **Small, fixed-cardinality iteration.** `customization.service.ts:4333`
  iterates `SYSTEM_CUSTOMIZATION_TABLES` (a code-defined, dozens-not-thousands
  list built from the Prisma model registry), and the whole sync is cached
  per-tenant in an in-process `Set` (`syncedDefaultSolutionTenants`,
  `customization.service.ts:4293-4310`) so it runs at most once per tenant per
  process lifetime, not per request.
- **Tree-walks bounded by org depth.** The manager-chain `while`/`for` loops in
  `attendance.service.ts:4111-4136`, `employees.service.ts:2719-2754`/`3814-3838`
  and `employees/employee-access.service.ts:158-176` walk a reporting-line
  hierarchy one query per level; in practice this is bounded by org depth
  (single digits), not row count. Worth a documented hard cap (an
  accidentally-cyclic `managerEmployeeId` would loop until Postgres has
  nothing left to return) but not a performance finding at today's likely
  depths.

---

## 3. Unbounded queries

### DBQ-06 — The Audit Log screen's filter-metadata query does an unbounded `DISTINCT` scan over the tenant's entire audit history, on every page load

- **Category:** Performance / Unbounded query
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW (BUG-2043 is a different Audit Log defect — a pagination
  total-count display bug, already `FIXED` — this is a distinct, still-open
  query-cost issue in the same screen's supporting call)
- **Component:** `services/api/src/modules/audit/audit.repository.ts`,
  `audit.service.ts`
- **Evidence:**
  `audit.service.ts:109-113` (`listByTenant`, the handler behind `GET /audit`):
  ```ts
  const [{ items, total }, metadata] = await Promise.all([
    this.auditRepository.findByTenant(tenantId, query),
    this.auditRepository.getFilterMetadata(tenantId),
  ]);
  ```
  `audit.repository.ts:114-134` (`getFilterMetadata`, run on **every** call to
  the list endpoint, not cached):
  ```ts
  const [actions, entityTypes, actors] = await Promise.all([
    db.auditLog.findMany({
      where: { tenantId }, distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' },
    }),
    db.auditLog.findMany({
      where: { tenantId }, distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' },
    }),
    db.user.findMany({
      where: { tenantId, auditLogs: { some: {} } },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);
  ```
  No `take`, no `createdAt` window, on any of the three. `AuditLog` carries
  indexes on `(tenantId, action, createdAt)` and `(tenantId, entityType,
  createdAt)` (`schema.prisma:10461-10462`), which support the *filtered* list
  query but do not turn an unbounded `DISTINCT` scan into a cheap one —
  PostgreSQL has no native loose/skip-scan for a plain `SELECT DISTINCT`
  without a recursive-CTE rewrite, so the planner still has to visit every
  matching index entry to compute the distinct set, i.e. cost scales with
  **row count**, not with the number of distinct values.
- **Current behaviour:** Every load of, and every filter change on, the Audit
  Log screen re-scans the tenant's entire `AuditLog` history twice (once for
  distinct actions, once for distinct entity types) plus a `user.findMany`
  with an `EXISTS`-style subquery for "any user with at least one audit row".
  `AuditLog` is explicitly the codebase's mandated write target for "every
  state-changing operation" (AGENTS.md, `AuditService.log()`), so it is one of
  the fastest-growing tables in the schema and has no retention/archival
  policy visible in this sweep (see "Not examined").
- **Expected behaviour:** Cache the filter metadata (it changes only when a new
  action/entity type is introduced in code, or a new user's first audit row is
  written — both rare, cacheable at the tenant level with a long TTL or
  invalidated on write), or derive it from a small, maintained lookup table
  instead of scanning the fact table.
- **Risk:** Cost grows without bound as exactly the audit trail the product
  advertises as a compliance feature accumulates — the tenants for whom
  Audit & Compliance matters most (regulated, long-tenured, high-activity) are
  the ones who will feel this first, and the query runs on a screen those
  tenants' compliance/HR staff open often.
- **Remediation:** Cache `getFilterMetadata`'s result per tenant (short TTL or
  invalidate on `AuditService.log()`), or replace the two `DISTINCT` scans with
  reads against `common/constants/permissions.ts`-style static registries
  where the full set of possible `action`/`entityType` values is already known
  at compile time rather than derived from data.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

### DBQ-07 — `GET /payslips` has no pagination parameters at all and, unfiltered, returns every payslip the tenant has ever generated with a four-level `include`

- **Category:** Performance / Unbounded query / Over-fetching
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/payslips/payslips.controller.ts`,
  `payslips.service.ts`, `payslips/dto/payslip-query.dto.ts`
- **Evidence:**
  `payslip-query.dto.ts` (whole file):
  ```ts
  export class PayslipQueryDto {
    @IsOptional() @IsUUID() employeeId?: string;
    @IsOptional() @IsUUID() payrollRunId?: string;
    @IsOptional() @IsEnum(PayslipStatus) status?: PayslipStatus;
  }
  ```
  No `page`/`pageSize` field of any kind — unlike the 16 other query DTOs in
  this sweep that declare `pageSize`, every one of which also declares
  `@Max(...)` on it (see DBQ-09's healthy note).
  `payslips.controller.ts:64-75`:
  ```ts
  @Get('payslips')
  @Permissions('payslips.read-all')
  listPayslips(@CurrentUser() user, @Query() query: PayslipQueryDto) {
    return this.payslipsService.listPayslips({ tenantId: user.tenantId, ...query });
  }
  ```
  `payslips.service.ts:298-315`:
  ```ts
  async listPayslips(params: { tenantId; employeeId?; payrollRunId?; status? }) {
    const payslips = await this.prisma.payslip.findMany({
      where: { tenantId: params.tenantId, ...(employeeId?{}:{}), ...(payrollRunId?{}:{}), ...(status?{}:{}) },
      include: payslipInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return payslips.map(mapPayslip);
  }
  ```
  `payslipInclude` (`payslips.service.ts:26-55+`) pulls `employee` (select),
  `payrollRun` → `payrollPeriod` → `payrollCalendar` (three nested `include`
  levels), `payrollRunEmployee` (whole row), and `lineItems` → `payComponent`
  (select) — one join fan-out per payslip.
- **Current behaviour:** A caller with `payslips.read-all` who does not pass
  `employeeId`, `payrollRunId` or `status` — which the DTO permits, since all
  three are optional — receives every payslip the tenant has ever generated,
  each with its full join tree, in one response. For a 500-employee tenant
  running monthly payroll for three years that is 18,000 rows, each expanding
  through 4 joined tables.
- **Expected behaviour:** `page`/`pageSize` fields with the same `@Max()`
  discipline every other list DTO in the codebase already has, and `select`
  instead of the deep `include` for the list view (a payslip list screen does
  not need `payrollRunEmployee` in full or the nested calendar chain — those
  belong on the single-payslip detail call, which already exists separately at
  `payslips.controller.ts:78+`).
- **Risk:** Unbounded response size and Prisma join cost that grows without
  limit as a tenant's payroll history accumulates — this is the same failure
  shape RES-15 already flags for payslip *numbering* (up to 101 queries per
  employee, inline), on the read side instead of the write side, and it is
  reachable by any caller who simply omits the optional filters, not only by
  an edge case.
- **Remediation:** Add `page`/`pageSize` (with `@Max`) to `PayslipQueryDto`,
  thread them into the `findMany` as `skip`/`take` plus a `payslip.count()`
  for `total`, and replace `payslipInclude`'s deep `include` with a `select`
  for the list endpoint specifically, keeping the full include for the
  single-record detail call.
- **Difficulty:** LOW
- **Regression risk:** LOW — existing callers that already pass `employeeId`
  (the common case: an employee viewing their own payslips) are unaffected;
  this closes the unfiltered/unbounded case.
- **Fix now:** YES

### DBQ-08 — Generic entity CSV export silently truncates at 10,000 rows with no signal to the caller (self-documented by a sibling module's own comment)

- **Category:** Over-fetching / Data correctness
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW — not in `docs/bugs/`, though the defect is *documented in
  the code itself* by a comment in a different file
- **Component:** `services/api/src/modules/data-management/export-execution.service.ts`
- **Evidence:**
  `export-execution.service.ts:201-213`:
  ```ts
  const rows = await delegate.findMany({
    where: { AND: [{ tenantId: user.tenantId }, buildScopedAccessWhere(...)] },
    ...(Object.keys(include).length ? { include } : {}),
    take: 10_000,
  });
  ```
  followed directly by building the CSV from `rows` with no total count check
  and no truncation notice in the file, the filename, or the returned object
  (`:215-236`).
  A sibling module already names this exact defect in its own source —
  `reporting/execution/report-execution.service.ts:198-204`:
  ```
  * Paged internally rather than fetched in one query, and hard-capped: an
  * unbounded export is how a reporting feature becomes an outage. The cap
  * refuses rather than silently truncating — `data-management`'s exporter
  * takes 10,000 rows and says nothing, which produces a file that looks
  * complete and is not.
  ```
- **Current behaviour:** Exporting any tenant table (via the generic
  entity-export path in `data-management`) with more than 10,000 matching rows
  produces a CSV that ends at row 10,000 with no warning, no truncated-count
  footer, and a filename indistinguishable from a complete export.
- **Expected behaviour:** Either raise the cap and page internally (as the
  reporting module's own exporter now does, per its comment), or refuse the
  export above the cap with an explicit error, matching the design choice the
  reporting module already made and documented as the correct one.
- **Risk:** A tenant admin exporting, say, all attendance entries or all
  employees for an external audit or payroll vendor receives a file that looks
  complete and silently is not — the same "confident wrong answer" shape
  BUG-2043 was rated HIGH for in the Audit Log screen.
- **Remediation:** Apply the same fix the reporting module's comment describes
  for itself: page the export in `export-execution.service.ts`, or surface
  `total > 10_000` as a truncation warning in the response/filename.
- **Difficulty:** LOW–MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER (no evidence yet of a tenant actually over the threshold,
  but the defect is real and self-admitted)

### Unbounded-query sweep — scale and what was and wasn't concerning

A structural scan of every `findMany` call in `services/api/src` (excluding
specs) found **647 call sites, 505 of them with no `take`.** The large
majority are legitimately unbounded because the table they query is
tenant-scoped and small by construction (roles, permission catalogs,
customization tables, plan/price catalogs, business units — organizational
metadata that does not grow with usage). This sweep specifically checked every
unbounded `findMany` against the high-growth tables named in the brief
(`AttendanceEntry`, `AuditLog`, `Notification`, `TimesheetEntry`,
`ActivityEvent`, `Document`, `Payslip`, `LeaveRequest`, `PayrollRunEmployee`,
`ErrorLog`, `OutboxEvent`) and reports the concerning ones above (DBQ-06,
DBQ-07) plus one already covered (ORCH-05, `businessUnit.findMany` — not
itself a high-growth table, but read in full on every request). The rest of
the high-growth-table hits resolved to genuinely bounded call shapes: filtered
by a specific `employeeId`/`payrollRunId`/date-window predicate that keeps the
practical row count small regardless of the missing `take` (e.g.
`reports.service.ts:216`'s `attendanceEntry.findMany` is bounded to a 7-day
window and two `select`ed columns; `leave.repository.ts`'s five unbounded
`leaveRequest.findMany` calls are all scoped to one employee or one
approval-step set).

---

## 4. Over-fetching

Folding in **ORCH-04** (auth access-context load, ~21 relation loads via a
4-level-deep `include` on every authenticated request, not cached) and
**ORCH-05** (the tenant's full `BusinessUnit` table read and filtered in
JavaScript) rather than restating them. One piece of additional depth on
ORCH-05: `BusinessUnit` **already carries** `@@index([tenantId,
organizationId])` (`schema.prisma`, in the model's index block), so ORCH-05's
proposed fix — pushing `organizationId` into the Prisma `where` clause — is not
just correct but has zero index cost: the supporting index exists and is
unused today only because the filter runs in JavaScript after the rows cross
the wire. This lowers ORCH-05's remediation difficulty from "needs an index
too" to "query-shape change only."

DBQ-07 above (payslip list) is this report's own over-fetching finding beyond
what ORCH already covered — deep `include` combined with no pagination. The
reporting/analytics engine, by contrast, is a genuinely good over-fetching
counterexample and is written up in Healthy below.

---

## 6. Index support for the highest-traffic query shapes

Spot-checked the tables named in the brief and the ones this report's own
findings touch: `AttendanceEntry`, `LeaveRequest`, `Notification`, `Payslip`,
`Employee`, `TimesheetEntry`, `BusinessUnit`, `AuditLog`. **All eight carry
`tenantId`-prefixed composite indexes matching the predicates the application
actually filters on** (see the Healthy section for specifics per model). This
sweep found **no missing composite index behind a real, reachable query** —
every performance problem identified above (DBQ-02, DBQ-04, DBQ-06, DBQ-07,
ORCH-04, ORCH-05) is a query-*shape* problem (unbounded, N+1, uncached,
filtered client-side) sitting on top of adequate index support, not a missing
index. The one index-relevant finding is DBQ-06: the `AuditLog` indexes fully
support the *filtered, paginated* list query but cannot make an **unbounded
`DISTINCT`** cheap, because Postgres has no native skip-scan for a plain
`SELECT DISTINCT` — that is a query-shape ceiling, not something an additional
index closes.

**Over-indexing check:** no evidence of index bloat found on any write-hot
table inspected. `AttendanceEntry` (the highest-write-volume table checked, one
row per employee per work day, frequently updated by the reconciliation
engine) carries 7 indexes beyond its unique constraint — a reasonable count
for a table with this many independent list-screen filters (status, mode,
source, office location, imported batch, shift template, date), not evidence
of speculative indexing. This was a spot check across 8 models, not the full
312-model schema, so a broader over-indexing sweep is out of scope here (see
"Not examined") and belongs to the schema specialist regardless.

---

## 7. Search / sort / filter cost

### DBQ-09 — 48 files use `contains` + `mode: 'insensitive'` with no supporting trigram/GIN index anywhere in the schema, including on the highest-write-volume table

- **Category:** Performance / Search
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** repository-wide; `services/api/src/modules/attendance/attendance.repository.ts`
  and `services/api/src/modules/employees/employees.repository.ts` as the
  clearest examples
- **Evidence:**
  ```
  $ grep -rln "mode: 'insensitive'" services/api/src --include=*.ts | grep -v spec | wc -l
  48
  $ grep -n "gin\|trgm\|pg_trgm\|extensions" services/api/prisma/schema.prisma
  (no matches — no Postgres extension, no full-text/trigram index declared anywhere)
  ```
  Worst case by table growth — `attendance.repository.ts:1310-1321`, a
  free-text filter reachable from the attendance list endpoint's
  `detailsFilter` query parameter:
  ```ts
  where.AND = [...normalizeAnd(where.AND), {
    OR: [
      { notes: { contains: detailsFilter, mode: 'insensitive' } },
      { checkInNote: { contains: detailsFilter, mode: 'insensitive' } },
      { checkOutNote: { contains: detailsFilter, mode: 'insensitive' } },
      { workSummary: { contains: detailsFilter, mode: 'insensitive' } },
    ],
  }];
  ```
  Also `employees.repository.ts:337-341` (name/email/code search across the
  employee list) and 46 further sites in attendance-integrations, contracts,
  compensation, customization, and elsewhere.
- **Current behaviour:** `ILIKE '%term%'` cannot use a standard B-tree index
  (the 7 indexes confirmed on `AttendanceEntry` in section 6 do not help this
  predicate at all — none of them are on `notes`/`checkInNote`/`checkOutNote`/
  `workSummary`, and a leading-wildcard `LIKE` could not use a plain B-tree on
  those columns even if one existed). Every such search is a sequential scan
  over the `tenantId`-filtered row set for that table.
- **Expected behaviour:** Either a `pg_trgm` GIN index on the specific
  free-text columns that are actually searched this way (Postgres supports
  this without an ORM-level schema change beyond declaring the index), or
  narrowing these filters to `startsWith` where the product only needs
  prefix search (several of the 48 sites, e.g. `employeeCode`, already offer a
  `startsWith` variant in the same file — `employees.repository.ts:465-467` —
  so the pattern is already half-adopted).
- **Risk:** On `Employee` (typically hundreds of rows per tenant, per the
  schema specialist's likely sizing) this is a minor cost today. On
  `AttendanceEntry` — one row per employee per working day, i.e. the fastest
  structurally-growing per-tenant table in the schema outside of `AuditLog`
  and `Notification` — a `detailsFilter` search becomes a full sequential scan
  of the tenant's attendance history on every keystroke-driven search request,
  growing without bound as tenure accumulates.
- **Remediation:** Add `pg_trgm` GIN indexes for the highest-value free-text
  search columns (`AttendanceEntry.notes`/`checkInNote`/`checkOutNote`/
  `workSummary` first, given growth rate), via a normal migration
  (`CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX ... USING GIN (column
  gin_trgm_ops);` — Prisma supports raw-SQL migrations for extension-backed
  indexes it cannot express declaratively). Convert filters that only need
  prefix matching to `startsWith`.
- **Difficulty:** LOW (extension + index) to MEDIUM (auditing which of the 48
  sites genuinely need substring vs. prefix search)
- **Regression risk:** LOW
- **Fix now:** LATER — real cost today is proportional to tenant tenure, which
  is still low platform-wide (~130 MB total database), but the fix is cheap
  and the growth curve is the one structural one in this list that never
  plateaus.

### DBQ-10 — No cursor-based pagination anywhere in user-facing list APIs

- **Category:** Performance / Pagination
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** repository-wide
- **Evidence:**
  ```
  $ grep -rln "cursor:" services/api/src/modules --include=*.ts | grep -v spec
  attendance-engine/attendance-backfill.service.ts
  employee-levels/employee-levels.service.ts
  reporting/engine/query-planner.ts
  reporting/snapshot/workforce-snapshot.service.ts
  ```
  All four are internal batch-processing loops (a backfill job, a hierarchy
  walk, a report's internal row iterator, a snapshot worker) — none is a
  user-facing list endpoint. Every paginated *screen* found in this sweep
  (audit log, payslips, attendance, timesheets, notifications, onboarding,
  etc.) uses `skip: (page - 1) * pageSize` / `take: pageSize` — plain
  `OFFSET`/`LIMIT`.
- **Current behaviour:** Deep pages cost proportionally more than shallow ones
  on every list screen, because Postgres must still traverse (via the index)
  and discard every row before the offset. This is architecturally uniform
  across the product, not a per-screen bug.
- **Expected behaviour:** For the tables large enough for it to matter
  (`AttendanceEntry`, `AuditLog`, `Notification`, `TimesheetEntry`), keyset/
  cursor pagination (`WHERE (createdAt, id) < (?, ?) ORDER BY createdAt DESC,
  id DESC LIMIT ?`) would keep deep-page cost constant instead of linear.
- **Risk:** Low today — see the healthy note below, since page size is capped
  and most tenants' per-table row counts are still modest (~130 MB database
  platform-wide). This is a scaling-curve observation, not an active incident:
  it is the mechanism behind part of the "10,000 users" tier in the scaling
  verdict below, not a near-term problem on its own.
- **Remediation:** Not urgent as a blanket change. If any specific screen's
  users are observed paging deep into a high-volume table (attendance history,
  audit log), convert that one screen to keyset pagination rather than
  reworking the pattern everywhere.
- **Difficulty:** MEDIUM (per screen converted)
- **Regression risk:** MEDIUM — changes the query contract (no more "jump to
  page N" for a keyset-paginated screen); needs a UI conversation, not just a
  backend change.
- **Fix now:** NO — track, revisit if a specific screen's usage pattern
  justifies it.

**Healthy counterpart to DBQ-10 and DBQ-07:** pagination *size* — as opposed to
*depth* — is well-controlled. Of the 17 query DTOs in this codebase that
declare a `pageSize` field, **16 also declare `@Max(...)` on it** (the sole
exception is `PayslipQueryDto`, which has no pagination field at all — DBQ-07).
Spot-checked example: `audit-log-query.dto.ts:57-58` — `@Max(100) pageSize =
20`. Combined with the global `ValidationPipe`'s `forbidNonWhitelisted: true`
(AGENTS.md), a client cannot request an unbounded page even on the screens
that do paginate.

---

## 8. Reporting vs. transactional load

### DBQ-11 — Reports and exports share the single request-serving connection pool and the single Postgres compute; there is no replica, no queue isolation, and no timeout that stops a heavy report from starving the API

- **Category:** Performance / Resource isolation
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (absence, checked directly) for the architecture;
  cross-references RES-11 for the specific inline-CPU consequence
- **Known:** NEW
- **Component:** repository-wide; `services/api/src/modules/reporting/`,
  `common/prisma/prisma.service.ts`
- **Evidence:**
  ```
  $ grep -rniE "read.?replica|REPLICA_URL|readonly.*database|secondary.*database" services/api/src packages/config render.yaml docs/environment-variables.md
  (no matches)
  ```
  Confirmed earlier (section 1): exactly one `PrismaService`, one pool, no
  second `DATABASE_URL`-style variable for anything report-related. Report
  *querying* itself is well-built (see Healthy) — bounded, `select`-based,
  batches label lookups explicitly to avoid N+1
  (`reporting/engine/query-executor.ts:312-317`, comment: *"One lookup query
  for the whole bucket set, not one per bucket — the naive version is an N+1
  that only shows up on a tenant large enough to matter."*), and export row
  counts are hard-capped with a documented rationale
  (`report-execution.service.ts:198-204`). What is not isolated is the
  **compute** behind a report: XLSX/PDF buffer construction runs synchronously
  on the same single JS thread and the same connection pool as every other
  tenant's ordinary CRUD traffic (RES-11 traces this exactly:
  `common/excel/excel-export.service.ts:25`, `contracts/contracts.service.ts:6305`).
- **Current behaviour:** A payroll or attendance export for a large tenant
  competes for the same 10-connection pool (RES-01) and the same single
  Postgres compute as every other tenant's live traffic, with no query queue,
  no priority lane, and no per-report timeout beyond Prisma's connection-level
  defaults. The row-count cap (`MAX_EXPORT_ROWS`) bounds query cost; nothing
  bounds the CPU cost of turning those rows into a file (RES-11), and nothing
  routes that CPU cost off the request-serving process.
- **Expected behaviour:** Either a genuinely separate execution path (the
  `DataJob`/`ExportExecutionService` pattern the codebase already has, per
  RES-11's own remediation) for anything above a small row threshold, or — if
  the single-instance/no-Redis architecture is staying as-is — an explicit
  concurrency cap on simultaneous report/export executions so one large
  tenant's export cannot consume the whole pool or the whole event loop at
  once.
- **Risk:** Same mechanism RES-11 already rates MEDIUM (a large export freezes
  every concurrent user on the single instance, across every tenant) —
  reported here specifically to answer the brief's "do reports/exports share
  the request pool" question directly, with the connection-pool angle added:
  a report's DB queries themselves are well-bounded, but a report's *response
  construction* still blocks the same event loop that is servicing other
  tenants' database round trips, which is functionally equivalent to pool
  starvation even though no additional connection is held.
- **Remediation:** As RES-11 recommends — route the payroll, timesheet and
  reporting export endpoints already backed by `ExportExecutionService`'s
  chunked pattern through it consistently rather than building the response
  buffer inline for any of them.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM (RES-11's own assessment; this is the same
  remediation, not a second one)
- **Fix now:** LATER — tracking RES-11's own disposition; DBQ-11 exists to
  confirm the "shared pool, no replica" half of the brief's question
  explicitly rather than leave it implicit.

**Heaviest report query found:** `reporting/engine/query-executor.ts`'s
`records()` (`:369-383`) and the breakdown/`groupBy` path it sits beside
(`:280-310`) are both bounded (`take`/`skip`, `select` not `include`,
capped bucket counts via `MAX_BREAKDOWN_BUCKETS`), so no single report query
in the engine itself stood out as disproportionately expensive relative to
its row cap. The heaviest *cost* in the reporting path is not a query — it is
the synchronous export-buffer construction RES-11 already identifies, which
is compute, not database load.

---

## 9. Scaling verdict

**100 users, 100 tenants (roughly today's shape, per the ~130 MB database):**
nothing in this report is yet a hard failure. The closest thing to a
user-visible symptom is ORCH-04's ~26-round-trip authentication tax, which is
a flat per-request cost independent of scale — it is already the platform's
single biggest source of avoidable latency today, not a future risk.

**1,000 users (concentrated in a handful of larger tenants, ~100 tenants
average 10 users but realistically skewed):** the first two findings in this
report to show real user-facing cost are **DBQ-06** (Audit Log filter
metadata — a tenant with a year of typical HR/payroll activity across 1,000
users generates enough `AuditLog` volume, per AGENTS.md's mandatory
state-change logging, that the unbounded `DISTINCT` scan stops being free) and
**DBQ-07** (`GET /payslips` unfiltered — a 1,000-user tenant running monthly
payroll for even one year is 12,000 payslip rows returned in one response with
a 4-level join, on any admin who opens the payslips screen without a filter).
Both are request-latency problems at this tier, not outages.

**10,000 users, 1,000 tenants:** this is where a *correctness* break appears,
not just a slowness one. **DBQ-04** (timesheet bulk-import confirmation) is
the specific pattern that breaks first: any tenant at this scale running a
normal-sized import (a few hundred to low-thousands of rows — trivial at
10,000 platform users, since even a single mid-sized customer's team import
crosses this) exceeds the ~125-row estimate at which the per-row loop's
cumulative query time risks Prisma's 5-second default interactive-transaction
timeout (RES-09's mechanism, this report's specific call site), and the
**entire import rolls back atomically**, including rows that had already
succeeded. This is the same failure class that produced BUG-0900 (CRITICAL) in
provisioning. Concurrently, **DBQ-02** (notification fan-out) becomes a
platform-wide contention point rather than a per-tenant inconvenience: at
10,000 users spread across 1,000 tenants, several tenants' HR/manager-role
notification fan-outs (each up to ~80+ sequential round trips, per this
report's worked example) are statistically likely to be in flight
concurrently, and because RES-01's pool has no `connectionTimeoutMillis`,
those in-flight fan-outs can occupy a meaningful fraction of the fixed
10-connection pool for the whole time their loops are running — with nothing
timing out to turn that into a visible error, other tenants' unrelated
requests simply queue silently behind them. **DBQ-06** and **DBQ-07** are, by
this tier, reliably multi-second for any tenant with the corresponding data
volume, on every relevant page load.

**The one-sentence version:** the schema and its indexes (section 6) will
carry this platform to 10,000 users without needing new indexes; what will not
carry it there is the fixed 5-second transaction budget meeting the two
places in this report where a per-row loop's query count is proportional to
data volume with no cap (DBQ-04 timesheet import, and RES-02/RES-09's payroll
and provisioning paths) — those are where slowness turns into an outright
failed operation, not merely a slow one.

---

## Healthy — verified good

- **No stray `PrismaClient` instances.** `grep -rn "new PrismaClient(" services/api/src`
  matches nothing outside `services/api/prisma/*.ts` (CLI scripts) and
  `services/api/test/*.ts` (e2e bootstraps) — the entire runtime API shares
  the one `PrismaService` pool.
- **Shutdown hooks are wired correctly.** `main.ts:42`
  (`app.enableShutdownHooks()`) plus `PrismaService.onModuleDestroy`'s
  `$disconnect()` (`prisma.service.ts:147-149`) means a graceful shutdown
  actually releases the pool rather than leaking connections.
- **Pagination size is capped almost everywhere.** 16 of 17 query DTOs with a
  `pageSize` field also declare `@Max(...)` on it (spot-checked:
  `audit-log-query.dto.ts:57` caps at 100), enforced by the global
  `ValidationPipe`'s `forbidNonWhitelisted: true`. The one exception
  (`PayslipQueryDto`) is DBQ-07.
- **The reporting/analytics query engine is well-built.** Bounded `take`/`skip`
  throughout (`reporting/engine/query-executor.ts:369-383`), `select` instead
  of `include` for row projection, an explicit, commented fix for the N+1 that
  a naive label-lookup implementation would have had
  (`query-executor.ts:312-317`), and a hard, documented export-row cap
  (`report-execution.service.ts:198-204`) whose comment explicitly names and
  criticises the *different* module (`data-management`) that does not have
  the same discipline (DBQ-08).
- **The eight high-traffic tables spot-checked all carry `tenantId`-prefixed
  composite indexes matching their real query predicates** — `AttendanceEntry`
  (`schema.prisma:5997-6004`), `LeaveRequest` (`:5708-5711, 5727-5729`),
  `Notification` (`:7856-7866`), `Payslip` (`:8970-8973`), `Employee`
  (`:5109-5129` region), `TimesheetEntry`, `BusinessUnit`
  (`:4611-4622` region), and `AuditLog` (`:10459-10465`). No missing index was
  found behind any reachable query in this sweep — every performance finding
  above is a query-shape problem sitting on adequate index support.
- **Generic bulk import (`data-management`) runs chunked and off the request
  thread.** `import-execution.service.ts:273-350` pages in `CHUNK_SIZE`
  batches inside a background worker rather than one long transaction inline
  on a request — the opposite pattern from DBQ-04's timesheet-import bug, and
  worth using as the reference implementation when fixing DBQ-04.
- **Migration and runtime connections are deliberately separated and the
  separation's residual risk is documented, not assumed solved** — BUG-0086,
  `prisma.config.ts`'s own comments, and
  `docs/deployment/platform-access.md`'s "Known drift" section all agree on
  the current live state (direct endpoint for both today) and flag exactly
  what would break if `DATABASE_URL` were pointed at the pooled endpoint
  without also setting `DIRECT_DATABASE_URL`.

## Not examined / limits

- **No live query plans (`EXPLAIN ANALYZE`).** This is a read-only, static
  audit against source and schema; every cost estimate above (round-trip
  counts, row-count thresholds for the 5-second transaction cliff, the point
  at which a `DISTINCT` scan becomes noticeable) is reasoned from code
  structure and index shape, not measured against a live database with
  representative data volume. Flagged LIKELY/estimated inline wherever this
  matters (DBQ-01's Neon connection-ceiling figures, DBQ-04's row-count
  breakpoint, DBQ-05's bcrypt timing).
- **`AuditLog` retention/archival policy was not traced.** DBQ-06's severity
  assumes the table grows without bound; if a retention or archival job exists
  elsewhere in the codebase that this sweep did not surface (the loop/N+1
  sweep covered `agent`/`dlp` retention specifically because RES-13 named
  them, but did not do an exhaustive search for an `AuditLog`-specific one),
  the growth-curve part of the risk assessment would need revising — the
  query-shape defect (unbounded `DISTINCT` on every page load) holds
  regardless.
- **The `findMany`-without-`take` sweep (505 sites) was triaged by table name
  and read-through spot checks, not read individually.** The high-growth
  tables named in the brief were checked exhaustively; the remaining several
  hundred sites against small, organizationally-bounded tables (roles,
  catalogs, settings) were sampled rather than each individually confirmed
  bounded. A residual unbounded query against a high-growth table not on the
  brief's named list (e.g. a table this report did not think to check) cannot
  be ruled out from this sweep alone.
- **Index over-provisioning was spot-checked on 8 models, not the full
  312-model schema.** A repository-wide write-amplification audit (indexes
  that cost more on insert/update than they save on read, especially on
  `AttendanceEntry`- or `TimesheetEntry`-scale write-hot tables) is schema
  specialist territory and was not attempted here beyond the note in section 6.
- **No production data volumes were available.** Every "at scale" claim in
  section 9 reasons from schema/index shape and code structure, consistent
  with the ~130 MB live database size ORCH reported; this report cannot
  distinguish "will happen at 10,000 users" from "might happen sooner" with
  actual row-count measurements, since the live database is nowhere near
  either the DBQ-04 or DBQ-06 breakpoints today.
- **`node_modules` is junctioned in and `npx tsc --noEmit` was available but
  not run** — no finding here depended on a type-level check rather than a
  direct code read, so it was not invoked, per the briefing's guidance to use
  it only when a finding genuinely depends on it.
