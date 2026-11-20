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
| Pre-deploy command | `npm --workspace api run release` | API field returned **empty** | Live | brief says it runs; I could not confirm from the API field. **Verify in dashboard** — if empty, migrations/seeds are not running pre-deploy (the BUG-0767 failure mode). |
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
| 5 | N+1 queries | P | ORCH-04: ~26 round trips per authenticated request, uncached, **still present** (no auth-context cache or `relationJoins` on this branch) | n ? n – |
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
| 19 | Secrets management | IV | `SecretEncryptionService` required in prod; `check-env-registered.mjs`; no secret scanner in CI found | Y Y P – |
| 20 | Database indexing | IV | 2026-09-10: "no missing index behind a reachable query"; **exception found now: `DataJob` poll cannot use any index** (all lead with `tenantId`) | Y P P rep |
| 21 | Query optimization | P | `pg_stat_statements` absent (rep) → no ranking; ORCH-04/05, DBQ-02/06/07 open per 09-10 | n ? n – |
| 22 | Read replicas | NA | not justified; largest table 26 MB (rep) | Y NA NA – |
| 23 | Database migrations | IV | pre-deploy `release`; CI `database-migration`; `DIRECT_DATABASE_URL` for advisory lock; **live preDeploy field read empty — unverified** | Y Y Y ? |
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

Counts (counted from the table, 111 rows): Implemented&Verified 13 · Partial 50 · Missing 15 · Not applicable 25 (24 NA + #29 NA-until-trigger) · Unknown 8.

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
| P0 | **Confirm Render pre-deploy command is actually set** (API returned empty) | migrations/seeds silently not running | S (owner, dashboard) | — | dashboard shows `npm --workspace api run release`; a deploy log shows `migrate deploy` before start |
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
