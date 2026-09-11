---
ID: PLAN-032
---

CONTEXT_FILES_REQUIRED:
  - AGENTS.md                                    (tenant isolation N/A here, but validation commands, no-invented-commands rule)
  - PLANS.md                                      (this template, evidence labelling)
  - docs/deployment/smoke-tests.md                (S1/S3 rewritten by this plan)
  - .agent/context/repository-health.md           (deployment health framing)

SPECIALIST_AGENTS_REQUIRED:
  - backend-api  — main.ts / AppService change, new probe helper, spec
  - reviewer     — confirms the probe cannot become the outage-overloading query it is designed to avoid

DELIBERATELY_NOT_USED:
  - database      — no schema change, no migration
  - frontend      — no UI surface
  - integration   — no external system contract change

SINGLE_WRITER_FILES:
  - none (touches services/api/src/main.ts, not a listed single-writer file)

QA_REQUIRED: yes — a deployed-environment manual verification step is mandatory (see Testing strategy); automation alone cannot prove Render's behaviour.

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - BUG-0904 — a health field added to `AppService.getHealth()` shipped and had
    zero effect, because `main.ts` answers `/`, `/api` and `/api/health` with
    express handlers registered *before* Nest's router, bypassing
    `AppController`/`AppService` entirely. This is the single most important
    fact for whoever implements this plan: **the database probe must be wired
    into `main.ts`'s `healthPayload()`, not into `AppService.getHealth()`**,
    or this plan repeats BUG-0904 exactly.

REGRESSION_ENTRIES_IN_SCOPE:
  - none found naming this endpoint beyond BUG-0904 itself (not a REG- entry;
    it is a bug record with its own regression test, see below)

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL for implementation; verification of Render behaviour needs a real deployed environment
DEPLOYMENT_REQUIRED:      yes (api)
DEPLOYMENT_COMPONENTS:    api
DEPLOYMENT_ORDER:         api only — no dependent frontend or migration
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  yes — this plan changes what a release report can assert
POST_DEPLOY_QA_REQUIRED:  yes — must observe the field on the live deployment at least once, and ideally observe it flip during a deliberate DB-unreachable drill in a non-production environment
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    none identified at authoring time — check `node scripts/session.mjs list` before starting, `main.ts` and `app.service.ts` are shared files any session could be mid-edit on
ENVIRONMENT_DEPENDENCIES: none new. Uses the existing `DATABASE_URL` / `PrismaService` already required at boot.

---

# ExecPlan — Health check reports database reachability (ITEM-0009, remaining half)

## Objective

`GET /api/health` (and only that path — see Requirements) reports whether the
API process can currently reach its database, with a bounded timeout, as an
additive JSON field alongside the existing `commit`/`status`/`outboxWorker`
fields. `scripts/smoke-deployment.mjs` hard-fails when it is not reachable,
the same way it already hard-fails when the outbox worker is not enabled. A
release report can then state, from outside the system, both the deployed SHA
(already true since ITEM-0010) and database reachability — closing ITEM-0009's
stated Acceptance Criteria — without opening the Render console or weakening
`GET /api` (Render's own `healthCheckPath`) as a liveness signal.

## Business requirement

`docs/qa/README.md`/Release-DevOps role: after a deployment, Release/DevOps
must be able to verify database health from outside the system. Today it
cannot (**FACT**, `services/api/src/app.service.ts` / `main.ts`, see Existing
behavior). `TODO: Confirm product/business rule` — there is no customer-facing
requirement here; this is purely an internal release-verification capability,
sourced from `ITEM-0009` and `.agent/agents/release-devops.md`'s "Observability
expectations".

## Existing behavior

**FACT**, `services/api/src/main.ts:65-89`: three express routes — `/`, `/api`,
`/api/health` — are registered directly on the underlying Express instance
*before* `app.listen()`, and answer with a `healthPayload()` closure built from
`getRuntimeHealthPayload(process.env)` plus `outboxWorker: { enabled: ... }`.
These bypass Nest's router entirely. The comment at `main.ts:65-81` documents
exactly why: `AppController`/`AppService.getHealth()`
(`services/api/src/app.service.ts:8-27`, `services/api/src/app.controller.ts`)
exist, are unit-tested, and are **unreachable in production** for these three
paths — BUG-0904 shipped a fix to `AppService` that had zero effect for this
exact reason.

**FACT**, `render.yaml:39`: `healthCheckPath: /api`. This is what Render's
deploy/rollout health check polls — not `/api/health`.

**FACT**, `docs/deployment/smoke-tests.md`, scenario S1/S3: "S1 exists because
S1 cannot fail: the health endpoint returns a hardcoded `ok` and tests no
dependency. **Never treat S1 alone as proof of a healthy system.**" S3
("Database connectivity") is currently satisfied only by "an authenticated
read returns data — not the health endpoint."

**FACT**, `scripts/smoke-deployment.mjs:53-116`: already has a working pattern
for exactly this shape of change — the `outboxWorker.enabled` hard-fail check,
added for BUG-0904, is a JSON-body field on `/health` that the smoke suite
asserts on and fails the run over, without changing the endpoint's HTTP status
code.

**FACT**, `services/api/src/health-payload-is-served.spec.ts`: a source-reading
regression spec exists specifically because of BUG-0904 — it asserts (a) the
express handlers are the ones bypassing Nest, (b) all three paths serve the
*same* payload built the *same* way, (c) the runtime payload fields
(`commit`, `status`, …) survive being extended, and (d) the file's own comment
still documents the bypass. Any change to `healthPayload()`'s shape or to
which paths call it must keep this spec's assertions true or extend them
deliberately.

**FACT**, `services/api/src/common/prisma/prisma.service.ts:16-30`: `PrismaService`
extends `PrismaClient`, constructed with `@prisma/adapter-pg` from
`DATABASE_URL`, and is a normal Nest-injectable singleton already resolved via
`app.get(...)` elsewhere in `main.ts` for `OutboxWorkerService` (`main.ts:82`)
— the exact pattern to reuse for the database probe.

## Existing architecture

- `services/api/src/main.ts` — bootstrap, the express bypass routes, DI
  container access via `app.get(...)`.
- `services/api/src/config/env.validation.ts` — `getRuntimeHealthPayload`,
  the pure, env-derived half of the payload.
- `services/api/src/common/prisma/prisma.service.ts` — the only Prisma
  client instance; already how every other module reaches the database.
- `services/api/src/modules/outbox/outbox-worker.service.ts` —
  `isEnabled()`, the sibling health field this plan's field is modelled on.
- `scripts/smoke-deployment.mjs` — the external verification suite; already
  distinguishes hard-fail checks (outbox) from informational ones (commit).
- `docs/deployment/smoke-tests.md` — the scenario table this plan must update
  (S1, S3) once the health endpoint tests a real dependency.

## Requirements

1. `GET /api/health` returns an additive `database: { reachable: boolean,
   latencyMs?: number, checkedAt: string, error?: string }` field. `reachable`
   is computed by a real, bounded-timeout database round trip on every
   request — not cached, not computed once at boot, because reachability can
   change over the life of the process (that is the entire point).
2. `GET /` and `GET /api` (Render's `healthCheckPath`) are **not** changed to
   depend on database reachability. They keep returning the existing
   `healthPayload()` shape unchanged (or, if `database` is added there too for
   consistency, its computation must never affect the HTTP status code or
   response latency in a way that could make Render consider a live process
   unhealthy during a real database outage). See Risks — this is a deliberate
   choice, not an oversight, and a reviewer must be able to see that the
   implementation makes it, not merely permits it.
3. The probe has a bounded timeout (recommend 1500ms, configurable is
   over-engineering for a single internal endpoint — hardcode with a comment
   explaining the number). A timeout counts as `reachable: false`, not as an
   unhandled rejection that 500s the health endpoint itself — a health
   endpoint that throws is worse than one that reports accurately.
4. `scripts/smoke-deployment.mjs` gains a new hard-failing check —
   `database.reachable === true` — modelled exactly on the existing
   `outboxWorker.enabled` check (same file, same pattern: read `/health`, read
   the field, throw with a specific, actionable message if false).
5. `docs/deployment/smoke-tests.md` scenario S1 and S3 are rewritten to state
   the new truth: S1 (`GET /api`) is unchanged, still process-liveness-only;
   S3 (database connectivity) is now **also** verifiable from `/api/health`
   directly, though the existing "authenticated read returns data" check
   remains as the deeper, permission-aware proof — the health field proves
   reachability, not that queries return tenant-correct data.
6. `services/api/src/health-payload-is-served.spec.ts` is extended, not
   replaced, with assertions that the database field is built into the same
   `healthPayload()` closure all three routes share (guarding against a repeat
   of BUG-0904 where a fix lands on the unreachable producer).
7. A new colocated unit spec proves the probe's own logic (reachable case,
   timeout case, thrown-error case) without needing a real database — the
   `PrismaService` dependency is injectable and therefore mockable.

## Dependencies

None blocking. `ITEM-0010` (deployed-commit resolver) is already `DONE`,
satisfying the item's own stated revisit trigger.

## Files / modules affected

Backend (`services/api`):
- `services/api/src/main.ts` — `healthPayload` becomes `async`; the two
  `expressApp.get(...)` handlers that should carry the DB field call
  `await healthPayload()`; a new probe function is called from here.
- New: `services/api/src/common/health/database-reachability.ts` (or similar)
  — a small, pure-ish, unit-testable function `checkDatabaseReachability(prisma,
  { timeoutMs })` returning the shape in Requirement 1. Kept out of `main.ts`
  itself so it has a colocated spec without importing the whole bootstrap file.
- New: `services/api/src/common/health/database-reachability.spec.ts`.
- `services/api/src/health-payload-is-served.spec.ts` — extended per
  Requirement 6.

Scripts:
- `scripts/smoke-deployment.mjs` — new check, modelled on the existing outbox
  one.

Docs:
- `docs/deployment/smoke-tests.md` — S1/S3 rewritten.

No frontend, no schema, no permission, no migration files.

## Database impact

None. No model, migration, or index change. The probe is a read-only,
side-effect-free query (`SELECT 1` equivalent) against the existing
connection pool `PrismaService` already holds — it does not open a new
connection per call by default (Prisma reuses its pool), so this does not add
meaningful load. State this explicitly in code comments, since "queries the
database on every health check" is exactly the kind of change a future
reader will reasonably want reassurance about.

## Backend impact

- `checkDatabaseReachability`: takes the already-injected `PrismaService`
  singleton (resolved once via `app.get(PrismaService, { strict: false })`
  at bootstrap, exactly like `OutboxWorkerService` at `main.ts:82`) and a
  timeout. Runs `Promise.race([prisma.$queryRaw\`SELECT 1\`, timeoutPromise])`.
  Returns `{ reachable: true, latencyMs }` or `{ reachable: false, error:
  <short classification>, latencyMs }`. Never throws.
- `healthPayload()` becomes `async () => ({ ...getRuntimeHealthPayload(env),
  outboxWorker: {...}, database: await checkDatabaseReachability(prisma, {
  timeoutMs: 1500 }) })`.
- No new endpoint, no new controller, no new DTO — this is entirely inside
  the existing bypass routes per Requirement 2's constraint.

## Frontend impact

None. No app renders this field today; it exists for `scripts/smoke-deployment.mjs`
and for a human reading `/api/health` directly during an incident.

## Permission / RBAC impact

None. `/api/health` (via the express bypass) carries no auth today and this
plan does not add any — it already reports `commit`/`environment`, which is
the same class of information (deployment metadata, not tenant data). No new
permission key.

## Tenant-isolation impact

None. No tenant-scoped query, no `tenantId`, no per-tenant data. The probe
query is not against any tenant-owned model.

## Audit / event / logging impact

None required — this is observability infrastructure, not a state-changing
operation. Optionally log a single `Logger.warn` line when `reachable` flips
to `false`, so it appears in the same startup/runtime log a human would
already be reading during an incident — **PROPOSAL**, not required for the
Definition of Done.

## Integration impact

None. No external system's contract changes. Render's `healthCheckPath`
(`/api`) behaviour is explicitly preserved unchanged (Requirement 2) — this is
the integration-safety property the whole plan is designed around.

## Migration / data compatibility

N/A — no schema change. Already-deployed clients are unaffected; this is a
new, additive JSON field on an internal endpoint no committed frontend or the
desktop agent parses today (verify with a repo-wide grep for `outboxWorker`/
`.database` reads against `/health` before merging, to catch anything that
might now choke on an unexpected field — **INFERENCE**, likely none, since
the same additive pattern already landed once for `outboxWorker` with no
reported fallout).

## Parallel-safe tasks

- Writing `database-reachability.ts` + its spec: `PARALLEL_SAFE` (new files,
  no shared-file contention).
- Updating `docs/deployment/smoke-tests.md`: `PARALLEL_SAFE`.

## Dependency-blocked tasks

- Wiring the probe into `main.ts` and extending
  `health-payload-is-served.spec.ts`: `DEPENDENCY_BLOCKED` on the probe
  function existing first.
- Extending `scripts/smoke-deployment.mjs`: `DEPENDENCY_BLOCKED` on the field
  actually being served (there is no value in writing the smoke check before
  the field exists to check).

## Integration tasks

- Final wiring in `main.ts`, full `services/api` test run, and the manual
  Render-environment verification below. `INTEGRATION`, runs last.

## Testing strategy

- `npm --workspace api run test -- database-reachability` — new unit spec:
  reachable (mock `$queryRaw` resolves), unreachable via thrown error (mock
  rejects), unreachable via timeout (mock never resolves, real timer via
  jest fake timers or a short real timeout in the test).
- `npm --workspace api run test -- health-payload-is-served` — extended spec
  passes with the new field wired into the same shared closure.
- `npm --workspace api run check-types`.
- `npm --workspace api run lint`.
- Manual, because automation cannot prove Render's actual behaviour:
  1. Deploy to a non-production environment (or run locally against the local
     Postgres).
  2. `curl <host>/api/health` — confirm `database.reachable: true` and a
     plausible `latencyMs`.
  3. Stop or firewall the database (or, locally, point `DATABASE_URL` at a
     port nothing listens on and restart the process) and confirm
     `database.reachable: false` with a bounded response time (must return in
     ~1.5s, not hang).
  4. Confirm `curl <host>/api` (Render's own path) still returns 200
     immediately in both cases — proving Requirement 2 held.
  5. Run `npm run smoke:deployment` against the healthy case (passes) and
     capture what it prints against the broken case (must fail with a message
     naming the database, not a generic timeout).
  Record this as a QA run under `docs/qa/runs/`.

## Risks

1. **A slow-but-not-down database makes `/api/health` itself slow, and
   something (a monitor, a human) mistakes endpoint latency for an outage.**
   Likelihood: low. Impact: low (informational endpoint only, per Requirement
   2). Mitigation: the 1500ms bound caps worst-case latency; document the
   number's reasoning in code.
2. **Someone later "simplifies" by making `/api` (Render's path) depend on the
   same probe, coupling deploy health to database health and causing Render to
   cycle a perfectly-alive process during a real DB outage — arguably making
   an outage worse, not better observed.** Likelihood: medium, this is the
   natural-looking next edit. Impact: high (deployment thrashing during an
   incident). Mitigation: Requirement 2 is explicit and testable
   (`health-payload-is-served.spec.ts` should assert `/api`'s handler and
   `/api/health`'s handler remain distinguishable, or at minimum that
   `render.yaml`'s `healthCheckPath` is never changed by this work) — the
   Reviewer must check this specifically, called out in
   `SPECIALIST_AGENTS_REQUIRED` above.
3. **Repeating BUG-0904 exactly** — wiring the probe into `AppService`
   instead of `main.ts`'s express bypass. Likelihood: medium if this plan is
   skimmed rather than read. Impact: a fix that ships and does nothing, again.
   Mitigation: this plan's `KNOWN_BUG_PATTERNS_IN_SCOPE` and Existing behavior
   section state it three times on purpose; the extended
   `health-payload-is-served.spec.ts` assertions are the mechanical guard.

## Rollback considerations

`ROLLBACK_CLASS: CODE_ONLY`. Revert the commit; no migration, no data,
nothing to backfill or undo. If the probe itself misbehaves in production
(e.g. the timeout value is wrong for real network conditions), the safe
forward fix is adjusting the timeout constant, not reverting — reverting loses
the observability the item exists to add. If `/api/health` starts timing out
under load because of the extra query, the same forward fix applies before a
revert is considered — that would itself be evidence worth its own bug record
about connection pool exhaustion, which this plan does not currently believe
is a risk (see Database impact) but a reviewer should re-check under real load
if this ever happens.

## Definition of Done

- [ ] `checkDatabaseReachability` implemented with a colocated spec covering
      reachable / error / timeout.
- [ ] `main.ts`'s `healthPayload()` includes `database`, and both `/api` and
      `/api/health` (or only `/api/health` — implementer's call within
      Requirement 2's constraint) are covered by
      `health-payload-is-served.spec.ts`'s extended assertions.
- [ ] `render.yaml` `healthCheckPath` unchanged; a reviewer has explicitly
      confirmed Render's deploy-health behaviour is untouched.
- [ ] `scripts/smoke-deployment.mjs` hard-fails on `database.reachable !==
      true`.
- [ ] `docs/deployment/smoke-tests.md` S1/S3 updated to state the new truth.
- [ ] `npm --workspace api run test`, `check-types`, `lint` all pass.
- [ ] Manual verification against a real (non-production) deployment
      performed and recorded as a QA run, including the "confirm `/api` is
      unaffected while DB is down" step.
- [ ] No unrelated file changed.
