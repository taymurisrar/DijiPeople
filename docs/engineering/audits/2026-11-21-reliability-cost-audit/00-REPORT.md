# Reliability, performance and cost audit — 2026-11-21

Session: SESSION-0135 · Branch: `agent/perf-reliability-hardening` (from `origin/develop` @ 33238a05)
Builds on, and does not replace, [`../2026-09-10-full-technical-audit/00-EXECUTIVE-AUDIT-REPORT.md`](../2026-09-10-full-technical-audit/00-EXECUTIVE-AUDIT-REPORT.md).
Finding ids below (RES-01, ORCH-04, RATE-01, OBS-01 …) are that audit's; their *current* status is stated only where re-checked on this branch.

## How to read the evidence

| Mark | Meaning |
|---|---|
| **Code** | seen in source at the cited path on this branch |
| **Test** | a spec/CI check exists; **executed** only where stated under "Executed" |
| **Live** | read from a live system by me, read-only, on 2026-11-21 |
| **Reported** | supplied in the task brief from the owner's connectors; I did not re-verify it |
| **Estimate** | arithmetic on published prices; never an invoice |

Never in this document: invented costs, invented latencies, or claims about production behaviour I did not observe.

## Executed (what was actually run)

| Check | Result |
|---|---|
| `jest pool-config.spec.ts readiness.spec.ts` (services/api, 14 tests) | **PASS** 14/14 |
| `eslint --max-warnings=0` on the three new source files + specs | **PASS** (clean) |
| `tsc --noEmit -p tsconfig.build.json` | **No error in any file I touched.** The command still reports errors elsewhere (`super-admin.service.ts`, `bank-transfer*`, `seed-config.ts`) because this worktree junctions the primary checkout's *stale generated Prisma client and `@repo/config`*. Environmental, not caused by this change; CI regenerates the client and is the real verdict. |
| `node scripts/check-render-config.mjs` | runs; reports 67 declared / 33 declared-but-absent-live / 98 live. **Informational — not a pass/fail on drift.** |
| Full API suite, `validate:framework`, `backlog:check`, web/admin suites | **NOT RUN locally** in this session. Pending CI. |
| Render API `GET /v1/services/srv-d7js7fqqqhas739v4i7g` | **Live** read-only |
| Neon, Vercel, Cloudflare, GitHub billing | **NOT queried.** No Claude-side credentials were discovered for them; their figures below are *Reported*. |

## Implemented on this branch

| # | Change | Why | Rollback |
|---|---|---|---|
| 1 | `services/api/src/common/prisma/pool-config.ts` + wired into `prisma.service.ts` — bounded pool connect wait, default 15 s; opt-in `DATABASE_POOL_MAX`, `…_IDLE_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS` | RES-01 (2026-09-10): node-postgres default waits forever when the pool is saturated, so overload looks like a hang. Statement timeout deliberately **off** by default — payroll/import/package-ALM have never had one and a default would kill legitimate work. | revert one commit; or set `DATABASE_POOL_CONNECTION_TIMEOUT_MS` very high |
| 2 | `GET /api/health/ready` (`common/health/readiness.ts`, route in `main.ts`) — `SELECT 1` with a 3 s timeout, 200/503, concurrent probes coalesced, no driver message in the body | Separates "is the DB reachable" from liveness. `/api/health` is unchanged. **Not wired to Render's health check** (a Neon blip must not restart a healthy process). | delete the route |
| 3 | `render.yaml`: `plan: starter` → `standard`, with the reason; four pool env vars declared (`sync: false`) | Live is Standard. Applying the old file as a blueprint (which the BUG-0767 header instructs) would downgrade to 512 MB while observed memory is 585–749 MB. | revert |
| 4 | `docs/environment-variables.md` | registers the new variables | revert |

Nothing was applied to Render, Neon, Vercel or any data. `healthCheckPath` was **not** changed in `render.yaml` (see decisions).

## Live-versus-repository drift

| Item | `render.yaml` (before) | Live | Evidence | Disposition |
|---|---|---|---|---|
| Plan | `starter` | **standard** | Live (API) | file corrected in this branch |
| Instances | not declared | 1 | Live | matches decision "keep one" |
| Region | not declared | virginia | Live | declare? (low) |
| Health-check path | `/api` | **empty** | Live | **decision D1** |
| Auto-deploy / branch / root dir | n/a | yes / main / `services/api` | Live | consistent with brief |
| Build command | `npm ci && npm --workspace api run build` | `npm ci --include=dev && NODE_OPTIONS="--max-old-space-size=6144" npm run build` | Live | **differs**; a 6 GB heap request only works because builds run on Render's build machine, not the 2 GB runtime. Heavy build ⇒ explains the no-cache profile cost. Not changed. |
| Pre-deploy command | `npm --workspace api run release` | **`NODE_OPTIONS="--max-old-space-size=4096" npm --workspace api run release`** (field `serviceDetails.envSpecificDetails.preDeployCommand`) | Live (re-verified 2026-11-21, second pass) | **CORRECTED.** The first pass read the root-level `serviceDetails.preDeployCommand`, which the API returns empty; the effective value is under `envSpecificDetails`. The command IS configured. Differs from the file only by the heap flag. |
| Env vars | 67 declared | 98 live; 33 declared keys absent live | `check-render-config.mjs` (Live) | existing pattern: file is not synced to the service; secrets live in the dashboard |

## Neon (Reported figures; arithmetic is mine)

- 130.75 CU-h in 20 days. Autosuspend is **disabled** and minimum compute is 0.25 CU, so the floor is 0.25 × 24 × 20 = **120 CU-h**. **≈92 % of the period's compute is the always-on floor**; only ≈10.75 CU-h is above it.
- Estimate at the published $0.106/CU-h: floor ≈ $12.7 of ≈ $13.9 for the 20 days; ≈ **$19/month floor**, ≈ $21/month at the observed rate. *Estimate, not an invoice.*
- **Enabling autosuspend would save at most the idle fraction of ≈ $19/month, and only if the database is truly idle.** It is not and cannot be today: the outbox worker (5 s), the data-job worker (5 s), attendance reconciliation (30 s) and the rest all query continuously. Turning it on alone would change nothing; slowing the workers to make it work would trade ≤ ~$19/month against cold-start latency for a 24/7 multi-timezone HR product and delayed billing/provisioning. **Recommendation: do not pursue.** Re-open only with a measured idle window.
- Network 1.52 GB / 20 days is small. The 565 MB spike on 20 Nov (37 % of the month) is **unattributed**: I have no access to Neon's per-query/transfer breakdown, and nothing in the repo links it to a job. Candidates to test (not conclusions): an export/report, `ErrorLogOccurrence` / `AuditLog` list pages (largest tables), a migration/seed run during a deploy, or QA/e2e traffic aimed at production. **Action:** correlate the three dates with Render deploy timestamps and `DataJob` / export rows (read-only SQL, owner-run).
- `pg_stat_statements` not installed: slow-query ranking unavailable. Installing it is a production change; **not done**. Requesting it is decision D3.
- Sequential-scan counts: cumulative since stats reset, not per request. Two are explained by code I read (below). Do **not** drop low-use indexes.

## Background workers (Code — from source on this branch)

| Worker | Interval | Gate | Notes |
|---|---|---|---|
| Outbox (`outbox-worker.service.ts:74`) | 5 s, env `OUTBOX_WORKER_POLL_INTERVAL_MS`, floor 1 s | `OUTBOX_WORKER_ENABLED` | Per tick: one `updateMany` reclaim + one `UPDATE … FOR UPDATE SKIP LOCKED` claim (`outbox-dispatcher.service.ts:198`), both served by `@@index([status, availableAt])`. Multi-instance and overlapping-deploy safe. |
| Data jobs (`data-job-worker.service.ts:13,36`) | **5 s, hard-coded** | **none** — starts in every process that loads the module | `findFirst WHERE status=QUEUED AND cancelledAt IS NULL ORDER BY createdAt`; every `DataJob` index leads with `tenantId`, so this cannot use an index → a sequential scan every 5 s. **This is what the 1.2 M `DataJob` seq scans are.** Harmless while the table is small; becomes a cost as job history grows. |
| Attendance reconciliation | 30 s (`attendance-reconciliation-queue.service.ts:32`) | not checked | |
| Managed billing | 15 min | `MANAGED_BILLING_WORKER_ENABLED` | |
| Subscription order sweeper | 15 min | `SUBSCRIPTION_ORDER_SWEEPER_ENABLED` | |
| Subscription change sweeper | 15 min | `SUBSCRIPTION_CHANGE_SWEEPER_ENABLED` | |
| Report scheduler | 60 s | `REPORTS_SCHEDULER_ENABLED` | |
| Workforce snapshot | 60 min | `REPORTS_WORKFORCE_SNAPSHOT_ENABLED` | |
| Error-log retention | interval at `error-logs.service.ts:67` | not checked | only retention job I saw |
| Timesheet jobs | interval at `timesheet-jobs.service.ts:47` | not checked | |
| Platform communications | not read | not read | |

Answers to the brief's outbox questions:
- **Idle cost:** two small indexed statements every 5 s ≈ 34,560/day. Cheap per call; the relevant cost is that it keeps Neon awake, which is already the case regardless (autosuspend off).
- **Can the kick handle most work? No.** `outboxWorker.kick()` has exactly **one** call site (`order-activation.service.ts:167`). Events emitted from cancellation, seat change, plan change, subscription order and seat usage (`outbox.emit` at ≥12 sites) are delivered only by the poll. **Slowing the poll would delay those flows.** Any slowdown must first add kicks after the commit at those sites.
- **Missed events / crash recovery:** claims carry a lease and `reclaimExpiredClaims` returns stale `CLAIMED` rows to `RETRY_SCHEDULED` without double-counting the attempt (`outbox-dispatcher.service.ts:~146`). Per-consumer idempotency is documented in the dispatcher. Exactly-once *business effect* is claimed by design; I did not re-prove it.
- **Overlapping Render deploys:** safe for the outbox (SKIP LOCKED). The other workers lack leases — see matrix #27/#31.
- **Backlog alerting:** none found (matrix #104).

## Render resources (Live + Reported)

- Standard / 1 instance / 1 vCPU / 2 GB / Virginia (Live). Reported memory 585–749 MB, mean ≈ 640 MB.
- **Downgrade rejected on this evidence:** the 512 MB plan is *below the observed working set* (even the minimum sample, 585 MB, exceeds it). Reducing it needs a measured reduction in resident memory first; no leak is evidenced (range is flat), but none is excluded either — no heap profile exists.
- Cost: published Standard ≈ $25/month (Estimate; invoice not available to me).
- Cheapest real saving on this service is therefore **not** the plan; it is ensuring the file and dashboard agree so nobody applies the wrong one.

## Vercel, Cloudflare/R2, GitHub Actions

- **Vercel:** no `vercel.json`, no `ignoreCommand` in the repository. Reported 8/8/8 production deployments for Web/Admin/Landing in November is consistent with every `main` push building all three. On Hobby the effect is build-minute/queue pressure, not a per-build charge (Reported plan; billing not visible). A dependency-aware skip must treat `packages/**`, root `package.json`/`package-lock.json`, `turbo.json` and `packages/config` as inputs of **all three** apps. It is a Vercel project setting (production configuration) — **proposal only, decision D4.** Hobby is for non-commercial use; plan change needs your approval (not touched).
- **Cloudflare/R2:** `StorageService` uses R2 only in production (`render.yaml`); `scripts/storage-reconcile.mjs` exists. No billing or bucket metrics were available. No analysis possible without credentials.
- **GitHub Actions:** repository reported PUBLIC; standard-runner minutes are free for public repositories (GitHub policy, not re-verified), so current cost ≈ $0 and **would become metered if the repository were made private** — relevant to the visibility review. CI structure (15 jobs, exact-SHA evidence reuse, `CI required gate`) is intact; I changed none of it.

## Corrected 111-concept matrix

Status: **IV** implemented and verified (code + automated check) · **P** partial · **M** missing · **NA** not applicable at current scale · **U** unknown/not inspected.
Layers: **K** agent knowledge · **I** implementation · **E** automated enforcement · **R** runtime evidence ("L" = I observed it live; "rep" = reported only; "–" none).
`Δ` marks rows changed by this branch or corrected from my 2026-11-21 sampled audit (which used a different numbering and is superseded by this table).

| # | Concept | St | Evidence | K I E R |
|---|---|---|---|---|
| 1 | Idempotency keys | P | keys in 20 API files incl. billing; Stripe event de-dupe `billing/services/webhook.service.ts:174`; no generic request-level key | n Y n – |
| 2 | Rate limiting | P | per-process `Map`: `common/guards/public-rate-limit.guard.ts:10`, `common/interceptors/authenticated-rate-limit.interceptor.ts:47`; RATE-01/03 | n Y ? – |
| 3 | Reverse proxies | IV | `main.ts` trust-proxy hop count; `render.yaml TRUST_PROXY_HEADERS=2`; `check-proxy-forwards-client-ip.mjs` | Y Y Y – |
| 4 | Connection pooling Δ | P | bounded connect wait added (`pool-config.ts`); `max` still driver default; Neon pooler state unclear (brief: `pooler_enabled=false`) | n P Y(spec) – |
| 5 | N+1 queries Δ | P | ORCH-04 measured: **39** statements for one authenticated GET at base; **27** after this branch (middleware −12, restriction −1); 7 with the unshipped D7 option. One route only. Spec `test/auth-query-budget.e2e-spec.ts` enforces ≤ 27 in CI | n Y Y(CI) – |
| 6 | Caching | P | only per-process Maps (e.g. `tenant-entitlement.service.ts:42,86`); no Redis (by decision) | n P n – |
| 7 | Cache invalidation | P | entitlement invalidate is instance-local (`:102,:107`), 60 s TTL | n P ? – |
| 8 | Load balancing | NA | Render platform; one instance by decision | n NA NA L |
| 9 | API gateways | NA | modular monolith by design; `gateway/` is the on-prem device gateway | Y NA NA – |
| 10 | Timeouts | P | outbound: `safepay.gateway.ts:381`, `geographic-lookup.service.ts:232`, R2; **no default statement timeout, no inbound server timeout**; 239/241 transactions on default 5 s (RES-09) | n P n – |
| 11 | Retries | P | R2 maxAttempts, outbox attempts, notification retry; no shared helper | n P P – |
| 12 | Exponential backoff | P | outbox table `outbox-dispatcher.service.ts:22`; no jitter | n P n – |
| 13 | Circuit breakers | M | none found | n n n – |
| 14 | Race conditions | P | `FOR UPDATE` at `payment-settlement.service.ts:739`, `plan-publication.service.ts:119`, `contract-deletion.service.ts:318`; SKIP LOCKED claim | n Y P – |
| 15 | Deadlocks | U | single-row locks in sites seen; no ordering rule/test | n ? n – |
| 16 | Memory leaks | U | rep: 585–749 MB flat-ish over a week; no heap profile; `windows` Maps unevicted? unverified | n ? n rep |
| 17 | Webhooks | IV | raw body `main.ts`, signature verify, dedupe, `stripe-webhook-smoke.mjs`, `webhook-delivery-health.mjs` | Y Y Y – |
| 18 | CORS | IV | `buildCorsOptions` `config/env.validation.ts`; `CORS_ALLOWED_ORIGINS` | Y Y P – |
| 19 | Secrets management | P | `SecretEncryptionService` required in prod; `check-env-registered.mjs`; **re-graded IV→P: no secret scanner in CI** | Y Y P – |
| 20 | Database indexing | P | 2026-09-10: "no missing index behind a reachable query"; **exception found now: `DataJob` poll cannot use any index** (all lead with `tenantId`) | Y P P rep |
| 21 | Query optimization | P | `pg_stat_statements` absent (rep) → no ranking; ORCH-04/05, DBQ-02/06/07 open per 09-10 | n ? n – |
| 22 | Read replicas | NA | not justified; largest table 26 MB (rep) | Y NA NA – |
| 23 | Database migrations | IV | pre-deploy `release`; CI `database-migration`; `DIRECT_DATABASE_URL` for advisory lock; live pre-deploy command confirmed set (`envSpecificDetails`) | Y Y Y L |
| 24 | Schema versioning | P | migration history only; no cross-client contract version | Y P P – |
| 25 | Optimistic locking | U | not inspected | n ? n – |
| 26 | Pessimistic locking | P | see #14 | n Y P – |
| 27 | Distributed locks | M | none; outbox uses SKIP LOCKED; 10 other workers un-leased | n n n – |
| 28 | Sharding | NA | one DB, many tenants by design | Y NA NA – |
| 29 | Partitioning | NA→trigger | largest tables 13–26 MB (rep); revisit at measured maintenance cost (09-10 §13 P3) | Y NA NA – |
| 30 | Replication | NA | Neon-managed | n NA NA – |
| 31 | Leader election | P | outbox safe; data-job, reconciliation, sweepers, schedulers have no lease | n P n – |
| 32 | CAP theorem | NA | single-primary Postgres | n NA NA – |
| 33 | Eventual consistency | P | outbox/notifications; 60 s entitlement staleness | P Y n – |
| 34 | Distributed transactions | NA | single DB; transactional outbox instead | Y NA NA – |
| 35 | Saga pattern | P | billing order/plan/seat flows + sweepers; undocumented as sagas | n P P – |
| 36 | Message queues | P | DB-backed outbox + data jobs; no broker by decision | Y Y Y – |
| 37 | Pub/Sub | P | `PlatformEventsService` + outbox consumers; `emitted-events-have-consumers.invariant.spec.ts` | Y Y Y – |
| 38 | Event-driven architecture | IV | as 37 | Y Y Y – |
| 39 | Dead-letter queues | P | exhausted outbox rows marked (`outbox-dispatcher.service.ts:282`); no unified view/alert | n P n – |
| 40 | Backpressure | P | body limits `main.ts`, batch claim; no depth shedding | n P n – |
| 41 | Cron jobs | P | 11 in-process `setInterval` workers (table above); no external scheduler | n P n – |
| 42 | SQL injection | IV | Prisma; 0 `queryRawUnsafe/executeRawUnsafe` in non-spec src; raw SQL uses tagged templates | Y Y P – |
| 43 | XSS | P | `sanitize-html`; CSP has `'unsafe-inline'` (`packages/config/security-headers.js:106`); Report-Only at `:169`; AUTH-06 | Y P P – |
| 44 | CSRF | P | SameSite cookie handling in `apps/*/lib/auth-cookies.ts`; no explicit Origin check verified | n P ? – |
| 45 | SSRF | U | no outbound-URL guard found; outbound targets seen are fixed hosts; tenant-supplied URLs not audited | n ? n – |
| 46 | OAuth | NA | own JWT auth | n NA NA – |
| 47 | JWT rotation | IV | refresh rotation + 30 s grace `auth.service.ts:155,1106`; 15 m access (`auth.config.ts:16`); key rollover procedure not found | Y Y Y – |
| 48 | IAM | IV | dual permission system, wiring-invariants, rbac specs, permission-propagation e2e | Y Y Y – |
| 49 | TLS | P | HSTS `security-headers.js:73`; terminated by Render/Vercel/Cloudflare | Y P P – |
| 50 | Encryption at rest | P | integration secrets encrypted; DB/R2 at rest delegated; OBS-24 plaintext PII (09-10) — current state unverified | Y P n – |
| 51 | Encryption in transit | P | edge TLS; DB `sslmode` not re-checked | n P n – |
| 52 | WAF | P | Cloudflare in front (`render.yaml`); rules not in repo | n ? n – |
| 53 | DDoS protection | P | Cloudflare + per-process limits | n P n – |
| 54 | WebSockets | NA | none | n NA NA – |
| 55 | Server-Sent Events | NA | none | n NA NA – |
| 56 | Long polling | P | client polling (agent, dashboards, order status); BUG-3895 post-signout polling noted in history | n Y n – |
| 57 | gRPC | NA | none | n NA NA – |
| 58 | HTTP/2 & HTTP/3 | NA | edge-provided | n NA NA – |
| 59 | TCP vs UDP | NA | device protocols only in `gateway/`, `tools/` (not audited) | n U NA – |
| 60 | DNS | P | workspace routing docs + `tenant-domains`; Cloudflare state not in repo | Y Y P – |
| 61 | Docker | NA | no Dockerfile; Render native Node | n NA NA L |
| 62 | Kubernetes | NA | not warranted | Y NA NA – |
| 63 | Helm charts | NA | — | n NA NA – |
| 64 | Service discovery | NA | monolith + env URLs | n NA NA – |
| 65 | CI/CD | IV | `.github/workflows/ci.yml` 15 jobs, `CI required gate`, timeouts everywhere, exact-SHA evidence | Y Y Y rep |
| 66 | Build caching | P | Turborepo; Render cache profile **no-cache** (rep) with `npm ci` + 6 GB heap build (Live) → slow deploys; remote turbo cache unconfirmed | Y P ? L |
| 67 | Infrastructure as code Δ | P | `render.yaml` existed but diverged from live (plan, health path, build cmd; 33 declared keys absent) — plan corrected here; `check-render-config.mjs` reports but does not fail on drift | Y P P L |
| 68 | Terraform | NA | `render.yaml` + checker is the right-sized alternative | n NA NA – |
| 69 | Feature flags | P | build-time env flag `runtime-feature-flags.ts`; entitlements are the per-tenant mechanism (`entitlement.guard.ts`) | Y P n – |
| 70 | Blue-green | NA | not justified at one instance | n NA NA – |
| 71 | Canary releases | NA | not justified | n NA NA – |
| 72 | Rolling deployments | P | Render swap after pre-deploy; with no health path the swap isn't gated on readiness | Y P NA L |
| 73 | Rollbacks | P | `docs/deployment/rollback-runbook.md`; destructive DB = manual; not drilled | Y Y n – |
| 74 | Health checks Δ | P | `/api/health` env-only + entitlement-mode read (`main.ts`); **live Render has no health-check path** | Y P P L |
| 75 | Liveness & readiness probes Δ | P | **readiness added** (`/api/health/ready`, spec'd) but not wired to any monitor; deliberately not wired to Render | Y Y Y(spec) – |
| 76 | Dependency management | P | advisory/overrides/declared-deps scripts exist; CI wiring **not confirmed**; no Dependabot/CodeQL config in `.github/` | Y Y ? – |
| 77 | API versioning | M | no versioning; Electron agent and .NET gateway cannot be force-updated | Y n n – |
| 78 | Semantic versioning | P | agent releases via `publish-release.mjs`; API unversioned | Y Y P – |
| 79 | Garbage collection | NA | default V8; build uses 6 GB heap (Live) but runtime flat | n NA NA rep |
| 80 | Thread safety | NA | single-threaded; shared-state concerns tracked in #31 | n NA NA – |
| 81 | Autoscaling | M | fixed single instance by decision | n n n L |
| 82 | Horizontal scaling | P | kept possible (R2 not disk); blocked by instance-local limiters/caches and un-leased workers | Y P n – |
| 83 | Vertical scaling | P | Standard 2 GB, ~640 MB mean (rep) = headroom; Starter 512 MB rejected | n P n L/rep |
| 84 | CDN | P | Vercel edge + Cloudflare; no metrics | n P n – |
| 85 | Edge caching | U | cache-control strategy not audited | n ? n – |
| 86 | Cost optimization Δ | P | analysed above; main levers are *not* plan changes; no cost telemetry in repo | n P n rep |
| 87 | Cold starts | P | Neon autosuspend off ⇒ none; Vercel function cold starts unmeasured | n ? n rep |
| 88 | Serverless limits | U | Vercel/Neon limits not budgeted | n ? n – |
| 89 | Latency | U | no latency measurement | n ? n – |
| 90 | Throughput | U | no load-test harness | n ? n – |
| 91 | P99 latency | M | no percentiles anywhere | n n n – |
| 92 | Tail latency | M | as 91 | n n n – |
| 93 | Network partitions | P | a few outbound timeouts; no drills | n P n – |
| 94 | Clock skew | P | TOTP/JWT depend on clock; tolerance unverified | n ? n – |
| 95 | Multi-region | NA | single region (Virginia/us-east-1, co-located — rep+Live) | n NA NA L |
| 96 | Failover | M | provider-level only | n n n – |
| 97 | Backups | P | Neon Launch: 6 h history (rep); 09-10 INF-02 "no backup"; current restore capability **unverified** | Y P n rep |
| 98 | Disaster recovery | M | no tested RPO/RTO; 6 h window ≠ RPO≤1 h/RTO≤4 h evidence; recovery targets are planning figures only | n n n – |
| 99 | Chaos engineering | NA | premature before #97/#98 are proven | n NA NA – |
| 100 | Logging | P | request-id, access-log, traceId in error contract; unstructured Nest logger | Y Y P – |
| 101 | Monitoring | P | `platform-monitoring`/`platform-health` (`SELECT 1` `platform-health.service.ts:101`), `agent-health.mjs`; no external uptime monitor | Y P n – |
| 102 | Distributed tracing | M | none | n n n – |
| 103 | Metrics | M | none (CI metrics only) | n n P – |
| 104 | Alerts | M | none; outbox backlog unalerted | n n n – |
| 105 | Observability | P | admin error-log/incident views | Y P n – |
| 106 | SLIs | M | undefined | n n n – |
| 107 | SLOs | M | undefined | n n n – |
| 108 | Error budgets | M | undefined | n n n – |
| 109 | Production incidents | IV | `docs/deployment/incident-response.md`; bug/regression records | Y Y P – |
| 110 | On-call | M | none found | n n n – |
| 111 | Postmortems | IV | `docs/bugs`, regression register, engineering history | Y Y Y – |

Counts (counted from the table, 111 rows; updated in the second pass): Implemented&Verified 11 · Partial 52 · Missing 15 · Not applicable 25 (24 NA + #29 NA-until-trigger) · Unknown 8.

## DijiPeople invariants appendix

| Invariant | Status | Evidence |
|---|---|---|
| Tenant isolation | P — convention only (no RLS, no global middleware); guarded by `attendance-integrations-isolation.e2e-spec.ts`, wiring invariants. This change touches no tenant query. | AGENTS.md; 09-10 TEN raw |
| Subscription entitlements | IV — `EntitlementGuard`, `@RequireEntitlement`, `tenant-entitlement.service.ts`; production default REPORT_ONLY per `main.ts` comment (DP-QA-005). **Unchanged.** | code |
| Authorization (RBAC + row scope) | IV | `rbac-matrix` specs, permission-propagation e2e |
| Auditability | IV | `AuditService`; this change adds no state-changing operation |
| Data protection | P — OBS-24 plaintext PII (09-10) status unverified | |
| Customer boundaries on health routes | `/api/health/ready` is unauthenticated and returns only `ok/fail`, latency and a fixed string — no tenant data, no connection details (spec asserts the secret is absent) | `readiness.spec.ts` |

## Prioritised backlog (not yet implemented unless marked)

| Pri | Item | Risk | Effort | Depends | Acceptance |
|---|---|---|---|---|---|
| ~~P0~~ withdrawn | ~~Confirm Render pre-deploy command is actually set~~ — **finding was wrong**: the command is set (see drift table). Residual, P2: last deploy history shows one `update_failed` (bc26e196, 2026-11-12) followed by successful retries; root cause not examined. | — | — | — | — |
| P0 | Restore drill + record real RPO/RTO (#97/#98) | HR/payroll data loss | S–M | Neon access | one timed restore into a throwaway branch with row-count check; numbers written down |
| P1 ✔ | Bounded pool wait (#4) — **done, awaiting CI** | | | | spec green |
| P1 ✔ | Readiness endpoint (#75) — **done, awaiting CI** | | | | spec green; manual 503 check against a dead DB |
| P1 | Auth-context cache (ORCH-04/#5) | stale permissions after role change | M | decision D2 | 26→≤N round trips measured on an isolated stack; permission change visible within the agreed staleness; tenant-isolation e2e green |
| P1 | Kick after commit at the other `outbox.emit` sites, **then** allow slower fallback polling | delayed billing/provisioning if done in the other order | M | — | each flow's latency unchanged with poll set to 30 s |
| P1 | Wire the readiness URL to an external uptime monitor + alert on outbox backlog | blind outages | S | monitor choice | induced DB failure pages someone |
| P1 | Dependency/secret scanning wired in CI (confirm `check-production-advisories.mjs` is invoked) | supply chain | S | — | CI step visible; mutation test |
| P2 | Index for the data-job poll (e.g. `(status, createdAt)`) or `QUEUED`-only partial index; give the worker an enable flag like its siblings | cost grows with job history | S (schema → lease + migration) | schema lease, DB-writer | `EXPLAIN` shows index scan; row count at which seq scan began to matter recorded |
| P2 | Worker leases (advisory lock per job) | duplicate runs on scale-out/overlap | M | — | two processes, one run per job (e2e) |
| P2 | Vercel dependency-aware ignore step | wasted builds; risk of wrongly skipping | M | D4 | input set includes shared packages; mutation test skips only unrelated paths |
| P2 | Per-statement timeout rollout (`DATABASE_STATEMENT_TIMEOUT_MS`) | kills long jobs if wrong | S + measurement | longest-statement data | chosen value > p99.9 of legitimate statements |
| P3 | Multi-instance shared store, replicas, partitioning, canary, multi-region | — | — | measured trigger (09-10 §13) | do not build now |

## Decisions needed (none blocks the work above)

- **D1 — Render health-check path.** Live is empty; the file says `/api`. Recommend setting `/api/health` (liveness) in the dashboard so deploys are gated on the process answering. Production configuration change → yours to apply.
- **D2 — Permission-cache staleness.** Caching the auth access context removes most of the ~26 round trips per request but makes a role/permission change take effect after a TTL (or on instance-local invalidation). What staleness is acceptable for revocation — immediate, ≤ 15 s, ≤ 60 s? (Entitlements already accept 60 s.)
- **D3 — `pg_stat_statements`.** Authorise installing it on Neon, or keep sampling via `pg_stat_user_tables` only?
- **D4 — Vercel build-ignore** (dashboard setting) and Hobby-for-commercial suitability.

## Not done, and why

- **No live Neon, Vercel, Cloudflare, or GitHub billing queries** — no Claude-side credentials discovered; I did not guess any. Their figures are *Reported*.
- **No load or performance measurement** (no baseline/after numbers exist for any change). The two implemented changes are bounds/safety changes, not speed claims; **no before/after performance or cost improvement is claimed.**
- **No full local test suite / CI result yet**; no PR/merge; nothing deployed.
- **AI-agent token audit (brief §9):** not performed in this session. The existing context (`AGENTS.md` is ~450 lines plus `@`-imported by `CLAUDE.md`, 13 role files, 32 context files) is a plausible token cost, but I have no measurement and recommend none yet.
- **Frontend (LCP/INP/bundle) audit:** not performed.
- **Cost-governance metrics (per tenant, per CI run, …):** not built; no billing data to feed them.

---

# Second pass (SESSION-0135, continuation)

Everything above is the first pass, kept for history; where this section disagrees, **this section wins**. Corrections made: the pre-deploy P0 is withdrawn (see the drift table); matrix rows #5, #19 and #20 are re-graded below.

## Evidence discipline for this pass

All measurements: real PostgreSQL 18 (local throwaway database `dijipeople_perf_test`, all 211 migrations applied, `seed:config` + `seed:demo` + `seed:admin`), the real Nest app booted in-process, requests over HTTP via supertest, statements counted at `pg.Client.prototype.query` (every statement the driver runs). Toolchain: **Node 24.14 / npm 11.9**. The repo pins Node 22, so this is *not* CI-equivalent evidence; CI is the verdict. Latency is local, warm, one connection, n = 60 per run: it measures CPU and statement overhead and **excludes network round-trip time**, so it says nothing about Neon latency. Nothing was run against production.

## Phase 2 — per-request authentication cost (ORCH-04), measured

Route: `GET /documents/types` as a tenant admin (2 of the statements are the handler's own; the rest is the cost every authenticated request pays).

| Configuration | Statements | p50 ms (run1 / run2) | p95 ms | Shipped? |
|---|---|---|---|---|
| **A. Baseline** — branch base `b7ddb808` | **39** | 19.7 / 20.1 | 54.2 / 61.1 | — |
| **B. Safe changes only** (below) | **27** | 14.2 / 14.4 | 57.0 / 62.2 | **yes** |
| C. B + Prisma `relationJoins` preview + join in `loadAccessContext` | 7 | 15.6 / 16.5 | 19.7 / 24.4 | **no — decision D7** |
| D. Baseline + preview flag only | 10 | 21.4 / 23.2 | 27.0 / 28.5 | no |

The p95 of A and B is noisy (one machine, background load); only the p50 and the statement counts are firm. **I do not claim a production latency improvement.**

**Where the 39 went** (baseline trace): 12 statements from `BusinessUnitAccessMiddleware` (a full user → roles → privileges → teams graph load that runs *before* the guard, on every request); 1 session lookup; 1 tenant-policy lookup; 22 from `loadAccessContext`'s nested includes (one round trip per relation level); 1 employee lookup plus 0–1 restriction lookup; 2 handler.

**Shipped (B), all uncached:**
1. `BusinessUnitAccessMiddleware` no longer resolves a context nobody reads. Its only consumer is the Prisma `$use` hook, and **`typeof $use === 'undefined'` on the installed client** (checked at runtime, Prisma 7.8.0), so the hook is never registered and the context is dead. The skip keys off `PrismaService.consumesRequestContext`, derived from the same `typeof` test that decides whether the hook registers; if `$use` ever returns, the work resumes. −12 statements.
2. The timesheet-restriction check is one query instead of two (restriction found through its employee relation, same predicates). −1 statement on the common path.

**Revocation (D2: zero tolerated staleness) — proven, not assumed.** `auth-query-budget.e2e-spec.ts` asserts against real PostgreSQL that on the *very next request*: a removed role is refused, a disabled account is refused (401), a newly added restriction applies, a lifted or expired restriction stops applying, and a restriction belonging to a *different employee in the same tenant* does not apply. No cross-request cache was introduced.

**Decision D7 (owner): enable Prisma `relationJoins`?** It takes the request from 27 to **7** statements and cut local p95 by roughly 60%, and the full API e2e suite (60 suites / 631 tests) passed with it on. But it is **not opt-in**: once the preview feature is on, *every* Prisma query in the app defaults to the join strategy. I first assumed otherwise and wrote a wrong comment; configuration D disproved it, and I backed the flag out. It would change the SQL of every query in production, uses a preview feature on a payroll system, and can be slower for wide `include` trees. Recommendation: **do not enable globally now**; if wanted, trial it behind the e2e suite plus a staging soak.

**Budget gate:** the same spec asserts ≤ 27 statements and runs in the existing CI `test:e2e` job (it lives in `services/api/test/`), so a change that adds round trips to every request now fails CI. Lower the ceiling as cost is reduced; never raise it to go green.

**Defect found while testing: BUG-4518** — `JwtAuthGuard` rewrites a timesheet-restriction 403 into a 401 `INVALID_TOKEN` (its `catch` re-throws only `UnauthorizedException`). Distinct from BUG-3164. Recorded, **not fixed** (user-visible behaviour change; fix together with BUG-3164). The spec accepts 401 or 403 until then.

## Phase 3 — workers

Complete inventory (source on this branch):

| Worker | Interval | Gate | Per-tick DB work | Multi-instance safe? |
|---|---|---|---|---|
| Outbox | 5 s (env) | `OUTBOX_WORKER_ENABLED` | reclaim `updateMany` + claim `UPDATE…SKIP LOCKED` (index `[status,availableAt]`) | **yes** |
| Data jobs | 5 s, now env | none; now `DATA_JOB_WORKER_ENABLED` (default on) | `findFirst QUEUED` + conditional claim | claim yes; see below |
| Attendance reconciliation | 30 s | none | queue drain | not examined |
| Timesheet jobs | 15 min | none | scheduled cycle | not examined |
| Platform communications retry | 5 min | none | retry cycle | not examined |
| Error-log retention | 24 h | none | cleanup | idempotent by nature |
| Managed billing | 15 min | `MANAGED_BILLING_WORKER_ENABLED` | sweep | not examined |
| Subscription order sweeper | 15 min | `SUBSCRIPTION_ORDER_SWEEPER_ENABLED` | sweep | not examined |
| Subscription change sweeper | 15 min | `SUBSCRIPTION_CHANGE_SWEEPER_ENABLED` | sweep | not examined |
| Report scheduler | 60 s | `REPORTS_SCHEDULER_ENABLED` | schedule scan | not examined |
| Workforce snapshot | 60 min | `REPORTS_WORKFORCE_SNAPSHOT_ENABLED` | snapshot | not examined |

Idle statement volume across all of them is about 55,000/day (outbox 34,560 + data-job 17,280 + reconciliation 2,880 + the rest negligible). Small in absolute terms; it matters only because it keeps the database awake, which autosuspend-off already does.

**DataJob — all four brief findings checked:**
- *Hard-coded 5 s* — confirmed. Now `DATA_JOB_WORKER_POLL_INTERVAL_MS` (floor 1 s, default 5000).
- *No enable flag* — confirmed. Added `DATA_JOB_WORKER_ENABLED`, **default ON** (unlike its siblings): this worker has always started everywhere, so a default-off flag would silently stop imports/exports at deploy. Only an explicit `false` disables it; typos do not (unit-tested).
- *No usable index* — confirmed. The poll names no tenant and every `DataJob` index leads with `tenantId`. Added `@@index([status, createdAt])` (migration `20261121090000_datajob_poll_index`, applied to the throwaway DB, `migrate status` clean). Plan evidence on a 200,000-row synthetic table (`TEMP` table, 3 queued rows): **22.9 ms → 0.05 ms** warm (cold first run 47.8 ms). Trade-off: the new index is 7.4 MB at 200k rows and adds a write per job state change (low volume). Caveat: local PG 18 can skip-scan the old index; **Neon is PG 17 and cannot**, so the real "before" there is likely a sequential scan, which is worse than measured. Production `DataJob` is small (< 13 MB, reported), so today's practical benefit is small; this stops it growing with job history.
- *Duplicate execution during overlapping deploys* — **not a defect**: the claim is a conditional `updateMany` filtered on `status = QUEUED`, so there is one winner.
- **New, unfixed:** a job left `PROCESSING` when its process dies is **never recovered** (no stale-claim reclaim, unlike the outbox). The "queued-job recovery" guarantee therefore covers `QUEUED` only. Reclaiming could re-run a partly applied import, so it needs a design decision; recorded, not changed.

**Outbox — not changed, deliberately.** Producers: `outbox.emit` at subscription-order (2 sites), cancellation (4), seat-usage (1), seat-change (2), plan-change (2), order-activation (3). Only order-activation has a post-commit `kick()` (`order-activation.service.ts:167`); the other 9 emit sites rely on the poll. Post-commit kicks could be added at each (after the surrounding `$transaction` resolves) and only then could fallback polling safely slow. I did **not** do it because there is **no financial lever to justify the risk**: Neon compute is flat at the 0.25 CU floor with autosuspend off, so removing about 30k tiny indexed queries/day saves $0 today. Revisit if autosuspend is ever enabled.

## Phase 4 — frontend (static audit only)

Counted from source (no build, no browser): `'use client'` files / `.tsx` files — web 261/583 (44%), admin 109/230 (47%), landing 14/38 (36%). Polling loops: `web/.../notification-bell.tsx` **and** `notification-popup-provider.tsx` each poll the notifications API every 60 s per signed-in tab (2 requests/min/session) regardless of tab visibility; `module-widget-renderer.tsx` 60 s; admin dashboard `router.refresh()` every 60 s; landing bank-transfer panel 20 s.

This is why the auth-cost work matters: at 100 concurrent sessions the two notification pollers alone are about 200 authenticated requests/min; at 39 statements each that was about 130 statements/s of pure overhead, at 27 it is about 90/s. *(Arithmetic on the measured counts; real traffic was not observed.)*

**Not implemented:** pausing pollers while `document.hidden`, merging the two notification pollers, and bundle/LCP/INP/CLS measurement. Reason: **no way to verify in a browser this session** (the Playwright MCP server failed to connect, and no `next build` was run for bundle sizes). Changing polling behaviour on journeys I cannot see is how a regression ships. Next action: run the repo's local Playwright recipe, then make the hidden-tab and de-duplication changes behind a test.

## Phase 5 — cost

| Provider | Evidence class | Finding |
|---|---|---|
| Neon | Reported consumption + my arithmetic | Compute is about 92% always-on floor (0.25 CU × 24 h × 20 d = 120 of 130.75 CU-h). Autosuspend not enabled and not recommended (first pass). Settings untouched (D5). No new Neon access this pass. |
| Render | **Live read** | Standard / 1 instance. Latest 8 deploys: successes on `new_commit`, 2 `service_updated` (11-12), **one `update_failed` on 11-12 (bc26e196)** followed by successful redeploys; live = `53517ab4` = current `main`. Downgrade still rejected (observed 585–749 MB > 512 MB). `start:prod` caps heap at 1536 MB; the build uses 6144 MB on the build machine. |
| Vercel | Reported | 24 production deployments, 8 per app in November. **`scripts/vercel-ignore-build.mjs` prepared and tested (7 tests, mutation-checked)**: skips an app only if every changed file is provably irrelevant (API, docs, scripts, CI, markdown, other apps); builds on any shared package, root manifest/lockfile/`turbo.json`, unknown path, missing previous SHA or failed diff. Single-rule mutants are equivalent by design (the rules are redundant and fail-safe); removing both is caught. **Not wired to Vercel (D4).** Savings unverified: on Hobby the benefit is build queue/minutes, not dollars; billing not visible. |
| GitHub Actions | Reported + CI observation | Public repo, so standard-runner minutes are free (GitHub policy, not re-verified): CI tuning saves about $0 today and would become real cost only if the repo went private. CI structure untouched; exact-SHA reuse intact. CI on `b7ddb808`: **success**. |
| Cloudflare/R2, email, logging | none | No access, no data. No savings claimed. |

**Savings ledger.** (1) Actual billed charges: none verified. (2) Observed provider consumption: the Neon figures above, unchanged by this work. (3) Estimated monthly: Neon about $19–21 floor; Render Standard about $25 (published) — unchanged. (4) Theoretical: fewer statements per request lowers database load and raises headroom; with compute pinned at the floor it saves **$0 now**. (5) Verified reductions: **none**. What this work delivers is headroom and lower per-request cost, not a smaller bill.

## Phase 6 — AI-agent context (measured; bytes ÷ 4 ≈ tokens)

| Loaded | Size |
|---|---|
| Every session: `CLAUDE.md` + `AGENTS.md` (`@`-imported) | about 13,150 tokens (AGENTS.md about 12,970) |
| Every session: user memory index | about 4,600 tokens |
| Nested `AGENTS.md` (7 files, loaded in that scope) | 1.2k–3.5k each |
| `.agent/agents` (14 files) | about 67k total, 7–9.7k each (architect largest) |
| `.agent/context` (32 files) | about 129k total; `component-index.md` about 19k is generated |
| `.claude/skills` (11) | about 2k total |

Fixed per-session cost before any work is about **17.8k tokens**, roughly 73% of it `AGENTS.md`. `AGENTS.md` (52 KB) restates material that has authoritative homes in `.agent/context/` (the full command catalogue, the completion-contract field list); that is the lever. I did **not** rewrite it: it is the validated authority, `validate-framework.mjs` checks claims inside it, and a trim without a measured quality check could drop a rule. The roster is unchanged (13 roles; evidence does not justify a change). **Implemented:** `scripts/check-context-budget.mjs` (+3 tests), a ratchet that fails if the always-loaded files grow more than 3% over the recorded baseline (`docs/engineering/context-budget-baseline.json`), so growth becomes a decision. It is not wired into CI or `validate-framework` (needs `framework`/`ci` leases): follow-up. Subagent and tool-call waste cannot be measured from the repository; that needs session telemetry.

## Review of "Implemented & Verified" rows

"IV" in the first pass meant *code + an automated check exists*. Re-graded by what was actually **executed** this pass (unit: `src/common`, `src/modules/auth`, `data-management`, `organization` = 81 suites / 847 tests pass; e2e: all 60 suites / 631 tests passed; CI `b7ddb808` success):

- **Executed here:** #23 migrations (all 211 applied to a fresh database), #47 JWT/refresh (auth unit + identity e2e), #48 IAM (wiring-invariants + permission-propagation e2e), #110 validation, #37/#38 outbox invariants.
- **Re-graded #19 Secrets IV → P:** no secret scanner is wired in CI; the rest is convention plus `check-env-registered`.
- **Re-graded #20 Indexing IV → P:** the 09-10 audit's "no missing index" was wrong for the `DataJob` poll (fixed above).
- **IV on CI evidence only, not re-executed by me:** #3 reverse proxies (check scripts), #17 webhooks (smoke scripts need live network; not run), #18 CORS, #65 CI/CD, #109 incidents and #111 postmortems (documents, not automation).
- **#5 N+1** now carries a measured number (39 baseline, 27 shipped, 7 with D7) but only **one route** was measured; other list endpoints were not swept.

## Phase 8/9 — checks added and evidence

| Check | Where | Status |
|---|---|---|
| Per-request statement budget (≤ 27) + revocation assertions | `services/api/test/auth-query-budget.e2e-spec.ts` | passes; runs in CI `test:e2e` |
| Pool bounds, readiness, data-job settings | 3 unit specs | pass (19 tests) |
| Vercel build-skip rules | `scripts/vercel-ignore-build.test.mjs` | 7 pass; mutation-checked |
| Context-budget ratchet | `scripts/check-context-budget.test.mjs` | 3 pass |
| Worker-frequency / unbounded-query / bundle-budget / API-latency gates | — | **not built**: no baseline exists for bundle or latency yet, and thresholds without baselines are invented numbers |

## Not done (and the dependency that blocked it)

- Frontend implementation and bundle/Web-Vitals measurement: no browser verification path this session.
- Live Neon/Vercel/Cloudflare/GitHub billing data: no Claude-side credentials discovered.
- Sweep of other endpoints for N+1/unbounded `findMany`: not performed (one route measured).
- Post-commit outbox kicks and slower fallback polling: deliberately not done (no financial lever; risk to billing flows).
- Recovery of stranded `PROCESSING` data jobs: needs a design decision.
- Cost-per-tenant / per-CI-run metrics: no billing data to feed them.
- `AGENTS.md` trimming and CI wiring of the context ratchet.
- Owner decisions: D7 (`relationJoins`), BUG-4518 fix, Vercel dashboard wiring.

---

# Follow-up (SESSION-0136): security validation, recovery, census

Branch `agent/security-timesheet-datajob-followup`, from `develop` @ `1df480bf`. Everything above is history; where this section disagrees, **this section wins**.

## Corrections to earlier claims

- **AGENTS.md duplication (second pass, Phase 6) — wrong lever.** I said `AGENTS.md` "restates material that has authoritative homes in `.agent/context/`". Measured by 8-word-shingle overlap against every other instruction/architecture document: **only ≈ 7% (≈ 3.7 KB) of `AGENTS.md` is restated anywhere else** (largest: "Task Completion" 13%, "`DP:`" 23%, everything else ≤ 9%). Deduplicating would save under 1k tokens. The fixed per-session cost is real content, not repetition; shrinking it is a content decision, not a cleanup.
- **Middleware skip — now proven, not just argued.** See below.

## Priority 1 — independent security review of the middleware skip

| Check | Evidence | Result |
|---|---|---|
| Static equivalence | Independent Reviewer role (read-only): the only reader of `RequestContextService.getContext()` is the `$use` hook; `req.buAccess` is written only by the middleware and read by nothing; no bracket/`as any`/string-key access; the flag derives from the same `typeof $use` test that gates the hook | **APPROVE** |
| Differential, PostgreSQL | `test/employee-scope-isolation.e2e-spec.ts`: two tenants, BU1/BU2, three viewers (SELF / BUSINESS_UNIT / TENANT), list + by-id reads. Run against the **old** middleware (`b7ddb808`) and the **new** one | outcome matrix **byte-identical**; 5/5 pass on both |
| Isolation outcomes | SELF sees only their own record; BUSINESS_UNIT sees BU1 only; TENANT sees all of tenant A; nobody sees tenant B; out-of-scope by-id reads are 403/404 | pass |
| Guard predicate | Reviewer: the single-query restriction check is at least as strict as the two-query original | **APPROVE** |

Caveat the review raised, accepted: if `$use` ever returned, the old path would resume with two latent weaknesses (it decodes the token without checking the session row, and any exception yields an *unscoped* null context). Not live today; noted for whoever reintroduces it.

**Pre-existing gaps the reviewer found (verified by me before acting):**

| Finding | Status |
|---|---|
| BUG-3157 lookups usage counted employees across tenants (HIGH, open since 2026-09) | **FIXED** — usage endpoints take the caller's `tenantId`. Isolation e2e fails on the old code (received 5 where the tenant has 2) and passes now (REG-700). |
| BUG-3156 any tenant admin can create/rename/deactivate shared geography (HIGH, open since 2026-09) | **NOT changed — product decision, QUESTION-3931.** The framing "mass assignment" was refuted (fields are picked explicitly), but the authorization problem is real. The fix removes a capability the tenant settings screen uses. Recommendation recorded: platform-only writes. The delete guard stays platform-wide on purpose and reveals only that a row is in use. |
| BUG-3136 five public read routes have no `PublicRateLimitGuard` (MEDIUM, deferred) | **Not changed.** The record rates regression risk LOW; I disagree: the guard's default read budget is 120 per 10 min per IP+path, and these routes are hit on every page load, so behind a shared office NAT it could 429 real users — the BUG-2458 failure. Needs traffic data to size a budget; an invented number would be worse than the gap. |
| Tenant enumeration via `public/tenants/resolve` (404 vs 403 `TENANT_SUSPENDED` / `TENANT_NOT_ACTIVE`) | Reported by the reviewer; **not triaged or changed** here. |
| `entity-scope.resolver` returns `{}` for an entity that is neither tenant- nor BU-scoped | design hazard, unchanged; not exploitable today (only `employees` registered) |

Not checked by the reviewer (so unverified): a complete handler-by-handler sweep, row scope per handler for every role, `projects`, webhook signature checks, raw SQL, reporting.

## Priority 2 — BUG-4518 + BUG-3164 (fixed together)

Root causes: the guard's `catch` rewrote the restriction's 403 into a 401 `INVALID_TOKEN`; the exception filter honours only catalog codes and `TIMESHEET_ACCESS_RESTRICTED` was not one; the allow-list was matched without the `/api` prefix the API is served under (the e2e app omitted it too, which hid the bug).

Fix: deliberate `HttpException`s re-thrown; code added to the API and web catalogs; restriction data (mode, id, allow-list) carried in `details` (the only field the filter passes through); allow-list matched after stripping `/api`, on a path-segment boundary (so `/support` no longer admits `/support-cases`); the 403 now returns the real allow-list. Evidence:

- `test/timesheet-restriction.e2e-spec.ts` (10 tests, PostgreSQL, **with the production `/api` prefix and the real exception filter**): 403 with `errorCode TIMESHEET_ACCESS_RESTRICTED`, the reason as `message`, `details.allowedRoutes`; allow-listed routes return **200** (not merely "not 401/403"); the session is not revoked; LIMITED_ACCESS reads pass and writes are 403; WARNING_ONLY never blocks; lifting, expiring and overriding take effect on the next request; another employee's restriction, another tenant's restriction, and a row whose `tenantId` disagrees with its employee are all ignored.
- `timesheet-restriction-routes.spec.ts` (9): bypass attempts fail closed (case, `//api`, `/apix`, `/api/api`).
- `apps/web/lib/server-api.spec.ts`: with a valid session, a 403 makes **one** request, never calls `/auth/refresh`, leaves both cookies untouched.
- The permissive `[401, 403]` assertion in the budget spec is now exact.
- Review: Reviewer **APPROVE** — no exception thrown inside the guard's `try` can now leak a wrong status; every real controller route in the allow-list is matched.

Browser behaviour **not** observed in a real browser (no browser verification available); the client logic (refresh only on 401; `statusToCode` maps 401 to "session expired") is covered at unit level.

## Priority 3 — stranded DataJobs

Design (additive migration `20261121120000_datajob_lease_and_row_checkpoint`): `DataJob.claimedBy` / `leaseExpiresAt` (renewed on a timer while the worker runs); `DataRowStatus.IN_PROGRESS` set per 100-row chunk **before** any row is applied. Because rows are applied strictly in `rowNumber` order and each is fully awaited, after a crash every row below the lowest IN_PROGRESS row is finished and every row above it never started — so **only one row is unknown**. Recovery (single-winner conditional claim on the exact lapsed lease value) parks that row as FAILED with an explicit message (never replayed), returns the rest to VALID, and resumes with counters carried forward. Exports (idempotent) are re-queued. Retries capped at 3. Every recovery is audited.

| Independent condition | Resolution |
|---|---|
| Reviewer + QA: a job cancelled while stranded would be re-queued and never claimed | settled as CANCELLED with the unknown row parked; **also** a QUEUED job cancelled before it started (pre-existing: never claimed, stuck forever) is now settled |
| Reviewer + QA: a non-lease executor error after the checkpoint left rows IN_PROGRESS on a FAILED job | worker parks the unknown row and frees the rest |
| Reviewer + QA: a worker paused past its lease could still write job-level state and audit | `ensureHeld` before every job-level write; row writes are conditional on the row still being IN_PROGRESS (a parked row cannot be overwritten) |
| Reviewer: 60-min legacy threshold keyed on `startedAt` could re-run a live long import from an old-version instance | now keyed on `updatedAt` (the old executor writes the job every chunk) |

**Evidence:** `test/data-job-recovery.e2e-spec.ts`, 14 tests on real PostgreSQL, 3 consecutive passes (no flake). Mutation-checked: no parking → 4 fail; unconditional recovery claim → 1 fails; no final ownership check → 1 fails; unfenced row write → 1 fails; cancel branch removed → 2 fail; worker parking removed → 1 fails (my first attempt at that mutation silently matched nothing — Prettier had reflowed the call — so I redid it with a pattern that provably applied). Unit: 116 pass across data-management, guards, lookups.

**Residual risks (not eliminated):**
1. During a rolling deploy an **old-version** instance reading rows a new worker marked `IN_PROGRESS` goes through a Prisma client built before that enum value existed; I did not verify how it deserialises. Low exposure (only jobs being processed during the overlap). The migration runs pre-deploy, before the new code.
2. An old-version worker that claims a job the new code re-queued ignores IN_PROGRESS and the new counter logic. Same overlap window.
3. A single row can be parked unnecessarily (when the crash came after the checkpoint but before the first row of the chunk). That is the deliberate conservative choice.
4. An export interrupted after saving its file but before recording it leaves an unreferenced object; `scripts/storage-reconcile.mjs` exists for that, not exercised here.

## Priority 4 — frontend

Browser testing was **not possible** (no browser verification path in this session; GitHub being unreachable also meant no CI browser-e2e result). What was done, and how it is verified:

- `apps/web/lib/visibility-polling.ts` + 7 unit tests: polling pauses while the document is hidden and catches up **immediately** when it becomes visible; stops permanently when the session ends. Wired into the notification bell and popup (previously 2 requests/min/tab, hidden or not). By construction a background tab drops from 120 authenticated requests/hour to 0; a visible tab is unchanged. **Not observed in a real browser.**
- Web unit suite: 91 suites / 1369 tests pass; ESLint at zero warnings on the touched files.
- Not changed: admin dashboard `router.refresh()` every 60 s and the web widget renderer's 60 s poll (the admin app has no shared `lib`; duplicating the helper is the repo's convention but I did not do it), bundle sizes, LCP/INP/CLS, rerenders, virtualisation. None measured.

## Priority 5 — infrastructure and agent framework

- **Vercel build-skip, validated against real history:** replayed over the last 40 merge commits to `main`. It would have **skipped 19 / 15 / 25 builds (web / admin / landing) of 40**, with **0 unsafe skips** (no skipped commit touched `apps/<app>/`, `packages/`, or the root manifest/lockfile/`turbo.json`). That is a **measured build-count reduction on history, not a realised saving**: nothing is wired and the dashboard is untouched (D4). Dollar effect on Hobby: not visible.
- **Context-budget check wired into `validate-framework.mjs`** (already a required CI job): fails if `CLAUDE.md` + `AGENTS.md` grow > 3% over the recorded baseline. Mutation-checked: +4.2 KB on `AGENTS.md` fails the check (56,801 vs limit 54,179 bytes) and the file was restored byte-identical. Shrinking never fails.
- Neon / Render: no new data was gathered this pass; the first-pass conclusions stand (compute is an always-on floor, autosuspend not recommended, Standard retained). No production setting was changed.

## Priority 6 — statement census at two volumes

`test/api-query-census.e2e-spec.ts`: 19 list routes as a tenant admin, real PostgreSQL, entities seeded at 5 and then 65 rows.

| Route | Statements 5→65 rows | Rows returned | Payload |
|---|---|---|---|
| employees (`pageSize=100`) | 47 → 47 | 5 → 65 | 10.9 → 139.6 KB (**≈ 2.1 KB/row**) |
| teams | 34 → 34 | 5 → 65 (**unpaginated**) | 3.9 → 50.5 KB |
| departments | 39 → 39 | 5 → 65 (**unpaginated**) | 2.6 → 34.0 KB |
| designations | 28 → 28 | 5 → 65 (**unpaginated**) | 1.7 → 22.5 KB |
| projects | 35 → 35 | 5 → 50 (capped at 50) | 6.7 → 65.9 KB |
| customers | 26 → 26 | 5 → 65 (**unpaginated**) | 2.6 → 34.1 KB |

- **No N+1 growth** on any of the six routes that had data. A budget (no growth + the measured ceiling) is asserted for exactly those six; a mutant ceiling is caught.
- The other 13 routes returned zero rows (nothing seeded for them), so "flat" is **vacuous** there and I did not budget them. **Not measured at all:** attendance, payroll, payslips, leave requests, timesheets, documents with data, billing, reporting. This is a census of six entities, not the system.
- Findings, not fixed: four lists are unpaginated; the employee list is heavy per row; the user list costs 53 statements for one row (≈ 28 above the auth floor) — worth a look.

## Independent sign-off status

| Role | Scope | Verdict |
|---|---|---|
| Reviewer + Security (independent) | middleware skip, guard, lookups, web polling, scripts, recovery | APPROVE / APPROVE WITH CONDITIONS — **all conditions fixed** (above) |
| QA (independent) | unit/web/script runs + adversarial coverage review | SIGN-OFF WITH CONDITIONS — conditions fixed; QA re-run of the fixed code **not done** |
| QA (independent) database-backed re-run | — | **not done**: my first QA dispatch asked the agent to read database credentials from your primary checkout's `.env` and was denied by the permission classifier; I did not work around it. The PostgreSQL results above are my own runs. |

## Test evidence (local, Node 24 — not CI-equivalent)

**Final code, full API e2e: 65 suites / 664 tests pass.** API ESLint: 0 errors, 785 warnings against the CI ceiling of 787. Unit: 116 pass in the touched API modules; web 91 suites / 1369 tests; framework validation pass. `data-job-recovery` 14/14 on three consecutive runs. **CI on this SHA is not recorded** — see blockers.

## Blockers and remaining risk

- **GitHub unreachable from this machine** (TCP 443 to github.com failed on two pushes). The commit exists locally; **nothing from this follow-up is pushed, so there is no CI result for it and no integration into `develop`.** Next action: push the branch, wait for `CI required gate` on the exact SHA, then fast-forward `develop`.
- Decisions: QUESTION-3931 (shared geography writes); D7 (Prisma `relationJoins`) still the owner's; Vercel dashboard wiring.
- Open, unchanged: BUG-3136, tenant enumeration on `public/tenants/resolve`, unpaginated lists, no browser-measured frontend numbers, no billing data.
- **Production promotion verdict: NOT READY.** Ready for review: the code and tests above. Not verified: CI on the final SHA, browser behaviour, the old-version/new-version deploy overlap for the DataJob migration. Financial improvements verified: none.
