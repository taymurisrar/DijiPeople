# DijiPeople — Full Technical Health Audit

**Date:** 2026-09-10 · **Branch/base:** `agent/full-technical-audit` from `origin/develop` @ `f55cf4b` · **Production commit at audit time:** `890cd96` · **Session:** SESSION-0096

This is the consolidated report. It is backed by eighteen specialist evidence
files under [`raw/`](raw/), each carrying the full finding text, file-and-line
citations, and per-finding remediation. The orchestrator (lead auditor)
re-verified every CRITICAL and the sharpest HIGH findings personally, including
live checks against the Render and Neon control planes; those verifications and
adjudications are in [`raw/ORCH.md`](raw/ORCH.md) and are folded in below.

Method: seventeen specialists swept the repository in parallel — architecture,
tenant isolation, authentication, authorization, API security, rate limiting,
schema, query performance, backend resilience, frontend, caching, secrets and
dependencies, file storage, observability and privacy, infrastructure and DR,
CI/CD and tests, and dead code — over 68 API modules, 111 controllers, 325 Prisma
models, 226 migrations and ~350 frontend pages. Findings were graded by
confidence (CONFIRMED / LIKELY / NOT OBSERVED) and cross-checked against the 323
existing bug records so that known issues are marked as such.

---

## 1. The bottom line

DijiPeople is a **well-engineered application on top of a fragile operational
base.** The code that decides who may see what is disciplined and consistent: a
systematic 2,394-query sweep of tenant scoping found the isolation convention
holding almost everywhere, the API surface has no SQL injection or SSRF and a
correctly-signed Stripe webhook, and secrets *handling in code* fails closed. The
danger is not in the request path. It is in five places where a single event —
one bad delete, one deploy, one leaked file, one self-granted role, one public
commit — has consequences the platform cannot currently absorb.

**Is DijiPeople safe to operate today?** Qualified yes for a small, trusted set
of pilot tenants, provided the five P0 items below are worked immediately. It is
**not** yet safe as a scaled, publicly-marketed payroll platform, for two
reasons that have nothing to do with clever attackers: there is **no real
database backup** and there is **no monitoring**. A routine operational mistake
is currently unrecoverable and an outage is invisible until a customer calls.

**Is it safe to expose publicly on the internet?** It already is exposed, and one
consequence is finding P0-1: a production database credential was committed to a
**public** GitHub repository. That must be rotated before anything else.

**The single most likely thing to break first as usage grows** is the database
connection pool, driven by the ~26 round-trip-per-request authentication cost
(§6, ORCH-04) against a single API instance with a default, unbounded-wait pool
(RES-01). Not a dramatic failure — a slow, creeping one that arrives well before
1,000 concurrent users.

### Platform health score

Scored 0–100, not graded on a curve. The split between the two columns is the
headline: build quality is high, operational maturity is low.

| Area | Score | Area | Score |
|---|---|---|---|
| Tenant Isolation | 82 | Observability | 18 |
| Authentication | 68 | Backup & Recovery | 12 |
| Authorization | 62 | Resilience | 34 |
| API Security | 78 | Infrastructure | 45 |
| Architecture | 72 | Scalability | 40 |
| Database (schema) | _see §11_ | Data Protection | 38 |
| Database (access) | 48 | Testing | 44 |
| Backend | 52 | CI/CD | 47 |
| Frontend | 66 | Secrets/Config | 40 |
| Performance | 42 | Maintainability | 63 |
| | | Technical Debt | _see §12_ |

**Overall platform health: 51 / 100.** A capable product that is roughly one
focused month of operational-hardening work away from being genuinely
production-ready at scale. The score is dragged down almost entirely by the
right-hand column; the application itself would score in the high 60s–70s.

---

## 2. The ten highest-priority actions

In order. The first five are P0 (do now); the rest are P1 (before scaling).

1. **Rotate the leaked production database password and the committed admin
   credential, and enable GitHub secret scanning + push protection.** (SUP-01,
   CI-06) A production Neon URL was public in git history for ~7 weeks and an
   admin password is still in the tree, in a public repo. One hour of work.
2. **Fix the self-service privilege escalation.** (AUTHZ-01) `POST
   /users/:id/roles` lets a delegated role-assignment admin grant themselves
   `GLOBAL_ADMIN`, bypassing every check. Extract the sibling endpoint's
   escalation guards into one shared method both call. Low effort.
3. **Raise Neon history retention to the plan maximum and protect the production
   branch; stand up an actual off-Neon backup with a tested restore.** (INF-02,
   INF-09) Today recovery is a 6-hour window nobody has ever restored from, on an
   unprotected branch one API call from deletion. The retention and protection
   changes are two settings.
4. **Give file storage a durable home.** (FILE-01/INF-05) The live service has no
   disk attached and one instance, so every uploaded HR document is destroyed on
   the next deploy. Attach the declared disk now; move to object storage (S3/R2)
   as the real fix.
5. **Encrypt bank accounts, IBANs, national ids and tax ids at rest.** (OBS-24)
   They sit in plaintext beside an unused AES-256-GCM service the same codebase
   already uses for SMTP passwords. Needs an expand/backfill/contract migration —
   start the plan now.
6. **Stand up monitoring and alerting.** (OBS-01, OBS-02, RES-04) There is no
   error tracking, no on-call path, and the health check is a static `ok` that
   cannot see a dead database. An outage today is discovered by a customer.
7. **Cut the per-request database cost.** (ORCH-04/05) Cache the auth access
   context and push the business-unit filter into SQL, then set explicit pool
   bounds and timeouts (RES-01). This is the scaling long-pole.
8. **Add real rate limiting to the surfaces that lack it and fix the bypass.**
   (RATE-01/03, INF-06) The limiter can be bypassed with a forged
   `X-Forwarded-For`, covers only public writes, and protects no authenticated
   endpoint; login has no per-IP lockout.
9. **Close the authorization asymmetries and the export BOLA.** (AUTHZ-02,
   AUTHZ-03) Two more route pairs enforce their checks on only one side, and the
   employee export skips the row-scope its sibling read applies.
10. **Make deploys provably safe.** (CI-01/02/03) Production deploys before the
    commit has a CI verdict, and two required gates report success while running
    nothing. Gate the deploy on the exact-SHA verdict and make the gates fail
    closed.

---

## 3. Answers to the required questions

- **Is DijiPeople safe to operate?** For a controlled pilot, yes, once the P0s
  are addressed. Not yet for scaled production — backup and monitoring are the
  blockers, not attackers.
- **Safe to expose publicly?** It is exposed; P0-1 (public-repo credential leak)
  must be remediated immediately, after which the public attack surface is
  reasonable.
- **Can one tenant access another tenant's data?** **No, for records.** A
  2,394-query sweep and independent tracing found no cross-tenant read path to
  employees, payroll, documents or files. The only cross-tenant exposures are in
  the `lookups` module: a tenant admin can *write* shared geography reference data
  (integrity) and read an aggregate employee *count* by geography (TEN-01/02,
  ARCH-02/03). No confidential records cross.
- **Could a normal user escalate privileges?** **Yes — one confirmed path.**
  AUTHZ-01, self-granting `GLOBAL_ADMIN`. In-tenant, not cross-tenant. P0.
- **Are authN and authZ correctly implemented?** The mechanisms are sound and
  consistently applied (the two-permission-system + row-scope design holds across
  948 decorated handlers). The defects are specific and fixable: three route
  pairs guarded on one side only, no MFA anywhere, replayable stateless reset
  tokens, and session-cookie scoping issues. See §5.
- **Are APIs sufficiently protected? Against abuse and brute force?** Against
  injection/SSRF/mass-assignment, yes. Against volume abuse, no — rate limiting
  is partial and bypassable, and login has no per-IP lockout. See §7.
- **Are database queries efficient?** The schema and its indexes are good; no
  missing index was found behind a reachable query. The inefficiency is
  application-layer: ~26 round trips per request, unbounded fan-outs, and
  unbatched per-row transactions on a 5-second budget. See §6.
- **Are database connections handled correctly?** No. The pool is entirely
  default and waits forever for a connection (RES-01); this is the first scaling
  cliff.
- **Where should caching be introduced?** Exactly one place with high confidence:
  the per-request auth access context (§6). Almost nowhere else yet — fix the
  queries first. See §8.
- **What must never be cached?** Payroll figures, leave balances, approval state,
  permission/entitlement grants, session state, and anything mid-workflow. See §8.
- **Orphaned/obsolete resources?** Yes, but modest and mostly benign — see §12
  (pending final dead-code report). A dead second Stripe webhook and a no-op
  notification "queue" are the notable live ones (ARCH-13/14).
- **Are we leaking sensitive information?** Yes, in three forms: the public-repo
  credential leak (P0-1), plaintext PII at rest (P0-5), and reset/invite tokens
  stored in a tenant-readable email log (AUTH-01). Not through API error verbosity
  or CORS, which are clean.
- **Can we detect an attack?** **No.** No monitoring, no alerting, no anomaly
  detection, authentication failures not surfaced. See §9.
- **Can we recover from data loss?** **Barely, and untested.** A 6-hour window,
  no off-site backup, no tested restore, and no per-tenant restore capability at
  all. See §10.
- **Can the platform support ~10× current usage?** Not without work. The auth
  round-trip cost, the default connection pool, and single-instance in-process
  background workers are the three limiters. None requires new infrastructure to
  fix first — fix the code, then scale. See §6, §13.
- **What breaks first?** The connection pool, driven by per-request auth cost
  against one instance (ORCH-04 + RES-01).

---

## 4. Architecture map

```
                          Cloudflare (TLS, DNS)
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        │                         │                           │
   www.dijipeople.com     app.dijipeople.com          admin.dijipeople.com
   (landing, Vercel)      (web/tenant, Vercel)         (admin, Vercel)
        │                         │                           │
        │   Next.js route handlers (~511) — thin proxies,     │
        │   cookie auth, X-DijiPeople-App header, refresh-on-401
        └─────────────┬───────────┴───────────────┬───────────┘
                      │                            │
                      ▼                            ▼
             api.dijipeople.com  ==  dijipeople.onrender.com  (SAME service,
             (NestJS 11, Render, 1× standard instance, Virginia)  directly reachable)
                      │  Prisma 7.8 + @prisma/adapter-pg (direct, non-pooled)
                      ▼
             Neon Postgres 17 (aws-us-east-1, 0.25–2 CU, 1 branch, 6h history)
                      ▲
   ┌──────────────────┼───────────────────────────────────────────────┐
   │  In-process on the single API instance (NO separate worker):      │
   │  outbox worker · reports scheduler · workforce snapshot ·         │
   │  timesheet cycle · notification processor (synchronous fallback)  │
   └───────────────────────────────────────────────────────────────────┘
                      │
   External: Stripe (billing + signed webhook) · SMTP (one sender, platform+tenant)
             · local disk (ephemeral) for file storage · .NET gateway (on-prem,
             attendance devices) · agent-desktop (Electron, own auth client)
```

Key structural facts, all verified:
- **No browser or client code touches the database or the API directly** — every
  path goes through the Next.js proxies, held thin by four CI invariants
  (ARCH-04/05). This is a genuine strength.
- **One environment.** No staging/UAT/DEV. Promotion is local → production, one
  Neon branch, one Stripe account (in test mode), one email sender (INF-07,
  ARCH-16). This amplifies every operational finding.
- **Single instance by design.** A Render disk (declared but not attached) would
  pin it to one instance anyway; several correctness mechanisms quietly depend on
  single-instance (ARCH-12, RES-10).
- **Module boundaries are nominal:** 152 of 310 models are queried from more than
  one module, with 10 circular module pairs and one 18-module cycle (ARCH-08/09).
  A modular monolith in name; a coupled one in practice. Not urgent, but it is the
  main maintainability drag.

---

## 5. Authentication & authorization

**Sound mechanisms, specific holes.** The JWT design resists client confusion
(per-client secret + `aud`/`appClientId` check, verified), `/auth/me` re-checks
session liveness despite being public (BUG-2547, verified), and the RBAC
two-system guard is applied consistently across 948 handlers.

Highest-value fixes:
- **AUTHZ-01 (CRITICAL/P0):** self-service `GLOBAL_ADMIN` via `POST
  /users/:id/roles`. Verified end to end.
- **AUTHZ-02/03 (HIGH):** legacy permission-assignment skips the "cannot exceed
  own access" check; employee export skips the row-scope its read sibling applies
  (BOLA on CNIC/salary CSVs).
- **AUTH-01 (HIGH):** live password-reset links and invite tokens are stored in
  the email delivery log, readable by any tenant user with `notification.logs.read`.
- **AUTH-02/03/05 (HIGH):** reset sets `status: ACTIVE` (a disabled user
  reinstates themselves), reset tokens are stateless and replayable for 24h, and
  a client-supplied `startNewSession` flag on the public agent refresh endpoint
  resets absolute session lifetime (a stolen agent refresh token never expires).
- **AUTH-06 (HIGH):** SVG branding executes on the API origin, which shares the
  `.dijipeople.com` cookie — stored XSS via a crafted logo link. Verified.
- **AUTH-10 (HIGH):** no MFA anywhere, including platform super admins, while the
  settings catalog advertises `mfaRequired`.
- **Cookie scoping (AUTH-07/13):** all cookies use `Domain=.dijipeople.com`, so
  the admin token is transmitted to every tenant hostname, and the web proxy
  rewrites cookies to `SameSite=None` with no CSRF token.

Adjudication: AUTH-04/RATE-11 ("unthrottled cross-tenant password oracle") is
overstated — the agent login is IP-throttled and its enumeration oracle is
already closed; the real residual is the missing per-account lockout (recalibrate
to MEDIUM). See ORCH.

---

## 6. Database access & performance — the scaling long-pole

The schema is healthy (§11) and no missing index was found behind a reachable
query. Every performance problem is the application removing a bound the database
would otherwise honour:

- **ORCH-04 (HIGH):** ~26 DB round trips per authenticated request — a 4-level
  auth access-context tree (21 relation loads, no `relationJoins`), plus session,
  idle-timeout and timesheet-restriction lookups — rebuilt from scratch every
  request, cached nowhere. This is the dominant latency and connection-hold cost
  and it scales with request volume. **Fix first.**
- **ORCH-05 (MEDIUM):** the tenant's whole business-unit table is read and
  filtered in JavaScript on every request; cost is linear in the largest
  customer's org size.
- **RES-01 (HIGH):** default Prisma pool that waits forever for a connection —
  the first scaling cliff.
- **RES-02/DBQ-04 (HIGH):** payroll runs inline per-employee on the HTTP thread;
  timesheet import runs an unbounded per-row loop inside one transaction on the
  default 5-second timeout (same class as the prior CRITICAL BUG-0900). 239 of 241
  transactions use that default timeout (RES-09).
- **DBQ-02/06/07 (HIGH):** notification fan-out is O(rules×recipients) sequential
  round trips inline on the triggering request; the audit-log filter query does an
  unbounded `DISTINCT` scan on every page load; `GET /payslips` has no pagination
  and can return every payslip in the tenant.

**Scaling verdict:** at ~100 concurrent users the pool + auth cost begin to bite;
by ~1,000 the timesheet-import transaction timeout and the inline payroll run
become outright failures on the largest tenants. None needs new infrastructure to
fix — cache the auth context, bound the pool, chunk the transactions, queue the
heavy jobs.

---

## 7. Rate limiting & abuse

One in-memory guard, `PublicRateLimitGuard`, covers public *writes* only.
- **RATE-01/INF-06 (HIGH):** the key trusts a client-supplied `X-Forwarded-For`
  on a directly-reachable API, so an attacker rotates the header for unlimited
  identities.
- **RATE-03 (HIGH):** no authenticated endpoint is rate limited at all.
- **RATE-05/06 (HIGH):** one unauthenticated login costs ~1.1s of CPU on a
  single instance; ten upload endpoints buffer the whole body in memory with no
  size limit (compounds SUP-02, multer DoS advisories).
- **No account lockout on admin/platform-admin/agent login; the OTP counter
  resets on resend (RATE-10/11/16).** No CAPTCHA, progressive delay, or alerting.
- The counter is process memory — it resets every deploy and is per-instance.

Recommendations are per-surface with concrete keys/limits/windows in
[`raw/RATE.md`](raw/RATE.md). Do **not** add Redis for this yet; a durable shared
counter is only justified once the API runs more than one instance (§13).

---

## 8. Caching

**What exists** is small and, with one exception, correctly tenant-scoped. The
exception is **CACHE-01**, which I re-graded from CRITICAL to **HIGH**: the public
tenant-resolve endpoint keys its cache on the caller's input selectors rather than
the resolved tenant, allowing cache poisoning / login-page spoofing — but the
cached payload is public branding, so **no confidential data crosses tenants.**
The frontend layer has **no** cross-tenant caching (FE-01/CACHE-10, verified
definitively).

**Where caching helps:** essentially one place with high confidence — the auth
access context (ORCH-04), with a 30–60s TTL invalidated on role/permission/team
/employment change. Everything else should be fixed at the query first.

**What must never be cached** (required deliverable): payroll figures, leave
balances, approval state, permission and entitlement grants, employee employment
status mid-change, session/token state, security policy, and any record inside an
open workflow. Stale authorization is a security bug, not a performance
trade-off.

**External-cache trigger:** introduce Redis (or equivalent) only when the API
runs more than one instance and needs a shared rate-limit/session/cache store, or
when a measured, repeated read workload dominates DB load after the query fixes.
Not before.

---

## 9. Observability — the second operational blocker

There is effectively none (OBS-01, KNOWN ITEM-0009). No Sentry/Datadog/OTel/
Prometheus anywhere; logs go to stdout only; the health check is static (RES-04,
verified) and Render's health-check path is empty. Critical platform-ops alerts
(failed payment, failed provisioning) are written to a log line that is then
suppressed at the production log level and never sent (OBS-02). **If the API
starts erroring at 03:00, nobody is told and Render will not restart it.**

Auditability is the bright spot in this area: salary, payroll and bank changes do
carry before/after snapshots with actor and IP. But coverage is ~1/3 of mutating
endpoints — employee **termination** writes no audit row (OBS-15) and document
reads/downloads are recorded nowhere (OBS-16), so a wrongful-dismissal or
data-access dispute cannot be reconstructed.

---

## 10. Backup, DR & data protection — the first operational blocker

Verified live against the Neon API:
- **History retention is exactly 6 hours** (`21600s`). That is the entire
  recovery window. **No off-Neon backup exists** — a repo-wide search found only
  references to a backup assumed to exist (INF-02).
- **The production branch is unprotected** and a project-scoped key can delete it
  (INF-09). Combined, a single API call can cause total, permanent, unrecoverable
  loss.
- **No tested restore, no per-tenant restore** (INF-14). Restoring one tenant
  means rolling back all of them.
- **RPO after 6 hours: total loss. RTO: unbounded and unrehearsed.**

Data protection: bank/national-id/tax fields are plaintext at rest (OBS-24, P0);
field-level masking is enforced only in the browser (OBS-25 — the API returns the
full value); there is no individual erasure/anonymisation path (OBS-27). TLS and
HSTS on the front ends are correct; the API sends no security headers (ORCH-01).

---

## 11. Database schema health

The schema is the strongest layer of the platform. 325 models, 261 tenant-owned,
Postgres 17, ~130 MB today. Verified positives: **zero models with missing tenant
ownership**, correct composite business-key scoping (uniqueness includes
`tenantId`), **no `Float` money fields** (money is `Decimal`), and indexes
well-matched to the reachable query shapes. The Prisma `$use` tenant middleware is
confirmed inert and correctly never relied upon.

The weakness is that safety rests entirely on cascade graphs and application
discipline, with no independent database-level barriers:

- **SCHEMA-03 (HIGH, CONFIRMED, verified):** `buildPayrollEmployeeEligibilityWhere`
  (`payroll-run.service.ts:3040-3088`) filters on `tenantId`, `employmentStatus`,
  `terminationDate` and `hireDate` but **never `isDeleted`**, while the archive
  path (`employees.service.ts:1408-1422`) sets `isDeleted: true` without touching
  `employmentStatus`. An employee soft-deleted while still `ACTIVE`/`PROBATION`/
  `NOTICE` (and not formally terminated) is included in the next payroll run and
  gets a payslip. A confirmed payroll-correctness bug. One-line fix: add
  `isDeleted: false`. **Fix now.**
- **SCHEMA-01 (HIGH, LIKELY):** 237 models cascade-delete from `Tenant`; a BFS
  reaches 246/325 models in two hops, including `AuditLog`, `Payslip`,
  `PayrollRecord`, `PayrollRun`. The one caller (`tenant-erasure.service.ts:555`)
  does careful ordered explicit deletes first, but nothing at the database level
  stops a future direct `tenant.delete` from destroying all financial and audit
  history. Add `onDelete: Restrict` from `Tenant` to the highest-value historical
  tables so any deletion must pass through an explicit archive step. LATER
  (ExecPlan-worthy).
- **SCHEMA-04 (MEDIUM):** 13 models use a nullable-`tenantId` "global default +
  tenant override" pattern (`EmailTemplate`, `Plan`, …). The schema is fine; the
  per-service authorization on the override write path needs confirming — routed
  to AuthZ.
- **Hot tables** (attendance, audit, notifications, outbox, sessions, error-logs)
  have no retention or partitioning; they are the P3 partitioning trigger in §13.

Full model-by-model tables, `onDelete` breakdown, typing and growth analysis are
in [`raw/SCHEMA.md`](raw/SCHEMA.md).

---

## 12. Dead code & technical debt

The codebase is **unusually clean of classic debt** — zero commented-out code
blocks, near-zero TODO/FIXME markers. Nothing here rises above MEDIUM. The real
debt is architectural accumulation, not sloppy leftovers:

- **Superseded-but-retained UI kits:** 24 admin components / 3,227 lines under
  `apps/admin/_components/{crm,ui}/` with zero importers — an abandoned pre-
  `ProDataTable` kit sitting beside its replacement (DEBT-01). Plus orphaned
  `apps/web/app/components/views/` (DEBT-02). LIKELY SAFE to remove after the
  registry re-checks the report performed.
- **Dead SLA module** end to end (`services/api/src/modules/sla`, 155 lines) —
  resolves an open verification item (DEBT-06). REQUIRES REVIEW before removal.
- **DEBT-10 (MEDIUM):** date/currency formatting reimplemented in 21+ files
  instead of the one documented entry point — the structural root cause behind
  three known bugs (BUG-1556, BUG-2010, BUG-2626). This is the highest-value debt
  to pay down because it keeps generating bugs.
- **DEBT-11:** 29 files use raw `<table>` instead of the shared kit (an
  accessibility as well as a consistency issue).
- **Dead flags/config:** 18 env vars in `turbo.json` `globalEnv` referenced
  nowhere (DEBT-03); a dead second Stripe webhook (ARCH-13); a notification
  "queue" whose enable flag changes nothing (ARCH-14); 13 providers re-declared in
  foreign modules (ARCH-10); 233 committed gateway build binaries / 136 MB
  (SUP-03).
- **The dual permission system** is at near-parity (947 vs 883 call sites) and
  actively maintained on both sides — **not** being phased out (DEBT-09). It is
  the single largest structural weight in the codebase; a decision to converge on
  one system (recorded as an ADR) would remove the most debt of any single move,
  but it is a deliberate program, not a cleanup.

Nothing was labelled SAFE TO REMOVE on a single grep — every candidate was
checked against the dynamic registries (module runtime, entity registry,
permission catalogs). The `depcheck`/`knip`/`ts-prune` tools were unavailable
offline, so the report's counts are manual reverse-import scans. Full ranked
register in [`raw/DEBT.md`](raw/DEBT.md).

Note DEBT-08 for AuthZ: two recruitment controllers use only the legacy
`@Permissions` decorator with no `@RequirePermission` — confirmed **not** a bypass
(the legacy check still gates), but it means matrix-only roles may be locked out
of recruitment. A consistency issue, not a hole.

---

## 13. Risk matrix & roadmap

### P0 — Immediate (data-loss, active exposure, privilege escalation)
SUP-01 (public credential leak) · AUTHZ-01 (privesc) · INF-02/09 (no backup,
unprotected branch) · FILE-01/INF-05 (ephemeral HR-doc storage) · OBS-24
(plaintext PII at rest).

### P1 — Before scaling
Monitoring/alerting (OBS-01/02) · auth round-trip cost + pool bounds
(ORCH-04/05, RES-01) · rate-limit bypass and coverage (RATE-01/03, INF-06) ·
authZ asymmetries + export BOLA (AUTHZ-02/03) · deploy gating (CI-01/02/03) ·
inline payroll / timesheet-import transaction timeout (RES-02, DBQ-04) · reset-
token replay and MFA (AUTH-02/03/10) · SVG-XSS + API security headers
(AUTH-06, ORCH-01) · render.yaml drift detector (INF-03).

### P2 — Optimization
Notification/email fan-out off the request thread (DBQ-02, RES-06) · frontend
duplicate/uncached auth fetches (FE-02/03) · admin full-table-scan list modules
(FE-05) · audit coverage gaps (OBS-15/16) · dependency delta (SUP-02/05) ·
CSP promotion with a collector (ORCH-02).

### P3 — Scale-triggered (define the trigger, don't pre-build)
- **Second API instance + shared store (Redis for rate-limit/session):** only
  when one instance is measurably saturated after the query fixes, or when the
  disk dependency is removed by moving files to object storage.
- **Staging environment:** before the first paying customer, or the first release
  scheduled around a customer's payroll date.
- **Read replica / reporting isolation:** only when report queries measurably
  contend with transactional load.
- **Table partitioning (attendance/audit/notifications):** when a hot table's row
  count makes its maintenance queries slow — see §11.

Roadmap: **Immediate** = the five P0s (about one to three days of real work each,
mostly configuration and one migration). **Near term** = P1 monitoring, auth cost,
rate limiting, deploy gating. **Medium term** = P2 async work and test coverage
for payroll/isolation (CI-04/05). **Scale-triggered** = P3 with the triggers
above.

---

## 14. Areas reviewed and found healthy

So the report is not biased toward only problems, these were checked specifically
and found correctly implemented:
- **Tenant isolation of records** — consistent across a 2,394-query sweep (TEN).
- **CORS** — strict allowlist, no origin reflection, verified live (ORCH).
- **Injection & SSRF** — none found; parameterised queries throughout (API).
- **Stripe webhook** — correct signature verification with raw body and replay
  protection (API).
- **Document/contract rendering** — escaped end to end (API, FE-17 aside).
- **Per-client JWT confusion resistance** and public-`/auth/me` revocation
  re-check (AUTH, verified).
- **Frontend has no cross-tenant caching and no browser DB/API-direct access**
  (FE, ARCH).
- **Secrets handling in code** (JWT, encryption-at-rest service, admin seed) fails
  closed and is well-built — undermined only by the committed leak (SUP).
- **Dependency hygiene** is actively managed (BUG-0052 is good work); only a small
  cheap delta remains (SUP).
- **Front-end security headers** (HSTS, nosniff, frame-deny, referrer policy) are
  correctly set and verified live (ORCH).
- **Schema indexes** match the reachable query shapes; no missing index found
  (DBQ).

---

*Full evidence, per-finding remediation, difficulty, regression risk and fix-now
disposition for all 281 findings are in [`raw/`](raw/). This document is the
single consolidated register; where a specialist and the orchestrator disagreed
on severity, the orchestrator's adjudication in `raw/ORCH.md` governs.*
