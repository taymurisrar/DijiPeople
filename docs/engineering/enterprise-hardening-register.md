# Enterprise hardening — implementation register

> Single register for the program that began with SESSION-0135 and continues in
> SESSION-0137. Updated in place; do not fork a second report. Evidence for the
> earlier performance and reliability work lives in
> [`docs/engineering/audits/2026-11-21-reliability-cost-audit/00-REPORT.md`](audits/2026-11-21-reliability-cost-audit/00-REPORT.md).
>
> **Last updated:** 2026-11-21, session SESSION-0137, branch `agent/dependency-alert-remediation`.
> Every figure below was measured on that date from the GitHub Dependabot API
> and the lockfiles at `origin/develop` (`0bc738c8`) unless stated otherwise.

## 1. Dependency alert inventory (WP1)

GitHub reported 111 open alerts against the default branch (`main`). They are
scored against `main`'s lockfile, so they stay open until a release carries the
fix to `main`; `develop` and `main` carried the same vulnerable versions
for every package below.

| Severity | Development scope | Runtime scope |
|---|---|---|
| critical | 2 | 0 |
| high | 35 | 4 |
| medium | 50 | 1 |
| low | 19 | 0 |

**The two criticals** are both `handlebars@4.7.9` (GHSA-p8wg-vrv2-v86f,
GHSA-8r5x-fm3f-whwj), a transitive dev tool. Fixed by 4.7.10.

**The four runtime highs** are all `xlsx@0.18.5`, with no fixed version on npm,
for GHSA-4r6h-8v6p-xvw6 (prototype pollution) and GHSA-5pgg-2g8v-p4x9 (ReDoS).
Both are triggered by *parsing* a crafted workbook.

### Disposition of each package with a critical or high alert

| Package | Alerts | Disposition | Evidence |
|---|---|---|---|
| `handlebars` | 2 critical | **Fixed** → 4.7.10 | lockfile diff, `npm audit` critical 2 → 0 |
| `undici` | 3 high | **Fixed** → 6.29.1 | lockfile diff |
| `js-yaml` (3.x) | 2 high | **Fixed** → 3.15.2 | lockfile diff |
| `browserslist` | 1 high | **Fixed** → 4.29.6 | lockfile diff |
| `electron` (39.x track) | 24 high/medium/low | **Fixed** → 39.8.10 | lockfile diff |
| `electron` (41/42-only: alerts 96, 98, 100, 102, 152) | 5 + lockfile twins | **Tracked**, not applicable by call site except 152 | [[ITEM-0234]] |
| `extract-zip` | 2 high, no fix on npm | **Tracked**; leaves the tree with Electron 42 | [[ITEM-0234]] |
| `xlsx` | 4 high (2 advisories × manifest + lockfile) | **Proven not reachable; guarded by a test** | see below, [[ITEM-0070]] |
| `mysql2` | 1 high | **Existing documented disposition holds** | pinned exactly by `prisma@7.10.0`; datasource is PostgreSQL only; `check-production-advisories.mjs` |

### `xlsx` — why "not reachable" is now enforced rather than asserted

Parsing moved to ExcelJS earlier (`ExcelExportService.parseFirstWorksheet`,
`import-analysis.service.ts`). SheetJS is used only to *write*
(`buildWorkbookBuffer`). A registry sentence is not enforcement, so
`services/api/src/common/excel/xlsx-write-only.invariant.spec.ts` fails if any
source file calls a SheetJS read or parse function, imports one by name, or if
anything other than the export service imports `xlsx`. Mutation-tested on
2026-11-21: three violating files were each caught, and a read call that appears
only in a comment was correctly not flagged.

Removing the dependency entirely needs the bank payroll writer ported to
ExcelJS, which changes the bytes of workbooks sent to banks. That decision was
deferred earlier as [[ITEM-0070]] and is unchanged.

## 2. Work packages

| WP | Scope | Status | Evidence |
|---|---|---|---|
| WP1 | Dependency alerts: fix what has a safe in-range fix, prove or track the rest | **Implemented; CI pending on the exact final SHA** | commit `f19b247d` plus the follow-up commit on the same branch |
| WP2 | Electron 42 upgrade + sandbox | **Partial.** Navigation hardening added in source (new windows, webviews and non-file navigation denied; unit-tested decision function). Electron 42, `sandbox:true`, native-module and update/signing review not done; real-device test mandatory | [[ITEM-0234]], [[ITEM-0235]] |
| WP3 | Tenant-isolation penetration tests, auth/MFA/session review | **Partial.** Database-backed HTTP suite written and passing for roles, teams, users, sessions and saved views. Not covered yet: list/aggregate/export, raw SQL, bulk and nested writes, permission levels, suspended tenants, jobs, files, payroll, billing, concurrency. Auth/MFA review not started. The full tenant-isolation review is **NOT passed**. | sections 2a, 2b |
| WP4 | Render `render.yaml` drift (39 fields), Neon polling/scan investigation, network-transfer spike | **Render drift classified; Neon partly analysed from source only** (no Neon access from this session) | sections 2c, 2d; [[ITEM-0236]], [[ITEM-0237]] |
| WP5 | Vercel Node 22/24 drift, selective builds, frontend performance | **Node drift confirmed and aligned in source; the rest not assessed** | section 2f |
| WP6 | Agent-workforce efficiency | Not started | |
| WP7 | Observability, runbooks, restore drills | Not started | |
| WP8 | Compliance control register (HIPAA applicability, ISO, SOC 2, ASVS, NIST) | **First readiness register written; no compliance or certification is claimed** | [`docs/compliance/control-readiness-register.md`](../compliance/control-readiness-register.md) |

## 2a. WP3 — tenant isolation: static sweep (2026-11-21)

Method: every Prisma `findUnique` / `findUniqueOrThrow` / `update` / `delete`
by bare `id` on a model that declares `tenantId` (269 such models), scanned in
`services/api/src` excluding specs.

| Stage | Count |
|---|---|
| By-id operations with no `tenantId` in the same `where` | 526 |
| After excluding platform-side modules (billing, super-admin, tenant-control-plane, tenants, leads, partners, auth, agent, notifications and similar, where cross-tenant access is legitimate) and methods that mention `tenantId` anywhere | 51 |

All 51 were read in context. **No confirmed isolation defect.**

- **Platform-only (`assertPlatform`)**: `contracts.get`, `support-cases.get`
  and their helpers, which operate on DijiPeople's own commercial records.
- **Tenant-verified helper before the write**: `settings-runtime.detail`
  (`findFirst` on `{ id, tenantId, settingKey }`), `loans.bank`,
  `customization.findPackageOrThrow`, `timesheet-export.findRequest` (also
  requester-scoped), `saved-view.findOwn` (also owner-scoped); and in
  `roles`, `teams` and `users` the service checks tenant ownership through a
  tenant-filtered lookup before calling the bare-id repository mutator.
- **Not request-driven**: DataJob recovery and queue bookkeeping, which carry
  the job's own id.

**What this is and is not.** A static pattern sweep over one defect class. It
does not cover raw SQL, `updateMany` with computed filters, list/search/count/
aggregate/export paths, or any model reached through a relation include. It
shows the convention is being followed; it does not prove isolation.

**Status: superseded by section 2b.** The database-backed test was blocked until
a private throwaway PostgreSQL cluster was created (recipe in 2b); roles, teams,
users, sessions and saved views are now covered. Banks, configuration records,
customization packages and timesheet exports are still not.

## 2b. WP3 — database-backed HTTP isolation (2026-11-22)

**Isolated database.** The local server on port 5432 requires a password this
session does not hold, and the documented route reads it from `services/api/.env`,
which is off limits. Instead a private cluster was created with `initdb` in the
session scratchpad (trust authentication, `127.0.0.1:5433`, role
`dp_isolation_test`, database `dijipeople_isolation_test`). `scripts/assert-test-database.mjs`
confirmed it as disposable before any migration. The full migration history was applied,
then `seed:demo`, `seed:admin` and `seed:config` with the documented CI
placeholder values. No credential was stored, printed or committed; nothing
touched the 5432 server or any managed database.

**Baseline.** The existing database-backed isolation suites
(`tenant-isolation-pattern`, `tenant-scoped-reads`, `employee-scope-isolation`,
`lookups-usage-isolation`, `reporting-tenant-isolation`, `workspace-domain-isolation`)
run green on it once `seed:config` has supplied geography: 4 passed first, then
the 2 that needed geography passed (18 of 18).

**New suite** `services/api/test/cross-tenant-by-id-mutations.e2e-spec.ts` —
evidence class: **database-backed HTTP integration** (real Nest app, real guards
and services, real PostgreSQL; not a mock, not a static scan). A GLOBAL_ADMIN of
tenant ALPHA targets tenant BETA's role, team, user, session and saved view by
id: reads, lists, updates, deactivation, permission changes, clone, delete, team
membership, user roles, business unit, MFA reset, session revocation. It also
tries to wire BETA ids into ALPHA's own rows. BETA's rows must be byte-identical
afterwards, and each group opens with a positive control showing the target is
reachable by its owner. 15 tests, all passing.

- **Mutation proof.** Removing `tenantId` from the team repository lookup made 3
  tests fail; the file was restored from a backup and `git diff` was empty.
- **What it found.** No isolation defect. One behaviour worth stating:
  `DELETE users/:id/sessions` for a foreign user id answers 200 with
  `revoked: 0` rather than 404. It is a tenant-scoped `updateMany` and revokes
  nothing; the test asserts exactly that.
- **My own probe errors**, caught because the suite asserts 403/404 only: a status
  value that is not in the enum (400) and a debug line. A refusal by validation
  would have passed a looser test, so refusals are pinned to 403 or 404.

**Read-verify-then-write.** The convention reads through a tenant-filtered
lookup, then calls a repository mutator keyed by bare id. Assessment: it is not
an atomic guarantee, but the gap needs a tenant-owned row to change tenant between
the read and the write. No endpoint changes a row's `tenantId`, ids are UUIDs that
are not reused, and tenant erasure deletes rather than moves. So the window is
theoretical under current code and becomes real the day a tenant merge or move
feature exists. Not changed here: converting every mutator to a conditional write
is a wide change with no demonstrated exploit, and is better done per module
alongside its own tests. Recorded as a standing risk, not fixed.

**Evidence classes, so nothing is overstated**

| Class | State |
|---|---|
| Static inspection | 526 candidates narrowed to 51, all read (section 2a) |
| Mock-based tests | Existing unit specs; not counted as isolation evidence |
| Database-backed tests | New suite (15) plus the six existing suites (18+) |
| HTTP integration | New suite |
| Independently verified | **Not yet** — no independent QA/Security pass has been run |

**Tenant lifecycle suite** `services/api/test/tenant-lifecycle-access.e2e-spec.ts` (database-backed HTTP, 16 tests): a cryptographically valid token is refused (401) for each of the 8 non-ACTIVE tenant statuses, for a DISABLED user and for a revoked session, and access returns on reactivation; a role-less user and a tenant token on the admin client are refused. Mutation-tested: dropping the tenant-status condition in `auth-access.service.ts` failed 10 of 16.

**Employee surface suite** `services/api/test/employee-cross-tenant-surface.e2e-spec.ts`
(database-backed HTTP, 11 tests): ALPHA's admin lists, searches, exports (filtered
and unfiltered) and reads ten by-id sub-resources of BETA's employee; mutates,
reassigns, bulk-deletes and bulk-assigns BETA rows; tries to give an ALPHA
employee a BETA manager; and attempts mass assignment of `tenantId`, `id`,
`createdById` and `isDeleted` (all 400, row not moved). Positive controls show
each admin sees its own rows. BETA's rows are unchanged. Mutation-tested:
removing `tenantId` from `findByIdAndTenant` failed 2 tests. Note: the list
response echoes the search term, so the empty-result assertion is on `items` and
`meta.total`, not raw text.

**Independent QA review (2026-11-22, read-only, `dp-qa-engineer`)** of the first
three suites found real weaknesses, all addressed:

- Refusals accepted 403 as well as 404, and positive controls were GET-only, so a
  failing write verb would have looked like isolation. Fixed: owner-side controls
  now use the same write verbs (200), and attacks on by-id reads must be exactly 404.
- A response-text assertion on a refusal body proved nothing (removed); the clone
  check used a body the endpoint ignores (now compares role counts).
- The role-less control accepted 401 or 403 (now exactly 403).
- The cross-client replay test fails on signature, not on the `aud` check, so it is
  not claimed as that; a claim-forgery test was added (a validly signed token whose
  `tenantId` names another tenant is refused, 401).
- The top uncovered scenario was **child-id IDOR** (caller's own parent id plus the
  other tenant's child id). Added `services/api/test/child-id-idor.e2e-spec.ts`
  (16 tests): 8 verbs across team members, team roles, user roles, education and
  previous employments, each with an owner control (2xx) and an attack that must be
  exactly 404 with BETA's child row unchanged. Mutation-tested: removing the tenant
  and employee filter from the education update/delete failed 2 tests.
- The reviewer found no isolation defect by reading, with medium confidence, and
  could not confirm the employee documents, compensation and history handlers.

All 45 tests across the four strengthened suites pass on the isolated database.

**Still open under WP3:** list/search/count/aggregate/export paths, raw SQL,
bulk and nested writes, upsert and `updateMany` with computed filters,
SELF/TEAM/BUSINESS_UNIT/TENANT permission levels, platform versus tenant
boundary, suspended or disabled tenants, background-job tenant propagation,
files/documents, payroll and billing data, and concurrent ownership change.
Until those run, the tenant-isolation review is not reported as passed.

## 2c. WP4 — Render drift classification (2026-11-22)

Read-only `check-render-config --json` against the live API service. 39 fields:
4 scalar, 35 environment variables. Values were not read or recorded. `render.yaml`
is not synced to the service, so it changes nothing live by itself.

| Class | Fields | Verdict |
|---|---|---|
| **Needs an owner action** ([[ITEM-0236]]) | `TRUST_PROXY_HEADERS` (declared 2; live falls back to inferring 1 hop on Render), `healthCheckPath` (declared `/api`, unset live), `SUBSCRIPTION_ORDER_SWEEPER_ENABLED` (worker off; expired orders accumulate), `PLATFORM_OPS_NOTIFICATION_EMAILS`, `PLATFORM_ENVIRONMENT` | Real behavioural or safety gap |
| **Code default equals the declared value** | `R2_REQUEST_TIMEOUT_MS` (15000), `R2_MAX_ATTEMPTS` (3), `DATA_JOB_WORKER_ENABLED` (on unless `false`), `DATA_JOB_WORKER_POLL_INTERVAL_MS` and `OUTBOX_WORKER_POLL_INTERVAL_MS` (5000), `OUTBOX_WORKER_BATCH_SIZE` (25), `*_SWEEPER_POLL_INTERVAL_MS` and `MANAGED_BILLING_WORKER_POLL_INTERVAL_MS` (15 min), `MANAGED_BILLING_GRACE_DAYS` and `…RENEWAL_NOTICE_DAYS` (7), `SEAT_OVERAGE_WARN/REVIEW_PERCENT/ABSOLUTE` (10/100/100), `TENANT_RETENTION_DAYS` (60), `RELEASE_ARTIFACT_MAX_BYTES` (512 MB) | Benign; absence changes nothing |
| **Deliberately opt-in, dashboard-owned** (`sync: false` in the file) | `DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_TIMEOUT_MS`, `DATABASE_POOL_CONNECTION_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS`, `RETENTION_POLICY_VERSION` | Unset means library or code default (connect timeout 15 s, no statement timeout). A decision, not drift |
| **Secrets seeded once, correctly absent** | `PLATFORM_SUPER_ADMIN_EMAIL`, `_PASSWORD`, `_PASSWORD_RESET` | Absent is the safe state |
| **Cannot be classified from here** | `EMAIL_PROVIDER`, `EMAIL_SMTP_HOST/PORT/SECURE/USER/PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | Tenant mail may be configured in the database instead; unverified |
| **Scalar, equivalent or cosmetic** | `name` (service name differs), `startCommand` (root `npm run start:prod` versus the workspace form), `buildCommand` (live adds `--include=dev` and a 6 GB Node memory cap; the file has neither) | The build difference is deliberate, a memory cap the build needs; reflect it in the file or leave it, no live risk either way |

Also noted: the live pre-deploy command carries a 4 GB Node memory cap that the
file does not. Autodeploy is on and the branch is `main`, as expected.

**Not done, by design:** no live Render configuration was changed, and no
`render.yaml` edit was made. Resource sizing, restarts, memory and CPU were not
measured because the checker reads configuration, not metrics.

## 2d. WP4 — Neon (corrected 2026-11-22)

**Correction.** An earlier version of this section, and of [[ITEM-0237]], assumed
autosuspend was enabled and that worker polling kept compute awake. The owner
reports the connected production compute is: **autosuspend timeout 0 (disabled),
minimum 0.25 CU, maximum 8 CU, connection pooling disabled, compute active.** This
session did not read that configuration directly; it is taken from the owner.
With autosuspend off, compute never suspends whatever the application does, so
idle back-off on the pollers is **not** a cost fix under this configuration and
no saving from it is claimed. No Neon metrics are readable here, so live query
rates, utilisation, transfer and the 20 November spike were not observed.

- **OutboxEvent / DataJob sequential scans.** The outbox claim query uses
  `status IN (…) AND availableAt <= NOW() ORDER BY availableAt … FOR UPDATE SKIP
  LOCKED`, with `@@index([status, availableAt])` present. The data-job poll index
  shipped in `20261121090000`. Cumulative scan counters on small tables are the
  planner's normal choice and are history, not a current defect. Confirmed
  inefficiency: none from source.
- **Timer inventory** (per API process, source count, not measured): outbox 5 s,
  data-job 5 s, attendance reconciliation 30 s, platform communications retry
  5 min, timesheet jobs 15 min, three billing workers 15 min each, report
  scheduler 60 s (only when enabled), workforce snapshot hourly, error-log
  retention daily. About 38,000 cycles a day from the first three alone.
- **What this means.** Cost is the 0.25 CU floor around the clock plus whatever
  the workload scales to; polling affects load and connections, not suspension.
  Enabling autosuspend is a product and cost decision with a cold-start
  trade-off, and the background timers make it impractical without event-driven
  wake-ups. Recorded as a PRODUCT_DECISION in [[ITEM-0237]].
- **Connection pooling is disabled** and the API keeps its own `pg` pool. Moving
  to Neon pooled connections needs proof that `pg_advisory_xact_lock` and
  transactions behave under transaction pooling; not assumed.
- **Not assessed:** connection counts against the CU limit, backup and branch
  governance, retention of large operational tables, modeled versus measured
  cost (no figure is given).

## 2e. WP3 — raw SQL sweep (2026-11-22)

Static, one defect class. 23 raw-SQL call sites in `services/api/src` outside
specs. Most are `pg_advisory_xact_lock(hashtext(...))` (billing, leave, payroll,
numbering): they lock, they do not read or write tenant data. The tenant-facing
data queries are `matchingRecordIdsSql` and `orderedRecordIdsSql`
(`customization/custom-field-query.ts`): both put `"tenantId" = ${tenantId}` in the
`WHERE`, parameterised through `Prisma.sql`; the only `Prisma.raw` is the constant
`ASC`/`DESC` chosen from a two-value union. No `queryRawUnsafe`/`executeRawUnsafe`.
No defect found. Not covered: whether every caller passes `user.tenantId`
(the two custom-field callers do).

## 2f. WP5 — Vercel (read-only, 2026-11-22)

| Project | Node on Vercel | Root dir | Ignored build step |
|---|---|---|---|
| diji-people-admin | 24.x | repo root | builds only when the branch is `main` |
| diji-people-web | 24.x | `apps/web` | same |
| diji-people-landing | 24.x | `apps/landing` | same |

- **Node drift (confirmed setting).** Repo, CI and `engines` say 22.x; all three
  Vercel projects are set to 24.x. `apps/web` and `apps/landing` deploy from their
  own directory, where the root `engines` is not read, so they very likely build on
  24 (not confirmed from a build log). Production therefore builds on a Node major
  that CI never ran. **Source-side correction made:** `engines.node = 22.x` in the
  three app `package.json` files plus a governance test that fails if any app drifts
  from the root (mutation-tested: setting `apps/web` to 24.x failed it). This takes
  effect for production only when a release reaches `main`. The alternative is to
  move CI and the repo to 24; that is an owner decision, so only the lower-risk
  alignment to what CI proves was made.
- **Build skipping.** Skipping is by branch only: every push to `main` builds all
  three apps even when only the API or docs changed. A path-aware ignore step is
  possible, but a wrongly skipped build leaves production stale, and the dashboard
  setting takes precedence unless `vercel.json` overrides it; not attempted here.
  No cost saving is claimed; build-minute usage was not readable.
- **Not assessed:** bundle sizes, SSR/ISR behaviour, function usage, navigation
  latency, duplicate polling, RTL and accessibility. These need a built app and a
  browser session; the Playwright MCP server failed to connect this session.

## 3. Measured results so far

| Measure | Before | After | How |
|---|---|---|---|
| Critical advisories (all scopes, local lockfile) | 2 | 0 | `npm audit` |
| `npm audit` high (all scopes) | 39 on GitHub's count | 9 | `npm audit` after the upgrades |
| Production advisory gate | passing | passing, 0 critical, 13 dispositioned | `scripts/check-production-advisories.mjs` |
| Lockfile entries changed | — | 10 | version diff against `origin/develop` |

GitHub's open-alert count will not change until the fix reaches `main`.

## 4. Decisions needed from the owner

| # | Decision | Recommendation |
|---|---|---|
| 1 | Dismiss the four `xlsx` runtime alerts on GitHub as "vulnerable code is not used"? It is a visible state change on the repository, so it is not done here. | Yes, after [[ITEM-0070]] or once this change reaches `main`, citing the invariant test. |
| 2 | Take Electron to 42.x ([[ITEM-0234]]) in the next desktop agent release? | Yes, with the real-device checklist. |

Carried over from SESSION-0136: QUESTION-3931 (shared geography writes),
`relationJoins` (D7), Vercel dashboard wiring (D4), BUG-3136 rate-limit budgets,
tenant enumeration on `public/tenants/resolve`.

## 5. Restartable handoff

- Branch `agent/dependency-alert-remediation` is pushed; its worktree is
  `D:/My Work/hrm-dijipeople/dijipeople-perf-reliability`.
- WP1 is integrated into `develop` only after `CI required gate` is green on the
  exact final SHA and `develop` has not moved.
- Next in order: WP3, then WP4. Nothing in WP2–WP8 has started.
- Not touched and not to be touched: `main`, production, the primary checkout's
  two pre-existing files, other sessions' worktrees.
