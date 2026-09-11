# RES — Backend performance, resilience, concurrency and idempotency

Audit area: process-level behaviour, background work, and what happens when
things fail or run twice. Query-level performance is another specialist's.

Scope covered: every `setInterval`-driven worker, the outbox, the notification
pipeline, the Stripe webhook path, payroll, leave, payslips, provisioning,
attendance ingestion, agent sync, every outbound network call in
`services/api/src`, the Prisma connection layer, `main.ts` bootstrap and
`render.yaml`.

**Baseline fact that shapes several findings:** there is no `@Cron`, no
`@nestjs/schedule`, no BullMQ, no Redis and no separate worker process. All
background work is `setInterval` inside the API process. `render.yaml:52-57`
attaches a Render disk, which *pins the service to a single instance*, so the
duplicate-execution risks below are latent rather than live today — but nothing
in the code makes them safe, and the pin is a storage side effect, not a
deliberate concurrency control.

---

### RES-01 — The Postgres connection pool is entirely default and waits forever for a connection

- **Category:** Resilience / Cascading failure
- **Severity:** HIGH
- **Confidence:** CONFIRMED (that no pool configuration is passed); LIKELY (on the exact `pg` default values, which I read from the library contract rather than by executing)
- **Known:** NEW
- **Component:** `services/api/src/common/prisma/prisma.service.ts`
- **Evidence:**
  `services/api/src/common/prisma/prisma.service.ts:29` —
  ```ts
  adapter: new PrismaPg({ connectionString }),
  ```
  That is the entire pool configuration. `PrismaPg` forwards its options to a
  `node-postgres` `Pool`; nothing here sets `max`, `connectionTimeoutMillis`,
  `idleTimeoutMillis`, `statement_timeout` or `query_timeout`.

  A repository-wide search finds no such settings anywhere:
  ```
  $ grep -rn "connection_limit|pool_timeout|statement_timeout" . --exclude-dir=node_modules
  (no matches)
  ```
  Note also that `connection_limit=` in a `DATABASE_URL` is a **Prisma query
  engine** parameter and is *not* honoured on the driver-adapter path, so even
  setting it in the Render dashboard would have no effect.
- **Current behaviour:** the process runs on `pg`'s defaults — `max: 10`
  connections and `connectionTimeoutMillis: 0`, which means "wait indefinitely
  for a free connection". No server-side `statement_timeout` is set either, so a
  single runaway query runs until Postgres or the network kills it.
- **Expected behaviour:** an explicit `max` sized to the Neon plan, a bounded
  `connectionTimeoutMillis` (2–5 s) so pool starvation surfaces as a fast 503
  rather than an unbounded hang, and a `statement_timeout` so no single query
  can hold a connection indefinitely.
- **Risk:** this is the single mechanism by which one slow thing takes the whole
  API down. Ten concurrent requests that each hold a connection for a long time
  — a payroll calculation (RES-02), a 120-second tenant erasure
  (`tenant-control-plane/tenant-erasure.service.ts:230`), an unbatched retention
  delete (RES-13, RES-24) — exhaust the pool. Every subsequent request then
  waits *forever* on connection acquisition rather than failing fast. Requests
  pile up, Node's memory grows with the queued handlers, and the instance
  becomes unresponsive without ever emitting an error the exception filter can
  turn into a 503. Health checks still pass (RES-04), so Render keeps the dead
  instance in rotation.
- **Remediation:** in `PrismaService`'s constructor, pass an explicit pool
  config to `PrismaPg`: `max` (start at 10–15, matched to the Neon compute
  size), `connectionTimeoutMillis: 5000`, `idleTimeoutMillis: 30000`, and
  `options: '-c statement_timeout=30000'` (raise per-call for the two long
  transactions that legitimately need it). Make the values env-tunable and
  register them in `packages/config` validation and `render.yaml`.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM — a `statement_timeout` will start failing the
  long operations that currently succeed slowly. Set it after measuring, and
  exempt `tenant-erasure` and the payroll calculation explicitly.
- **Fix now:** YES

---

### RES-02 — Payroll calculation runs inline on the HTTP request, per employee, with no idempotency and no crash recovery

- **Category:** Performance / Concurrency
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/payroll/payroll-run.service.ts`, `payroll-run.controller.ts:169`
- **Evidence:**
  Entry point is a plain synchronous-return controller action, not a queue
  submission — `services/api/src/modules/payroll/payroll-run.controller.ts:169`:
  ```ts
  @Post('runs/:id/calculate')
  @Permissions('payroll-runs.calculate')
  calculatePayrollRun(
  ```
  The guard only rejects three statuses —
  `services/api/src/modules/payroll/payroll-run.service.ts:956-961`:
  ```ts
  if (
    run.status === PayrollRunStatus.APPROVED ||
    run.status === PayrollRunStatus.PAID ||
    run.status === PayrollRunStatus.LOCKED
  ) {
  ```
  `CALCULATING` is **not** in that list, so a second request enters while the
  first is still running.

  The work itself is two sequential per-employee loops with multiple awaited
  round-trips each — `payroll-run.service.ts:1004` and `:1179`:
  ```ts
  for (const employee of employees) {
    const compensation = await this.compensationResolver.resolveActiveCompensation({...});
    ...
    const benefitInputs = await this.benefitsService.resolvePayrollBenefits({...});
    ...
    const compensationRate = await this.exchangeRateService.lockRate({...});
  ```
  and later per employee: `payrollException.create`, `payrollRunEmployee.create`,
  `taxCalculationService.calculateTaxesForPayrollRunEmployee`,
  `includeLoanInputs`.

  State is moved to `CALCULATING` *before* the loop and only reset inside a
  JavaScript `catch` (`payroll-run.service.ts:1678-1698`):
  ```ts
  } catch (error) {
    await this.clearRunDraftData(user.tenantId, id, user.userId);
    await this.prisma.payrollRun.update({ where: { id }, data: { status: PayrollRunStatus.FAILED } });
  ```
  There is no `startedAt`-lease sweep and no reclaim job for `CALCULATING`.
- **Current behaviour:** one HTTP request performs the entire payroll
  calculation. For a 500-employee tenant that is well over 5,000 sequential
  database round-trips; at a conservative 10 ms each against Neon that is
  roughly 50–100 seconds of wall clock, holding one pool connection (RES-01) and
  one HTTP socket the whole time. A double-click issues a second calculation
  that calls `clearRunDraftData` and deletes the first run's partial rows out
  from under it. A deploy or OOM mid-run leaves the run permanently
  `CALCULATING` with partial `PayrollRunEmployee` rows.
- **Expected behaviour:** the endpoint should enqueue a job (the repository
  already has the pattern: `DataJobWorkerService`, `AttendanceReconciliation
  QueueService`) and return `202` with a run id; the calculation should claim
  the run with a conditional `updateMany` so a second request is a no-op; a
  stale-claim sweep should return abandoned `CALCULATING` runs.
- **Risk:** a payroll administrator sees a spinner for minutes and often a proxy
  timeout with no way to tell whether the run completed. A retry corrupts the
  first run's data. A deploy during month-end calculation strands the run with
  no operator recovery. Concurrently, one payroll calculation is enough to
  consume a tenth of the connection pool for the whole run.
- **Remediation:** add `CALCULATING` to the rejected-status list in
  `calculateDraftPayrollRun` as an immediate one-line guard against the
  double-click case. Then move the body behind a claimed job row, following
  `DataJobWorkerService.claimNextJob()`, and add a startup/interval sweep that
  fails runs stuck in `CALCULATING` past a lease.
- **Difficulty:** MEDIUM (guard is LOW; the queue move is MEDIUM)
- **Regression risk:** MEDIUM — the frontend currently expects the finished run
  in the response body.
- **Fix now:** YES for the `CALCULATING` guard; LATER for the queue move.

---

### RES-03 — Leave balance is checked at submission and decremented at approval, so pending requests are invisible and the balance can be overdrawn without limit

- **Category:** Concurrency / Data integrity
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/leave/leave.service.ts`, `leave-entitlement.service.ts`
- **Evidence:**
  The only balance check is inside `validateLeaveRequestAgainstPolicy`, called
  from the *create* path at `leave.service.ts:504`. The check reads the stored
  balance — `leave.service.ts:658-672`:
  ```ts
  const balance = await this.prisma.leaveBalance.findUnique({
    where: { tenantId_employeeId_leaveTypeId: { tenantId, employeeId, leaveTypeId: leaveType.id } },
  });
  const remaining = balance?.totalRemaining ?? new Prisma.Decimal(0);
  if (remaining.greaterThanOrEqualTo(totalDays)) return;
  ```
  The decrement happens only on approval —
  `leave.service.ts:2059-2079` (`recordApprovedLeaveConsumption`):
  ```ts
  update: {
    totalUsed: { increment: leaveRequest.totalDays },
    totalRemaining: { decrement: leaveRequest.totalDays },
  ```
  and `totalRemaining` is defined purely as allocation minus *consumed* —
  `leave-entitlement.service.ts:191`:
  ```ts
  totalRemaining: entitlement.minus(used),
  ```
  Grepping the approval path (`leave.service.ts:1780-1813`) shows
  `recordApprovedLeaveConsumption` is called with **no re-validation** of the
  balance or the negative-balance ceiling.
- **Current behaviour:** pending requests do not reduce `totalRemaining`. An
  employee with 5 days remaining can submit three separate 5-day requests; each
  passes the check independently. When all three are approved the balance
  becomes −10, silently past a `maximumNegativeBalance` of, say, 2. This does not
  require concurrency — it is deterministic. Under concurrency it is worse: two
  simultaneous submissions both read `remaining = 5` before either row exists.
- **Expected behaviour:** the availability check must count `PENDING` requests
  as encumbered (available = `totalRemaining` − sum of pending days), and the
  approval transition must re-validate the policy ceiling before incrementing
  `totalUsed`.
- **Risk:** unpaid/paid leave liability that HR did not authorise, carried into
  payroll (leave feeds `time-payroll`). The policy control that a tenant
  configured — `maximumNegativeBalance` — does not actually bind. Affects every
  tenant using leave.
- **Remediation:** in `validateLeaveRequestAgainstPolicy`
  (`leave.service.ts:603`), subtract the sum of `totalDays` over
  `LeaveRequest` rows with `status: PENDING` for the same
  `(tenantId, employeeId, leaveTypeId)`. Re-run the same validation inside
  `recordApprovedLeaveConsumption`'s transaction before the upsert, and reject
  the approval when it fails. A `@@check` is not available in Prisma; the
  re-validation inside the approval transaction is the enforcement point.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — tenants that have already overdrawn will start
  seeing approvals refused; that is the correct outcome but needs an
  announcement and possibly a one-off reconciliation report.
- **Fix now:** YES

---

### RES-04 — `/api/health` is a static `status: "ok"` payload, so a broken deploy and a dead database both report healthy

- **Category:** Resilience / Observability
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/main.ts`, `services/api/src/config/env.validation.ts`, `render.yaml`
- **Evidence:**
  `render.yaml:35` — `healthCheckPath: /api`
  `services/api/src/main.ts:87-89`:
  ```ts
  expressApp.get('/', (_req, res) => res.json(healthPayload()));
  expressApp.get('/api', (_req, res) => res.json(healthPayload()));
  expressApp.get('/api/health', (_req, res) => res.json(healthPayload()));
  ```
  and the payload — `services/api/src/config/env.validation.ts:227-241`:
  ```ts
  export function getRuntimeHealthPayload(env: NodeJS.ProcessEnv) {
    ...
    return { app: 'dijipeople-api', status: 'ok', environment: ..., commit, ... };
  }
  ```
  `status` is a string literal. Nothing in the handler touches Prisma, and the
  only dynamic field beyond the commit is `outboxWorker.enabled`, which reports
  a *config flag*, not whether the worker is actually ticking.
- **Current behaviour:** the endpoint answers `200 {"status":"ok"}` as long as
  the Node process is alive. It is a liveness probe, and Render is using it as
  the deploy gate and the rotation gate.
- **Expected behaviour:** liveness and readiness should be separate. Readiness
  should at minimum execute `SELECT 1` (with its own short timeout) and report
  whether each enabled worker has ticked within a multiple of its poll interval.
- **Risk:** three concrete consequences. (1) A deploy whose database is
  unreachable is marked successful and takes traffic. (2) An instance that has
  exhausted its connection pool (RES-01) stays in rotation, because the health
  route never asks for a connection. (3) A worker that stopped ticking — the
  outbox, the report scheduler — is invisible; the memory record
  `merging-main-does-not-guarantee-deploy` already shows the team verifying
  deploys by reading the commit hash off this endpoint, which is exactly the
  signal it *does* carry and the only one.
- **Remediation:** add `GET /api/health/ready` that runs
  `prisma.$queryRaw\`SELECT 1\`` under a 2-second timeout and reports each
  worker's `lastTickAt`, returning 503 when the database is unreachable. Point
  `render.yaml`'s `healthCheckPath` at it. Keep `/api` as the cheap liveness
  probe.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### RES-05 — An outbound `fetch` with no timeout is reachable from an authenticated tenant endpoint; Stripe has no explicit timeout or circuit breaker

- **Category:** Resilience / External calls
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/lookups/lookups.service.ts`, `services/api/src/modules/billing/services/stripe-billing.service.ts`
- **Evidence:**
  There are exactly five `fetch()` sites in the API. Four set a timeout; one
  does not — `services/api/src/modules/lookups/lookups.service.ts:872-874`:
  ```ts
  const response = await fetch(
    `https://open.er-api.com/v6/latest/${encodeURIComponent(fromCurrency)}`,
  );
  ```
  Compare the three that do —
  `services/api/src/modules/lookups/geographic-lookup.service.ts:178-180`:
  ```ts
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(GEOGRAPHY_API_TIMEOUT_MS),   // 3_000
  });
  ```
  Reachability, traced end to end:
  `configuration.controller.ts:82` `@Get('currencies/:id/rate-summary')` →
  `lookups.service.ts:399 getCurrencyRateSummary` →
  `lookups.service.ts:443 fetchAndStoreProviderRate` → the untimed `fetch`. The
  branch is taken whenever the stored rate is older than 12 hours
  (`isRateStale`, `lookups.service.ts:867-870`), so it fires on ordinary use of
  the currency settings screen.

  Stripe — `stripe-billing.service.ts:363-368`:
  ```ts
  const stripeConfig: Record<string, unknown> = {
    apiVersion,
  };
  return new Stripe(secretKey, stripeConfig);
  ```
  No `timeout`, no `maxNetworkRetries`.
- **Current behaviour:** the exchange-rate call inherits Node/undici defaults,
  which impose no total-request deadline (only a 300-second headers timeout), so
  a hung `open.er-api.com` holds the request, its HTTP socket and its pool
  connection for up to five minutes. Stripe falls back to the SDK's 80-second
  default and a single network retry; there is no circuit breaker anywhere in
  the codebase (`grep` for `circuit`/`breaker` returns nothing).
- **Expected behaviour:** every outbound call carries an explicit deadline. A
  third-party enrichment call that fails should degrade to the last stored value
  and say so — which `getCurrencyRateSummary` is already structured to do (it
  catches and populates `lastError`); it just never gets the chance because the
  call does not return.
- **Risk:** five concurrent settings-page loads against a hung upstream is half
  the connection pool (RES-01) gone for five minutes, from an endpoint any
  tenant admin can hit. For Stripe, an 80-second checkout hang is presented to a
  paying customer as a frozen page, and a Stripe brownout serialises into pool
  exhaustion the same way.
- **Remediation:** add `signal: AbortSignal.timeout(3_000)` to
  `lookups.service.ts:872`, matching `GEOGRAPHY_API_TIMEOUT_MS`. Pass
  `{ timeout: 10_000, maxNetworkRetries: 2 }` to `new Stripe(...)` in
  `buildStripeClient`. Add a lint rule or an invariant spec asserting every
  `fetch(` in `services/api/src` carries a `signal`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### RES-06 — The notification "queue" is a synchronous fallback: every tenant email is sent on the HTTP request thread, over a fresh SMTP connection, with no retry

- **Category:** Performance / Resilience
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/notifications/queues/notification-queue.service.ts`, `notifications/email/providers.ts`
- **Evidence:**
  `notification-queue.service.ts:45-77` — both branches call `executeSync`:
  ```ts
  if (!this.isQueueEnabled()) {
    return executeSync({ ... queue: { enabled: false, mode: 'sync' } ... });
  }
  this.logger.warn(JSON.stringify({
    message: 'Notification queue requested but BullMQ is not wired; using sync fallback.',
  }));
  return executeSync({ ... mode: 'sync-fallback' ... });
  ```
  and its own diagnostics say so — `:33`:
  ```ts
  note: 'BullMQ package/Redis worker is not wired in this workspace yet; sync fallback is active.',
  ```
  A new SMTP transport is created and torn down per message —
  `notifications/email/providers.ts:192`, `:284-305`, `:230-233`:
  ```ts
  const transport = this.createTransport(config);
  ...
  connectionTimeout: Number(config.connectionTimeoutMs ?? 10000),
  greetingTimeout: ...,
  socketTimeout: ...,
  ...
  } finally { transport.close(); }
  ```
  On failure it returns rather than retries — `:220-232`:
  ```ts
  // Surfaced to the delivery log rather than thrown, so one bad mailbox
  // does not abort the notification that triggered it.
  return { accepted: false, providerType: this.providerType, ... };
  ```
  There are 51 awaited notification dispatches across the codebase, in request
  handlers such as `payslips.service.ts:546` (`deliverPayslip`) and
  `payslips.service.ts:764`.
- **Current behaviour:** a tenant notification is a blocking SMTP conversation
  inside the request that triggered it — TCP + TLS + AUTH + DATA + QUIT, up to
  three 10-second timeouts if the relay is unreachable. Tenant-side email has no
  retry at all (only the *platform* side has `PlatformOutboundEmail` with
  `nextRetryAt`); a transient relay failure loses the notification permanently
  apart from a delivery-log row.
- **Expected behaviour:** the same durable-queue treatment the platform side
  already has, or the outbox, which is already in the process and already
  handles claim, retry and backoff.
- **Risk:** every state change that notifies is as slow as the mail relay and
  fails when it does. A relay outage adds up to 10 s (per attempt, per
  recipient) to user-facing requests such as payslip delivery, leave decisions
  and contract signature requests — and on top of RES-01 a mail-relay brownout
  becomes an API-wide connection-pool exhaustion.
- **Remediation:** route tenant email through the existing outbox — emit an
  event in the caller's transaction and let a handler send it — rather than
  wiring BullMQ and a Redis dependency the repository has deliberately avoided.
  That gives claim, backoff, `maxAttempts` and a dead-letter status for free.
  Failing that, mirror the `PlatformOutboundEmail` pattern for tenant email.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — callers that currently observe the send result
  synchronously (`deliverPayslip` sets `deliveredAt`) need reworking.
- **Fix now:** LATER (but it is the largest single resilience gap in the request path)

---

### RES-07 — The P2002 recovery pattern used inside interactive transactions cannot work on Postgres, and it is on the tenant-provisioning path

- **Category:** Concurrency / Resilience
- **Severity:** HIGH
- **Confidence:** CONFIRMED (the mechanism is proven empirically in this repository at this Prisma version by BUG-0070)
- **Known:** NEW (the *mechanism* is KNOWN — BUG-0070 — but these call sites are new)
- **Component:** `services/api/src/modules/users/identity.service.ts`, `services/api/src/modules/recruitment/recruitment.service.ts`
- **Evidence:**
  The mechanism, documented in this repository from a real failure —
  `services/api/src/modules/outbox/outbox.service.ts:41-52`:
  ```
  BUG-0070 — why this is `ON CONFLICT DO NOTHING` and not try/catch.
  ... a constraint violation **aborts the surrounding transaction**, so the read
  in the catch block fails with "current transaction is aborted, commands
  ignored until end of transaction block" — and because `emit` is required to
  run inside the caller's transaction, it poisons the caller's business write too.
  ```
  `docs/bugs/BUG-0070-...md:46` records the observed error:
  `DriverAdapterError: current transaction is aborted`.

  The same unusable pattern, on the provisioning path —
  `services/api/src/modules/users/identity.service.ts:53-74`:
  ```ts
  try {
    const created = await db.identity.create({ data: { email, passwordHash: ... } });
    return created.id;
  } catch (error) {
    ...
    const holder = await db.identity.findUnique({ where: { email }, select: { id: true } });
    if (holder) return holder.id;
    throw error;
  }
  ```
  `db` is a transaction client at every real caller:
  `super-admin.service.ts:1402` (`ensureIdentityForEmail(tx, ...)`),
  `tenant-control-plane/tenant-access.service.ts:212`, and
  `users.repository.ts:825`, which is itself invoked from
  `platform-onboarding.service.ts:246` inside `provisionTenantForCustomer`'s
  `$transaction`.

  And again in recruitment — `recruitment.service.ts:1790-1852`, a five-attempt
  retry loop whose `continue` re-issues `params.tx.employee.create` after a
  P2002, and whose duplicate recovery is `params.tx.employee.findFirst` at
  `:1836`. `params.tx` is `Prisma.TransactionClient`
  (`recruitment.service.ts:1737`) supplied by `$transaction` at `:1260` and
  `:1354`.
- **Current behaviour:** when the unique constraint actually fires, the
  transaction is already aborted. The recovery read throws
  `current transaction is aborted` rather than returning the winning row, and
  the retry loop's next `create` throws the same. The caller sees an opaque
  driver error instead of the graceful "someone else got there first" outcome
  the code was written to produce — and the whole enclosing transaction rolls
  back.
- **Expected behaviour:** either do the dedupe with `INSERT ... ON CONFLICT DO
  NOTHING` in raw SQL (exactly what `OutboxService.emit` does), or hoist the
  create out of the transaction, or wrap each attempt in an explicit `SAVEPOINT`.
- **Risk:** on the provisioning path this is a paid customer with no workspace —
  the same class of outcome as BUG-0900 (CRITICAL). Two people signing up with
  the same email at once, or a redelivered `PROVISIONING_REQUESTED` racing a
  manual provision, aborts the provisioning transaction with an error the outbox
  will retry and fail identically eight times. In recruitment it fails a HIRED
  stage transition.
- **Remediation:** rewrite `ensureIdentityForEmail` to a raw
  `INSERT INTO "Identity" ... ON CONFLICT ("email") DO NOTHING RETURNING "id"`
  followed by a normal read, copying `OutboxService.emit` verbatim in shape. Do
  the same for the employee-code loop in
  `recruitment.service.ts:ensureDraftEmployeeForHiredApplication`, or move it
  outside `tx`. Add an invariant spec that fails on `catch (P2002)` followed by a
  read on a `TransactionClient`.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** YES

---

### RES-08 — Three of five database-backed job queues have no crash recovery: a restart strands jobs permanently

- **Category:** Resilience / Background jobs
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Component:** `data-management/data-job-worker.service.ts`, `attendance-engine/attendance-reconciliation-queue.service.ts`, `timesheets/timesheet-jobs.service.ts`
- **Evidence:**
  The outbox does this correctly and documents why —
  `outbox/outbox-dispatcher.service.ts:12-20, 139-166`:
  ```ts
  const CLAIM_LEASE_MS = 5 * 60 * 1000;
  ...
  private async reclaimExpiredClaims(): Promise<number> {
    const cutoff = new Date(Date.now() - CLAIM_LEASE_MS);
    const reclaimed = await this.prisma.outboxEvent.updateMany({
      where: { status: OutboxEventStatus.CLAIMED, claimedAt: { lt: cutoff } },
  ```
  The other three do not. `DataJob` is claimed —
  `data-job-worker.service.ts:85-88`:
  ```ts
  const claim = await this.prisma.dataJob.updateMany({
    where: { id: candidate.id, status: DataJobStatus.QUEUED },
    data: { status: DataJobStatus.PROCESSING, startedAt: new Date() },
  ```
  — but `grep` for any reader of `DataJobStatus.PROCESSING` finds only the two
  writers (`data-job-worker.service.ts:87`,
  `import-execution.service.ts:259`); nothing ever sweeps it.
  Same for `AttendanceReconciliationJobStatus.RUNNING`
  (`attendance-reconciliation-queue.service.ts:168-177`) and
  `TimesheetJobStatus.RUNNING`, which additionally *hard-blocks* a re-run —
  `timesheet-jobs.service.ts:85-86`:
  ```ts
  if (existing?.status === TimesheetJobStatus.RUNNING)
    throw new ConflictException('This idempotent job is already running.');
  ```
  Shutdown does not drain either — every worker's `onModuleDestroy` clears the
  timer and orphans the in-flight promise, e.g.
  `data-job-worker.service.ts:41-44`:
  ```ts
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  ```
- **Current behaviour:** a deploy, OOM or crash while a job is mid-flight leaves
  the row `PROCESSING`/`RUNNING` forever. A `DataJob` import shows a permanent
  spinner. An attendance reconciliation for an employee-day never completes and,
  because `enqueue` deduplicates against PENDING **and** RUNNING
  (`attendance-reconciliation-queue.service.ts:80-84`), that employee-day can
  never be re-queued either — their attendance is silently wrong forever. A
  timesheet job stuck `RUNNING` makes its idempotency key permanently
  unusable.
- **Expected behaviour:** each queue carries a lease and a reclaim sweep, as the
  outbox does. Every worker already writes `startedAt`, so the data is there.
- **Risk:** silent, permanent data gaps that nobody is notified about. The
  attendance case is the worst: it is both invisible and self-sealing. Deploys
  are frequent here, so this is a routine occurrence rather than a rare one.
- **Remediation:** add a `reclaimExpired()` at the top of each worker's cycle,
  modelled on `OutboxDispatcherService.reclaimExpiredClaims`: `updateMany` where
  status is the in-flight one and `startedAt < now - lease`, returning the row to
  the pending pool without consuming an attempt.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### RES-09 — 239 of 241 `$transaction` calls run on Prisma's default 5-second timeout, the exact cause of a prior CRITICAL production incident

- **Category:** Resilience
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN (BUG-0900 — the mechanism and one call site; the rest of the surface is untreated)
- **Component:** repository-wide; `super-admin/platform-onboarding.service.ts` in particular
- **Evidence:**
  ```
  $ grep -rn '\$transaction(' services/api/src --include=*.ts | grep -v spec | wc -l
  241
  $ grep -rn 'timeout:\s*[0-9]' services/api/src --include=*.ts | grep -v spec
  services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts:230:  { timeout: 120_000 },
  services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts:411:  { timeout: 120_000 },
  ```
  The incident is recorded in
  `docs/bugs/BUG-0900-tenant-provisioning-exceeds-the-5s-transaction-timeout-a-pai.md`
  (Severity CRITICAL, Status VERIFIED) and restated in the fixed code —
  `permissions/permission-bootstrap.service.ts:192-208`:
  ```
  A tenant's system roles carry **6,345** privilege rows. The loop that used
  to be here issued one `upsert` per row, sequentially, inside the caller's
  interactive transaction — and Prisma's default interactive transaction
  timeout is five seconds. Self-service provisioning therefore failed with
  `A query cannot be executed on an expired transaction ... 5001 ms passed`,
  after the customer's card had already been charged.
  ```
  That specific loop was fixed. The transaction it lives in was not given a
  timeout — `platform-onboarding.service.ts:201`:
  ```ts
  const onboardingResult = await this.prisma.$transaction(async (tx) => {
  ```
  and it still performs 15+ awaited operations including
  `bootstrapTenantDefaults`, two `usersRepository.create` calls,
  `billingService.createOrUpdateSubscription` and `createInvoice`.
- **Current behaviour:** provisioning still succeeds only if the whole
  fifteen-step sequence finishes inside five seconds. The record itself says it
  "succeeded only when the machine happened to be fast enough". The margin was
  widened; the cliff was not moved.
- **Expected behaviour:** transactions whose duration is a function of data
  volume declare an explicit timeout sized to the worst realistic case.
- **Risk:** a Neon latency excursion, a busier database, or a future addition to
  the provisioning sequence reproduces BUG-0900 — a charged card and no
  workspace — and the outbox will exhaust its eight attempts and stop.
- **Remediation:** pass `{ timeout: 30_000, maxWait: 10_000 }` to the
  `$transaction` in `provisionTenantForCustomer` and to the other
  volume-dependent ones (payslip generation, `recordApprovedLeaveConsumption`'s
  enclosing transaction, the recruitment stage transition). Add an invariant
  spec listing the transactions that are permitted to use the default.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### RES-10 — In-process workers with no leader election; horizontal scaling is prevented only by a storage side effect

- **Category:** Concurrency / Architecture
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Component:** all seven `setInterval` workers; `render.yaml`
- **Evidence:**
  The seven in-process background loops, all started from `onModuleInit`:

  | Worker | File:line | Interval | Enabled by | Re-entrancy guard | Cross-instance claim |
  |---|---|---|---|---|---|
  | Outbox dispatcher | `outbox/outbox-worker.service.ts:53` | 5 s | `OUTBOX_WORKER_ENABLED` | `this.running` | **yes** — `FOR UPDATE SKIP LOCKED` |
  | Report scheduler | `reporting/schedule/report-scheduler.worker.ts:113` | 60 s | `REPORTS_SCHEDULER_ENABLED` | `this.running` | yes — conditional `nextRunAt` bump |
  | Workforce snapshot | `reporting/snapshot/workforce-snapshot.worker.ts:86` | 1 h | `REPORTS_WORKFORCE_SNAPSHOT_ENABLED` | `this.running` | partial — `hasSnapshot` check-then-act |
  | Data job worker | `data-management/data-job-worker.service.ts:36` | 5 s | always on | `cycleRunning` | yes — conditional `updateMany` |
  | Attendance reconciliation | `attendance-engine/attendance-reconciliation-queue.service.ts:56` | 30 s | always on | `draining` | yes — conditional `updateMany` |
  | Timesheet scheduled cycle | `timesheets/timesheet-jobs.service.ts:47` | 15 min | always on | `scheduledCycleRunning` | **no** — read-then-upsert on the idempotency key |
  | Platform email retry | `platform-communications/platform-communications.service.ts:48` | 5 min | always on | `retryRunning` | **no** — only a 5-minute `lastAttemptAt` window |

  There is exactly one advisory lock in the whole API, and it is not in a worker
  — `payroll/payroll.service.ts:444`:
  ```ts
  Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${currentUser.tenantId}:${payrollCalendarId}`}))`
  ```
  `grep -rn "pg_advisory|leader"` returns nothing else. Single-instance is
  guaranteed only by the disk — `render.yaml:44-49`:
  ```
  # TRADEOFF: a Render disk pins this service to a SINGLE INSTANCE — it cannot
  # be attached to a horizontally scaled service. `starter` runs one instance,
  ```
- **Current behaviour:** safe today, because there is exactly one instance. The
  outbox and report scheduler would remain safe on many; the timesheet cycle and
  the platform email retry would not.
- **Expected behaviour:** every worker either claims its work at the database or
  is gated behind a leader lease, so scaling out is a config change rather than a
  correctness change.
- **Risk:** the day the API is scaled out — or the day a second service, a cron
  runner, or a `ts-node` script boots the Nest container with these flags set —
  every instance runs the timesheet scheduled cycle. The idempotency guard in
  `timesheet-jobs.service.ts:71-86` is `findUnique` → branch → `upsert`, and two
  instances that both read `existing === null` both proceed to `execute()`. The
  platform email retry would send up to 50 duplicate emails per cycle per
  instance to real customers, since its only guard is a 5-minute window read
  outside any lock.
- **Remediation:** wrap each cycle in `pg_try_advisory_lock(hashtext('worker:<name>'))`
  held for the cycle, released at the end — one statement, no new
  infrastructure, and it makes the single-instance assumption explicit rather
  than accidental. Convert the timesheet cycle's guard to a conditional
  `updateMany` claim on `TimesheetJobExecution`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER — but before any decision to scale the API out or move file
  storage to S3 (which is what removes the disk pin).

---

### RES-11 — Excel and PDF generation are synchronous CPU work on the event loop, inline in the request

- **Category:** Performance
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Component:** `common/excel/excel-export.service.ts`, `contracts/contracts.service.ts`
- **Evidence:**
  `common/excel/excel-export.service.ts:25, 70-73`:
  ```ts
  buildWorkbookBuffer(definition: ExcelWorkbookDefinition): Buffer {
    ...
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  ```
  Not `async`, not awaited, no worker thread — the whole serialisation runs on
  the single JS thread. Four inline callers:
  `payroll/payroll-export.providers.ts:90`,
  `payroll/payroll-operations.service.ts:1215`,
  `reporting/export/report-export.service.ts:239`,
  `timesheets/timesheet-export.service.ts:404`.

  PDF — `contracts/contracts.service.ts:6305-6325`, called from
  `contracts.service.ts:4348` in a request path. `pdfkit` document construction
  and every `.text()` layout call is synchronous; only the stream `end` is
  async.
- **Current behaviour:** while a workbook is serialised or a PDF laid out,
  **nothing else on the instance runs** — not other requests, not the health
  check, not a worker tick. A bank-payment export or a payroll report for a
  large tenant is hundreds of milliseconds to seconds of solid blocking.
- **Expected behaviour:** exports over any meaningful row count go through
  `DataJobWorkerService`, which already exists for exactly this
  (`ExportExecutionService.runExport`), or onto a `worker_threads` pool.
- **Risk:** a single large export freezes every concurrent user of the tenant
  *and every other tenant on the instance*. Because the instance is single (RES-10),
  there is no second instance absorbing traffic. Combined with a 0.5-CPU
  `starter` container, this is the most likely source of the "the app froze for
  everyone" report.
- **Remediation:** route the payroll, timesheet and reporting export endpoints
  through the existing `DataJob` EXPORT path rather than building the buffer
  inline. Where a synchronous build must stay, cap the row count and return 413
  above it.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — the endpoints currently return the file
  directly; a job-based flow changes the client contract.
- **Fix now:** LATER

---

### RES-12 — Unbounded concurrent SMTP fan-out via `Promise.all`

- **Category:** Cascading failure / External calls
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Component:** `platform-communications/platform-communications.service.ts`, `contracts/contracts.service.ts`, `leads/leads.service.ts`
- **Evidence:**
  `platform-communications/platform-communications.service.ts:181-206`:
  ```ts
  async retryDueEmails(limit = 50) {
    const due = await this.prisma.platformOutboundEmail.findMany({
      where: { status: 'FAILED', nextRetryAt: { lte: new Date() }, attemptCount: { lt: 6 } },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return Promise.all(
      due.map(async (delivery) => this.sendEmail({ ... })),
    );
  ```
  Each `sendEmail` opens its own transport (RES-06), so this is up to 100
  simultaneous TCP+TLS+AUTH connections to the relay every five minutes.

  Same shape in request paths: `contracts/contracts.service.ts:3355-3357`
  (`Promise.all(tokens.map(... this.communications.sendEmail ...))` — one per
  contract signatory) and `leads/leads.service.ts:388-390` (one per platform
  admin, reached from the public lead-capture endpoint).

  There are 237 `Promise.all(` sites overall; none of them impose a concurrency
  limit (`grep` for `p-limit`, `pLimit`, `concurrency` finds nothing).
- **Current behaviour:** N simultaneous outbound connections where N is the row
  count, with no cap.
- **Expected behaviour:** a bounded concurrency (4–8) for anything fanning out
  over network I/O, and a pooled SMTP transport.
- **Risk:** commercial relays cap concurrent connections per account (SES, SendGrid
  and Gmail all do). Exceeding the cap gets connections refused, which the code
  records as a *delivery failure* — so the retry cycle's own concurrency is what
  makes its retries fail, and `attemptCount` climbs to 6 and gives up. The
  emails involved are invitations, contract signature requests and payment
  failures.
- **Remediation:** replace the `Promise.all` in `retryDueEmails` with a bounded
  sequential/chunked loop (the report scheduler at
  `report-scheduler.worker.ts:492` already sends one recipient at a time and
  documents why). Enable nodemailer's `pool: true, maxConnections: 5` on the
  transport and cache it per provider configuration instead of building one per
  message.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### RES-13 — Agent telemetry retention runs a four-table bulk DELETE inline on a heartbeat request, throttled only by an in-process map

- **Category:** Performance / Resilience
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/agent/agent.service.ts`
- **Evidence:**
  `agent.service.ts:983-998` — the heartbeat endpoint:
  ```ts
  async heartbeat(currentUser: AuthenticatedUser, dto: HeartbeatDto) {
    ...
    await this.enforceTelemetryRetention(currentUser.tenantId, settings);
  ```
  `agent.service.ts:1240-1247` — the only throttle is process memory:
  ```ts
  const lastCleanupAt = this.retentionCleanupByTenant.get(tenantId) ?? 0;
  if (now - lastCleanupAt < AGENT_RETENTION_CLEANUP_INTERVAL_MS) { return; }   // 60 * 60 * 1000
  this.retentionCleanupByTenant.set(tenantId, now);
  ```
  `agent.service.ts:1256-1282` — the work:
  ```ts
  await this.prisma.$transaction([
    this.prisma.activityEvent.deleteMany({ where: { tenantId, occurredAt: { lt: cutoff } } }),
    this.prisma.agentLocationRequest.deleteMany({ ... }),
    this.prisma.dailyProductivitySummary.deleteMany({ ... }),
    this.prisma.workSession.deleteMany({ ... }),
  ]);
  ```
  Unbatched, no `LIMIT`, default 5-second transaction timeout (RES-09).
  `dlp/dlp.service.ts:61` has the identical `retentionRunByTenant` pattern on
  the DLP ingest path.
- **Current behaviour:** once an hour per tenant, one unlucky desktop agent's
  heartbeat pays for the whole tenant's telemetry pruning. `ActivityEvent` is
  the highest-volume table in the product (one row per agent sample). The
  throttle map resets on every restart, so retention re-runs on the first
  heartbeat after every deploy.
- **Expected behaviour:** retention is a background job, batched
  (`deleteMany` in chunks of a few thousand, looping until the count is zero),
  with the last-run timestamp persisted rather than held in process memory.
- **Risk:** the agent sees a heartbeat that hangs and then fails with P2028
  after 5 s, so retention never actually completes on a large tenant and the
  table grows without bound — while every hour a heartbeat is sacrificed to
  discovering that. Concurrently it holds a pool connection and takes locks on
  four hot tables.
- **Remediation:** move `enforceTelemetryRetention` and
  `DlpService.maybeRunRetention` into an interval worker following the
  `WorkforceSnapshotWorker` shape, batch the deletes, and persist the last-run
  timestamp on the tenant's agent settings row.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### RES-14 — The V8 heap cap is set above the container's memory limit

- **Category:** Memory / Resilience
- **Severity:** MEDIUM
- **Confidence:** LIKELY — the unverified link is the actual memory ceiling of the Render `starter` web plan at this account's tier; I read the plan name from `render.yaml`, not the dashboard
- **Known:** NEW (the change itself is recorded — `docs/sessions/SESSION-0027-hotfix-api-production-heap-cap-to-1536mb.md`, a `HOTFIX_PRODUCTION`)
- **Component:** `services/api/package.json`, `render.yaml`
- **Evidence:**
  `services/api/package.json:55`:
  ```json
  "start:prod": "node --max-old-space-size=1536 dist/src/main.js",
  ```
  `render.yaml:5`:
  ```yaml
  plan: starter
  ```
  The change was shipped as a production hotfix —
  `docs/sessions/SESSION-0027-hotfix-api-production-heap-cap-to-1536mb.md`
  (`TASK_TYPE: HOTFIX_PRODUCTION`, `TARGET_BRANCH: main`), preceded by
  SESSION-0025, which means the process was dying of memory pressure.
- **Current behaviour:** V8 is told it may grow its old space to 1.5 GB. If the
  container ceiling is below that, V8 will not run its emergency compaction
  before the kernel OOM-kills the process — the container dies at, say, 512 MB
  with V8 still believing it has a gigabyte of headroom. Raising the cap in that
  situation makes crashes *more* likely, not less, because it delays GC.
- **Expected behaviour:** `--max-old-space-size` set to roughly 75–80 % of the
  container's actual memory limit, so V8 collects hard before the kernel
  intervenes.
- **Risk:** an OOM kill is indistinguishable from a crash: in-flight requests are
  dropped, and every stranded job (RES-08) becomes permanent. It also silently
  reverses the fix that was hotfixed in.
- **Remediation:** confirm the instance's real memory limit in the Render
  dashboard (`RENDER_MEMORY_LIMIT` or the plan page) and set
  `--max-old-space-size` to 0.75 × that. If the service genuinely needs 1.5 GB
  of heap, the plan must be raised — the flag cannot create memory. Add the real
  ceiling as a comment beside the script so the next person does not repeat the
  hotfix.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES (it is a one-line verification)

---

### RES-15 — Payslip numbers are allocated by check-then-act, at up to 101 sequential queries per employee, inline in the request

- **Category:** Concurrency / Performance
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/payslips/payslips.service.ts`
- **Evidence:**
  `payslips.service.ts:898-914`:
  ```ts
  const existingCount = await this.prisma.payslip.count({
    where: { tenantId, payslipNumber: { startsWith: `${prefix}-` } },
  });
  for (let sequence = existingCount + 1; sequence < existingCount + 100; sequence += 1) {
    const payslipNumber = `${prefix}-${String(sequence).padStart(3, '0')}`;
    const exists = await this.prisma.payslip.findFirst({
      where: { tenantId, payslipNumber }, select: { id: true },
    });
    if (!exists) return payslipNumber;
  }
  ```
  The constraint exists (`schema.prisma:8970` — `@@unique([tenantId, payslipNumber])`)
  but the allocator neither uses it nor recovers from it — the caller at
  `payslips.service.ts:136` takes the number and then creates the row, with no
  P2002 handling.

  Bulk generation is a sequential loop over every employee in the run —
  `payslips.service.ts:262-277`:
  ```ts
  for (const employee of run.employees) {
    generated.push(await this.generatePayslipForRunEmployee({ ... }));
  ```
- **Current behaviour:** two concurrent generations for the same
  employee-period select the same free number; one create fails with an
  unhandled P2002, and in the bulk path it is swallowed into `skipped` with a
  raw Prisma message. Performance-wise, `generatePayslipsForRun` for 500
  employees is 500 × (1 count + ≥1 findFirst + 1 transaction), all inline in the
  HTTP request — the same shape as RES-02.
- **Expected behaviour:** attempt the insert and retry on P2002 (the pattern
  `createPayrollRunRecord` at `payroll-run.service.ts:1710` already uses
  correctly, *outside* a transaction), or derive a number that cannot collide.
- **Risk:** payslip generation failing for a subset of a run at month-end,
  reported only as a per-employee "skipped" line, plus a multi-minute blocking
  request.
- **Remediation:** replace the scan with insert-and-retry on the existing unique
  constraint, and move `generatePayslipsForRun` behind the `DataJob` worker.
- **Difficulty:** LOW (the number); MEDIUM (the bulk path)
- **Regression risk:** LOW
- **Fix now:** YES for the allocator

---

### RES-16 — The timesheet scheduled cycle loads every active tenant with nested users every 15 minutes and runs four jobs per tenant sequentially

- **Category:** Performance / Scalability
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/timesheets/timesheet-jobs.service.ts`
- **Evidence:**
  `timesheet-jobs.service.ts:47-51` — always on, no env flag, unlike every other
  worker:
  ```ts
  this.timer = setInterval(() => void this.runScheduledCycle(), 15 * 60 * 1000);
  ```
  `timesheet-jobs.service.ts:542-575`:
  ```ts
  const tenants = await this.prisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, ownerUser: {...}, users: { where: { status: 'ACTIVE' }, ..., take: 1 } },
  });
  const jobs: TimesheetJobType[] = [ WEEK_OPENING, OVERDUE_DETECTION, EXPORT_GENERATION, RESTRICTION_REMOVAL ];
  for (const tenant of tenants) {
    ...
    for (const jobType of jobs) {
      try { await this.run(user, { jobType }); }
  ```
  No `take`, no cursor, no batching. `run()` is the full job executor, and
  `EXPORT_GENERATION` reaches `TimesheetExportService` and therefore
  `buildWorkbookBuffer` (RES-11) — synchronous CPU on the event loop.
- **Current behaviour:** every 15 minutes the process loads all active tenants
  into memory and executes 4 × N jobs serially. The re-entrancy guard means a
  cycle that runs longer than 15 minutes simply skips the next tick, so at scale
  the jobs quietly stop running on schedule with nothing reporting it.
- **Expected behaviour:** paged tenant iteration, per-job due-time so a job is
  not attempted 96 times a day to be short-circuited by its idempotency key, and
  an env flag matching every other worker.
- **Risk:** at 50 tenants this is 200 job executions every 15 minutes, each of
  which runs several queries even to decide it is a no-op, plus a blocking
  workbook build. At 500 tenants the cycle never finishes and timesheet
  automation silently stops.
- **Remediation:** page the tenant query, compute a `nextRunAt` per
  (tenant, jobType) and select only due rows — the `ReportSchedulerWorker`
  already implements exactly this pattern and can be followed directly. Add
  `TIMESHEET_SCHEDULER_ENABLED`.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

### RES-17 — Payments recorded from an invoice without a payment-intent id use `findFirst`-then-`create` with no unique constraint

- **Category:** Idempotency / Concurrency
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/billing/services/webhook.service.ts`
- **Evidence:**
  The good path is guarded by a unique index —
  `schema.prisma:8379` `stripePaymentIntentId String? @unique`, used at
  `webhook.service.ts:1254-1257`.

  The fallback path is not — `webhook.service.ts:1285-1310`:
  ```ts
  const existingForInvoice = await tx.payment.findFirst({
    where: { invoiceId: input.internalInvoiceId, status: input.status },
  });
  if (existingForInvoice) { return tx.payment.update({ ... }); }
  return tx.payment.create({ data: { tenantId, subscriptionId, invoiceId, amount, ... } });
  ```
  There is no `@@unique([invoiceId, status])` on `Payment`
  (`schema.prisma:8370-8396` lists only indexes).

  The webhook's outer dedupe is also read-then-act —
  `webhook.service.ts:165-181`: `ensureWebhookEventRecord` creates or reads the
  row, then `processStripeEvent` short-circuits only on `PROCESSED`/`IGNORED`.
  Two concurrent deliveries of the same event both see `RECEIVED` and both
  dispatch.
- **Current behaviour:** if Stripe delivers `invoice.paid` twice concurrently
  (its at-least-once contract permits this), and the invoice carries no
  `payment_intent`, both transactions read no existing payment under READ
  COMMITTED and both insert. The result is two `Payment` rows for one payment.
- **Expected behaviour:** the uniqueness that makes duplicate delivery safe
  should be a database constraint, not a read.
- **Risk:** double-counted revenue on the invoice and in
  `dashboard`/`reporting` aggregates, and a customer who appears to have paid
  twice. Financial data, so severity is not lowered by the low probability.
- **Remediation:** add `@@unique([invoiceId, status])` to `Payment` in
  `schema.prisma` with a migration, and convert the fallback branch to
  insert-and-catch-P2002-then-update *outside* the transaction (see RES-07 for
  why not inside). Additionally, claim the webhook row itself with a conditional
  `updateMany` from `RECEIVED` → `PROCESSING` so a concurrent redelivery is a
  no-op.
- **Difficulty:** MEDIUM (needs a duplicate check before the constraint can be added)
- **Regression risk:** MEDIUM — existing duplicate rows would block the migration.
- **Fix now:** LATER

---

### RES-18 — The outbox claim lease can expire under a slow handler and double-dispatch it

- **Category:** Idempotency
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/outbox/outbox-dispatcher.service.ts`
- **Evidence:**
  `outbox-dispatcher.service.ts:21` — `const CLAIM_LEASE_MS = 5 * 60 * 1000;`
  `outbox-dispatcher.service.ts:139-166` reclaims any `CLAIMED` row older than
  the lease *unconditionally*: it does not check whether the claiming process is
  still alive, and there is no heartbeat renewal while a handler runs.
  The per-consumer guard is itself a read-then-act —
  `outbox-dispatcher.service.ts:215-227`:
  ```ts
  const alreadyDone = await this.prisma.outboxEventConsumption.findUnique({ ... });
  if (alreadyDone?.succeeded) { continue; }
  ```
- **Current behaviour:** a handler that legitimately takes longer than five
  minutes — `ProvisioningRequestedHandler`, which creates a whole tenant, is the
  realistic candidate — has its row reclaimed and re-dispatched while the first
  invocation is still running. Both invocations then run the handler
  concurrently, because neither has yet written a `succeeded` consumption row.
- **Expected behaviour:** the lease is renewed while the handler runs, or the
  reclaim excludes rows whose `claimedBy` matches a live instance.
- **Risk:** low today — `ProvisioningRequestedHandler` has a second layer of
  idempotency (`if (order.tenantId) return PROCESSED`,
  `provisioning-requested.handler.ts:104-110`), and the process is single. The
  risk is that a future handler without its own guard inherits an unstated
  at-most-once assumption the dispatcher does not actually provide.
- **Remediation:** renew `claimedAt` on a timer while a handler runs, or size
  `CLAIM_LEASE_MS` above the slowest handler and document the requirement in
  `outbox.types.ts`'s `OutboxHandler` contract.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### RES-19 — Interval-only scheduling with no persisted last-run: the 24-hour retention job may never fire

- **Category:** Background jobs
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/error-logs/error-logs.service.ts`
- **Evidence:**
  `error-logs.service.ts:61-67`:
  ```ts
  onModuleInit() {
    this.retentionTimer = setInterval(
      () => void this.cleanupExpiredLogs(),
      24 * 60 * 60 * 1000,
    );
  ```
  The first fire is 24 hours *after boot*. Nothing runs it at startup and no
  last-run timestamp is persisted anywhere. The delete is also unbatched —
  `error-logs.service.ts:286-288`:
  ```ts
  const result = await this.prisma.errorLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  ```
  (Default 5 s transaction budget does not apply here — it is a single statement
  — but it holds one pool connection and takes locks for its whole duration.)
- **Current behaviour:** on a service that redeploys more than once a day, the
  timer is reset before it ever fires and `ErrorLog` retention never runs. This
  repository deploys frequently.
- **Expected behaviour:** run once shortly after boot, then on the interval;
  persist the last run so a restart does not reset the clock; delete in bounded
  batches.
- **Risk:** unbounded growth of `ErrorLog`, which is written on *every* handled
  exception including routine 401s and 404s (`BUG-1754` records that it was
  filling with scanner traffic). When it eventually does run after a long
  uptime, the single unbatched DELETE will be very large.
- **Remediation:** schedule the first tick at boot + a few minutes, persist
  `lastRetentionRunAt` in configuration, and loop `deleteMany` with a bounded
  `id IN (SELECT ... LIMIT 5000)` until the count is zero.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### RES-20 — A duplicate DLP screenshot leaks its encrypted bytes onto the persistent disk

- **Category:** Resource leak / Idempotency
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/agent/dlp/dlp.service.ts`
- **Evidence:**
  `dlp/dlp.service.ts:183-208`:
  ```ts
  // Store the encrypted bytes first; only then record the row that points at
  // them. A failed store must not leave a row referencing bytes that are not there.
  const encrypted = this.encryption.encrypt(event.imageBase64);
  const stored = await this.storage.saveFile({ buffer: ..., subdirectory: `${DLP_SCREENSHOT_PREFIX}/${user.tenantId}` });
  const created = await this.createIdempotently(() => this.prisma.screenCaptureEvent.create({ ... }));
  if (created) { accepted += 1; ... }
  ```
  When `createIdempotently` returns `null` (the `dedupeKey` already exists), the
  file written a line earlier is never referenced and never deleted. No sweeper
  exists (`grep` for orphaned-storage cleanup finds nothing).
- **Current behaviour:** every replayed screenshot batch — which is the normal
  behaviour of a desktop agent retrying a failed upload — writes a full-size
  encrypted PNG to `/var/data/storage` that nothing points at.
- **Expected behaviour:** delete the stored file when the row turns out to be a
  duplicate.
- **Risk:** the Render disk is 5 GB and also holds tenant documents, branding
  assets and published agent installers (`render.yaml:50-57`). Filling it breaks
  document upload and release publishing, not just DLP. Also worth noting on the
  same path: `encryption.encrypt` is synchronous AES over up to ~8 MB of base64
  (`ScreenCaptureBatchDto` allows 3 per batch on a 25 MB JSON body,
  `main.ts:156`), which is CPU on the event loop.
- **Remediation:** `if (!created) await this.storage.deleteFile(stored.storageKey);`
  in `ingestScreenshotEvents`. Add a periodic sweep for storage keys with no
  referencing row.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### RES-21 — `generateTenantCode` is `max + 1` with no lock and no collision recovery

- **Category:** Concurrency
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/common/utils/tenant-code.util.ts`
- **Evidence:**
  `common/utils/tenant-code.util.ts:8-19`:
  ```ts
  const latest = await db.tenant.findFirst({
    where: { tenantCode: { startsWith: `${TENANT_CODE_PREFIX}-` } },
    orderBy: { tenantCode: 'desc' },
  });
  const latestNumber = Number(latest?.tenantCode?.replace(/^TEN-/, '') ?? 0);
  const nextNumber = Number.isFinite(latestNumber) ? latestNumber + 1 : 1;
  ```
  `schema.prisma:2063` — `tenantCode String? @unique`. The single caller is
  inside a transaction — `platform-onboarding.service.ts:207`:
  ```ts
  tenantCode: await generateTenantCode(tx),
  ```
  and there is no P2002 handling around it.
- **Current behaviour:** two provisionings starting within the same moment read
  the same latest code and both compute the same next one. The unique index
  refuses the second, aborting the provisioning transaction with an unhandled
  P2002 — and per RES-07 no in-transaction recovery would work anyway.
- **Expected behaviour:** a Postgres sequence, or `max+1` with an
  insert-and-retry loop outside the transaction.
- **Risk:** narrow — it requires two provisionings within milliseconds — but the
  outcome is the BUG-0900 shape: a paid order whose provisioning event fails and
  retries into the same collision.
- **Remediation:** back `tenantCode` with a Postgres sequence
  (`CREATE SEQUENCE tenant_code_seq`) and read `nextval` inside the transaction;
  that is atomic and collision-free by construction. Compare the correct
  precedent for a random identifier at `super-admin/billing.service.ts:317-322`
  (invoice numbers use entropy + a five-attempt insert retry).
- **Difficulty:** LOW
- **Regression risk:** LOW (the sequence must be seeded above the existing max)
- **Fix now:** LATER

---

### RES-22 — Expired subscription orders are never swept because the API has no scheduler for it

- **Category:** Background jobs
- **Severity:** HIGH (as recorded)
- **Confidence:** CONFIRMED (by reading the record and confirming no caller exists)
- **Known:** KNOWN (BUG-2618, `Status: OPEN`, `ArchitectDisposition: FIX_NOW`, `RelatedBacklogItem: ITEM-0119`)
- **Component:** `billing`, `super-admin`
- **Evidence:**
  `docs/bugs/BUG-2618-expired-subscription-orders-are-never-swept-abandonexpired-h.md:1-30`:
  ```
  Title: Expired subscription orders are never swept: abandonExpired has no caller and the API has no scheduler
  Status: OPEN / Severity: HIGH / ArchitectDisposition: FIX_NOW
  ... A workspace name has been unpurchasable since 2026-08-22 and nothing reports it.
  ```
  I confirm the premise is still true at this commit: `ReportSchedulerWorker`
  (added later, `report-scheduler.worker.ts:60-63` says "BUG-2618 records that
  this API has no scheduler at all... so this class is the pattern the next
  recurring job will copy") exists, but no worker calls `abandonExpired`.
- **Remediation:** the pattern the record was waiting for now exists. Add an
  `abandonExpired` sweep following `ReportSchedulerWorker`'s claim-and-advance
  shape.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES — the blocker cited in the record (no scheduler) is gone.

---

### RES-23 — Demo-data reseed executes a 1,200-line seed inline in an HTTP request with no lock

- **Category:** Performance
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Component:** `services/api/src/modules/demo-data/demo-data.service.ts`
- **Evidence:**
  `demo-data.service.ts:20-25`:
  ```ts
  async reseed(user: AuthenticatedUser) {
    this.assertResetEnabled();
    await deleteDemoData(this.prisma, user.platform?.id);
    await runDemoSeed();
    return this.getSummary();
  }
  ```
  `runDemoSeed` is imported straight from the seed script
  (`demo-data.service.ts:4` → `services/api/prisma/seed-demo.ts:51`, a
  1,214-line file). No claim, no lock, no job.
  It is gated — `demo-data.service.ts:27-35`: `ENABLE_DEMO_DATA_RESET !== 'true'`
  → 403, and that variable is absent from `render.yaml`, so it is off in
  production.
- **Risk:** limited to environments that enable it, where two concurrent
  reseeds interleave delete and seed and produce a partially-populated tenant.
  The request also blocks a pool connection for the full seed duration.
- **Remediation:** route through `DataJobWorkerService`, or at minimum take
  `pg_try_advisory_lock` so a second reseed returns 409.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### RES-24 — No circuit breakers, no dead-letter surface outside the outbox, no outbound rate limiting

- **Category:** Resilience
- **Severity:** INFORMATIONAL
- **Confidence:** NOT OBSERVED — searched specifically and found nothing
- **Component:** repository-wide
- **Evidence:**
  ```
  $ grep -rn "circuit|breaker|bulkhead|p-limit|pLimit|opossum" services/api/src --include=*.ts
  (no matches beyond unrelated words)
  ```
  Retry policy exists only where a durable row backs it: the outbox
  (`BACKOFF_SECONDS = [10, 30, 120, 300, 900, 1800, 3600]`,
  `outbox-dispatcher.service.ts:24`), attendance reconciliation
  (`RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 240]`,
  `attendance-reconciliation-queue.service.ts:37`) and platform email
  (`2 ** attemptCount` minutes capped at 60,
  `platform-communications.service.ts:173-175`). Tenant email, Stripe API calls
  and the exchange-rate call have none.

  Dead-lettering exists only for the outbox (`OutboxEventStatus.FAILED` /
  `MANUAL_ACTION_REQUIRED`) and, partially, for attendance reconciliation
  (`FAILED` rows are kept for an operator, `attendance-reconciliation-queue.service.ts:211-217`).
  `DataJob` failures are terminal with a `failureReason` and no retry.
- **Risk:** informational. Recorded so the final report can state what is
  deliberately absent rather than overlooked. Given the modular-monolith
  posture, a full circuit-breaker library is probably not warranted; timeouts
  (RES-05) and bounded concurrency (RES-12) buy most of the protection.
- **Fix now:** NO

---

## Failure-mode walkthrough

Reasoned from the code above; each row cites the mechanism that decides the
outcome.

| Event | What actually happens | Assessment |
|---|---|---|
| **Postgres down** | `JwtAuthGuard` and `HttpExceptionFilter` both classify P1001/P1002/P1017 and render a 503 rather than a 500 (`common/filters/http-exception.filter.ts:517-533`, `common/guards/jwt-auth.guard.ts:433-449`). Workers log and retry on the next tick without crashing (`outbox-worker.service.ts:110-116`). `/api/health` still says `ok`, so Render keeps the instance in rotation (RES-04). | **Good degradation, broken signalling** |
| **Postgres slow** | Pool of 10 saturates; further requests wait indefinitely for a connection (RES-01). No `statement_timeout`. Nothing sheds load. | **Cascading failure** |
| **Neon cold start** | Not applicable — `docs/deployment/platform-access.md:209` records "**Scale-to-zero is off.** A slow first request is *not* a cold start." Verified as absent. | **Healthy** |
| **Email provider fails** | Tenant email: up to three 10-second SMTP timeouts *inside the request* (RES-06), then the notification is lost with only a delivery-log row. Platform email: durable row, 6 attempts, exponential backoff — but the retry cycle's own unbounded concurrency may be what causes the failures (RES-12). | **Poor for tenant email** |
| **Stripe down** | Up to 80 s per API call with one built-in retry and no breaker (RES-05). Inbound webhooks are durable (`StripeWebhookEvent` + `retryStoredEvent`) and correctly return non-2xx to request redelivery (`webhook.service.ts:210-244`) — that half is well built. | **Inbound good, outbound weak** |
| **Object storage fails** | `StorageService` uses async `fs` against the Render disk; a write failure throws and is surfaced. DLP ingest orders store-then-row correctly (RES-20 is the inverse leak). No storage health check. | **Acceptable** |
| **Gateway unreachable** | No impact on the API. The .NET gateway *polls* the API (`gateway-runtime.service.ts:352` — "re-reads its whole history each poll"); there are no outbound calls from the API to the gateway. Attendance simply stops arriving. | **Healthy by design** |
| **Worker crashes mid-batch** | Outbox: recovered after a 5-minute lease (`reclaimExpiredClaims`). Data jobs, attendance reconciliation, timesheet jobs: **stranded permanently** (RES-08). | **Half-covered** |
| **Restart during a payroll run** | The run stays `CALCULATING` with partial `PayrollRunEmployee` rows; no sweep exists. A re-POST is the only recovery and it silently deletes and restarts (RES-02). | **Bad** |
| **Deploy during active requests** | `app.enableShutdownHooks()` is set (`main.ts:41`), so Nest closes the HTTP server and in-flight requests drain. Background work does **not** drain: `onModuleDestroy` clears the timer and orphans the running promise in every worker. | **Requests good, workers not** |

---

## Healthy — verified good

These were checked specifically and are correctly implemented. Several are
better than the industry norm and should be cited as the in-repo patterns to
copy.

- **The transactional outbox is the reference implementation in this codebase.**
  Claiming uses `FOR UPDATE SKIP LOCKED` in a single statement
  (`outbox/outbox-dispatcher.service.ts:174-200`); crash recovery is a claim
  lease with an explicit non-increment of `attemptCount`
  (`:139-166`); retry is bounded exponential backoff to a `FAILED` /
  `MANUAL_ACTION_REQUIRED` terminal state (`:24`, `:262-282`); and per-consumer
  idempotency is a durable `OutboxEventConsumption` row so a redelivery re-runs
  only the consumers that failed (`:215-227`).
- **Emitting an event is atomic with the business write it announces.**
  `OutboxService.emit` requires the caller's transaction client and dedupes with
  raw `ON CONFLICT DO NOTHING` precisely so a P2002 cannot poison it
  (`outbox/outbox.service.ts:56-96`) — the correct answer to RES-07.
- **The one advisory lock in the codebase is in the right place.** Payroll
  period generation serialises per `(tenant, calendar)` with
  `pg_advisory_xact_lock` (`payroll/payroll.service.ts:444`).
- **Raw attendance ingestion is genuinely idempotent and correctly decoupled.**
  Deduplication is a server-derived fingerprint plus a unique constraint absorbed
  by `createMany({ skipDuplicates: true })` in 500-row chunks
  (`attendance-integrations/ingestion/raw-attendance-ingestion.service.ts:285-296`),
  and the endpoint enqueues rather than reconciling inline, with the reasoning
  written down (`attendance-reconciliation-queue.service.ts:17-27`).
- **Reconciliation enqueue is deduplicated by a partial unique index rather than
  a pre-check** (`attendance-reconciliation-queue.service.ts:76-104`), with the
  race explicitly reasoned about in the comment.
- **Agent heartbeat is idempotent.** `dedupeKey` + unique index, P2002 treated as
  success, any other error rethrown (`agent/agent.service.ts:1032-1053`) — the
  documented fix for BUG-0036.
- **Tenant provisioning is idempotent at two layers.** The dispatcher will not
  re-run a succeeded consumer, and the handler independently checks
  `order.tenantId` for the crash-between-provision-and-settle case
  (`super-admin/provisioning-requested.handler.ts:30-35, 104-110`).
- **Stripe webhook ingestion is durable and correctly signalled.** Events are
  persisted before dispatch, a not-ready event stays `RECEIVED` and rethrows so
  Stripe redelivers rather than being falsely acknowledged, and a `FAILED` event
  is operator-retryable (`billing/services/webhook.service.ts:165-244, 288-318`).
- **Payment recording keyed by `stripePaymentIntentId` is constraint-backed**
  (`schema.prisma:8379`, `webhook.service.ts:1254-1281`) — only the no-intent
  fallback is unsafe (RES-17).
- **Leave consumption uses atomic `increment`/`decrement`, not read-modify-write**
  (`leave/leave.service.ts:2075-2078`) — the balance *arithmetic* is correct; the
  problem in RES-03 is when it is validated, not how it is applied.
- **Payroll run numbers retry correctly on the unique constraint, outside a
  transaction** (`payroll/payroll-run.service.ts:1695-1720`) — the pattern RES-07
  and RES-21 should adopt.
- **Invoice numbers use entropy plus a five-attempt insert retry rather than
  `max+1`** (`super-admin/billing.service.ts:317-330`).
- **Every worker is guarded against overlapping itself** and every timer is
  `unref`'d so a CLI invocation of the Nest container cannot hang — consistent
  across all seven (`outbox-worker.service.ts:97-100, 56-58`,
  `data-job-worker.service.ts:47-49`, and so on).
- **The two workers that are off by default document why**, and it is the right
  reason: a worker that starts in every process starts in tests and seeds
  (`outbox-worker.service.ts:24-28`, `report-scheduler.worker.ts:66-70`).
- **Database-unavailable errors are classified rather than leaking as 500s**
  (`common/filters/http-exception.filter.ts:517-533`,
  `common/guards/jwt-auth.guard.ts:433-449`).
- **Graceful shutdown hooks are enabled** (`main.ts:41`).
- **Neon scale-to-zero is off**, so cold-start latency is not a live failure mode
  (`docs/deployment/platform-access.md:209`).
- **Body size limits are set per route and deliberately reasoned**, rather than
  left at a global default (`main.ts:141-166`).
- **The report scheduler claims by advancing `nextRunAt` in the filter**, which
  is a correct optimistic claim, and it explicitly refuses a service-identity
  fallback for a deactivated owner (`report-scheduler.worker.ts:220-249, 72-79`).
- **Geographic lookup calls all carry `AbortSignal.timeout(3000)`** and the FX
  refresh carries a 4-second timeout plus an in-flight de-duplication map
  (`lookups/geographic-lookup.service.ts:178, 285, 361`;
  `super-admin/platform-fx.service.ts:56, 95, 489-514`) — four of five outbound
  calls are done correctly, which is why the fifth stands out.
- **The public tenant-resolve cache cannot be grown by an attacker** — a miss
  throws `NotFoundException` before `cache.set`, so only real tenants occupy
  entries (`tenants/public-tenants.service.ts:80-109`).
- **SMTP has connection, greeting and socket timeouts** (10 s each,
  `notifications/email/providers.ts:301-303`).

---

## Not examined / limits

- **Nothing was executed.** No server was started, no query timed, no load
  generated. Every duration in this report is an estimate derived from the
  number of sequential round-trips in the code, not a measurement. The payroll
  and payslip timing claims in RES-02 and RES-15 in particular deserve a real
  measurement against a tenant with a realistic employee count before they are
  used to size a fix.
- **The actual Render instance memory limit was not read from the dashboard**,
  only the plan name from `render.yaml`. RES-14 is LIKELY for that reason and
  needs one dashboard check to become CONFIRMED or be withdrawn.
- **`node-postgres` default values** (`max: 10`, `connectionTimeoutMillis: 0`)
  were taken from the library contract, not verified at runtime against
  `@prisma/adapter-pg@7.8.0`. The claim that *no configuration is passed* is
  CONFIRMED; the specific numbers are not.
- **Prisma's savepoint behaviour inside interactive transactions** was not
  independently verified for 7.8. RES-07 rests instead on BUG-0070, which is an
  empirical record of the same failure in this repository at this version — I
  consider that sufficient, but it is second-hand.
- **Production observability was not consulted.** No Render logs, no Neon
  metrics, no error-log table contents. Several findings (RES-08 stranded jobs,
  RES-19 retention never running, RES-14 OOM kills) would be confirmed or
  refuted in minutes by looking at production data, and that is the highest-value
  follow-up.
- **`apps/*` were not audited** beyond one check of `apps/web/lib/server-api.ts`
  for outbound timeouts. Frontend concurrency, React Server Component caching and
  Next.js route-handler behaviour belong to another specialist.
- **The .NET gateway** (`gateway/`) was checked only for its call direction (it
  polls; the API never calls it). Its own retry, resilience and concurrency were
  not examined.
- **`attendance-engine`'s reconciliation *logic*** was read only far enough to
  establish its queueing and locking behaviour. Whether `reconcile()` is itself
  idempotent for a given employee-day — it appears to be, via
  `skippedBecauseLocked` — was not traced end to end.
- **I did not enumerate all 237 `Promise.all` sites.** I inspected the ones over
  network I/O and over unbounded database result sets. There may be more
  unbounded fan-outs in modules I did not open (`customization`,
  `platform-runtime`, `partner-experience` each have one).
- **Rate limiting on public endpoints** (`PublicRateLimitGuard`) was not
  assessed; it belongs to the security specialist, but it materially affects
  whether RES-05 and RES-12 are remotely triggerable.

---

## Routed to other specialists

- **Schema:** `Payment` has no `@@unique([invoiceId, status])`
  (`schema.prisma:8370-8396`) — the constraint RES-17 needs.
- **Frontend:** `apps/admin` appears to have no equivalent of
  `apps/web/lib/server-api.ts`'s `timeoutMs` handling
  (`apps/web/lib/server-api.ts:125-131`); an admin page calling a hung API would
  hold a Next.js server request indefinitely. Worth confirming.
- **Security:** `POST /api/agent/dlp/screenshot-events` accepts a 25 MB JSON body
  (`main.ts:156`) and performs synchronous AES over it
  (`dlp/dlp.service.ts:185`). Whether that route is rate-limited determines
  whether it is a denial-of-service vector.
- **Security / AuthZ:** the timesheet scheduled cycle executes tenant jobs under
  a fabricated `systemUser` built from the tenant owner or an arbitrary active
  user (`timesheets/timesheet-jobs.service.ts:562-565`); the authorization
  implications of that synthetic identity are not mine to judge.
- **Query performance:** `timesheet-jobs.service.ts:542` loads every active
  tenant with a nested user selection and no `take`; `super-admin.service.ts:975`
  maps every tenant through an async mapper with no pagination.
