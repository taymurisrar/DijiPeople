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
| WP2 | Electron 42 upgrade + sandbox | **Partial.** Source-side hardening done and unit-tested: own-page-only navigation and redirects, new windows and webviews denied, per-channel IPC sender allow-list, payload validation, stricter CSP. Update integrity and local data reviewed: [[ITEM-0238]] (plaintext heartbeat queue, unsigned builds). Electron 42, `sandbox:true` and native modules not done. Real-device test mandatory; unit tests are not device evidence | [[ITEM-0234]], [[ITEM-0235]] |
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

**Two confirmed defects found and fixed in this round (both CRITICAL):**

- **BUG-4624** — a tenant Global Administrator could publish, promote to STABLE,
  disable and enable the global desktop-agent releases every tenant installs, and
  read the management catalogue: `POST /app-releases/:id/disable` 201, `/promote`
  201, `POST /app-releases` 201, `GET /app-releases/manage` 200. The key
  `appDownloads.manage` is held by tenant Global Administrators through the
  elevated-role bypass. Fixed with a platform-subject check on the five routes
  (`app-release-authority.e2e-spec.ts`, 6 tests, 4 failed before the fix; REG-702,
  QA-AUTHZ-020). Not exercised: whether the update feed would serve an attacker's
  row; the builds are unsigned ([[ITEM-0238]]).
- **BUG-4625** — one request from any signed-in tenant user, with no role at all,
  to `GET /api/platform/logs` ended the API process. The denial audit wrote a
  tenant user id into `PlatformAuditLog.platformActorUserId` (a foreign key to
  platform users); the insert failed inside an uncaught `void` promise, and Node
  ends the process on an unhandled rejection. Reproduced on a locally booted API:
  liveness 200 before, no connection after. Fixed (audit against the caller's own
  tenant, with a catch) plus a logged `unhandledRejection` handler as a net
  (`platform-tenant-boundary.e2e-spec.ts`, `unhandled-rejection.spec.ts`; REG-703,
  QA-AUTHZ-021). Verified to fail on the original code (foreign-key violation, no
  audit row). Production was not tested or touched. The handler keeps the process
  alive after an unhandled rejection: a deliberate trade against an outage,
  logged at error level each time.

**Independent review of both fixes** (read-only subagent, 2026-11-22) — outcome:

- **Fix A is complete for the release routes but the class is not closed.** Tenant
  administrators can create, rename and delete the shared state and city rows
  (`lookups.controller.ts`, `lookups.service.ts`: no tenant filter). That is the
  already-open owner decision QUESTION-3931 and is unchanged here; it is the same
  shape as BUG-4624. Cleared by reading: currencies and tax rules (tenant-scoped),
  the update feed (read-only), the publisher controller (own token), platform
  controllers (platform guard). Not inspected: `platform-runtime`,
  `data-management`, `navigation`, `settings-runtime`, the agent and DLP
  controllers.
- **The platform-FK class is not closed.** `AuditService.log` maps the actor to
  `platformActorUserId` whenever `tenantId === 'platform'`. The other
  `tenantId: 'platform'` call sites (auth, bank-transfer, payment-method-registry,
  payment-recheck, platform-numbering, release-publisher) were not opened to see
  which actor they pass; any reachable by a tenant caller with a tenant user id
  would repeat BUG-4625. A structural guard in `AuditService` is the proper fix and
  is NOT done.
- **Timer workers:** each of the 11 `setInterval` workers has an internal try/catch
  (counted, not every path read), so they are not obviously unhandled-rejection
  sources.
- **The unhandled-rejection handler** is installed after `NestFactory.create`, so a
  boot-time rejection still crashes (desirable); it is a no-op if another handler
  exists (the guarantee then goes silent); a rejection storm would flood the log
  with no rate limit or alert. `uncaughtException` is left unhandled on purpose
  (state after a synchronous throw is unknown; a restart is safe); a log-and-exit
  handler would at least flush the cause and is not added.
- **Tests (fixed).** The `unhandledRejection` collector in the BUG-4625 test was
  vacuous: jest installs its own handler, so a listener never fires. It is removed;
  the assertion that matters is the tenant audit row, polled rather than a fixed
  wait. A negative test for `enable` was added (66 tests across the two suites).
  The tenant-to-platform checks are GET-only except for the release routes.
- **A route-level guard** would be sturdier than the in-handler
  `assertPlatformSubject` call, which a new release route can forget; no test yet
  enforces "every mutating route on this controller refuses a tenant".

**Sensitive employee data suite**
`services/api/test/employee-sensitive-data-isolation.e2e-spec.ts` (13 tests):
salary and bank details read and overwritten through the real endpoints, personal
details, address, emergency contact, employment history. Controls are the same
verbs on the caller's own employee. Observed: address and emergency-contact
updates refuse a foreign employee with 403 while others answer 404; the test
requires the answer to equal the one for a nonexistent id, so the status is not an
existence oracle. Mutation-tested (skipping the access check let an overwrite
through, 1 test failed).

**Platform / tenant boundary suite**
`services/api/test/platform-tenant-boundary.e2e-spec.ts` (59 tests): 14 platform
routes against a tenant Global Administrator (403 on the web client, 401 on the
admin client) with a platform super admin control (200) on each; a platform token
on five tenant routes returns empty results while the tenant demonstrably has
data. `app-releases/publisher/releases` is excluded because it uses its own
publisher token.

**Sweep of writes to tenant-less models** from tenant-reachable modules: only the
shared geography lookups (QUESTION-3931, already an owner decision) and internal
auth-lockout counters. No further cases of the BUG-4624 shape found by this
method; it does not cover reads or routes that mutate through another service.

**Still open under WP3:** employee documents (download, view, upload), payroll
generation, approval and bank files, billing, subscriptions, payment webhooks and
entitlements, attendance, leave, timesheets and shifts, the dynamic entity API
(including the `USE_ENTITY_DATA_API` path), reporting and exports, bulk
operations outside employees, create/update with foreign references,
SELF/TEAM/BUSINESS_UNIT permission levels, background-job tenant propagation,
concurrent authorization and mutation, MFA / password reset / refresh-token
flows, and an independent QA/Security review of the two fixes. Until those run,
the tenant-isolation review is not reported as passed.

## 2g. WP3 — further database-backed surfaces (2026-11-22, second pass)

Same method as 2b: a real HTTP request through the real guards on an isolated database, an owner control on every route, the attack's exact status, and BETA's persisted rows re-read. Every suite is lint-clean and was mutation-tested (a tenant filter removed, the suite went red, the file restored from backup).

| Surface | Suite | Tests | Result |
|---|---|---|---|
| Documents (upload, view/download bytes, retag, types, categories, global rows) | `document-cross-tenant.e2e-spec.ts` | 18 | no defect; mutation fails 3 |
| Leave (requests, types, policies, foreign ids) | `leave-cross-tenant.e2e-spec.ts` | 25 | no defect; mutation fails 3 |
| Attendance (entries, corrections, manual create/re-home) | `attendance-cross-tenant.e2e-spec.ts` | 18 | no defect; mutation fails 3 |
| Payroll (runs, operations, journals, payslips, GL, posting rules, bank accounts, `/me`) | `payroll-cross-tenant.e2e-spec.ts` | 185 | no isolation defect; mutation fails 13 |
| Billing (tenant routes, 42 platform routes on both clients, webhooks, entitlements) | `billing-cross-tenant.e2e-spec.ts` | 76 | one defect (BUG-4638, fixed); mutation fails 2 |
| Machine publisher routes (release token) | `app-release-authority.e2e-spec.ts` | 11 | no defect |

Findings:

- **BUG-4638 (fixed, REG-704, QA-BILLING-050).** `GET /billing/plan-prices/:id/seat-quote` served another customer's reserved unit price. Fixed by applying `assertPlanAssignableToTenant` and mapping a refusal to the generic unavailable code.
- **BUG-4652 (fixed, REG-705, QA-BILLING-051).** Found by the independent review: createCheckoutSession had the same gap as the quote path and could start a checkout for another customer's reserved price. Both paths now share ssertTenantMayBuyPlan, which translates only the eligibility refusal. Open follow-up: the anonymous public order paths check ssertSellableToAnonymousVisitor but not eligibleCustomerAccountId.
- **BUG-4639 (open, `PLAN_REQUIRED`).** Payroll journal reversal returns 500 on a migrated database: migration `20260712190000` used `DROP CONSTRAINT IF EXISTS` on what `20260430040000` created as a unique index. Functional, not isolation. The fix is a migration that drops an index on a shared database, so it is not applied without an ExecPlan and the owner's go-ahead.
- **Unhandled-rejection logging is redacted.** The handler now logs the class, code and first line of the message (secret-redacted, truncated) and stack frames only, so Prisma SQL and bound values never reach the log. A local .catch remains the primary mechanism; the handler is a logged net, and uncaughtException still ends the process so the platform restarts it.
- **Structural audit guard.** `AuditService.log` now resolves the platform actor before writing, so a mis-attributed `tenantId: 'platform'` caller can no longer violate the actor foreign key (the structural half of BUG-4625). Every platform-audit call site is covered centrally.
- **Governance workflow was red on `develop`.** `Engineering governance` is a separate workflow from `CI`; it failed on every push since the BUG-4624 fix (stale authorization inventory, then stale derived counts in `AGENTS.md`). Earlier reports of those SHAs passing referred to `CI` only. Both are corrected, and every governance step now passes locally.

Independent QA/Security review of this pass (a separate agent that did not write it) found five of my attacks were refused for the wrong reason: the admin user had no linked employee (leave and attendance), an OFFICE-mode body had no location, a body lacked the required reason or timestamp, and a documents persisted check counted only the BETA tenant. All were corrected: the employee is linked, each attack body is proved valid by a success control on the caller's own data, refusals are pinned to the tenant-scoped message (for example "Selected employee does not belong to this tenant."), and the documents check counts by entity id and title across tenants. The earlier "mutation fails N" claims for leave and attendance did not cover those attacks and should not be read as evidence for them. Still open from that review: the same wide-status acceptances remain in some payroll, billing and leave controls (listed in the review, all with persisted-state checks), and the audit guard lacks a transaction-client spec.
Not yet covered: timesheets, projects/resource assignments, customers/partners/agreements, reports/saved views outside employees, the dynamic entity API (including `USE_ENTITY_DATA_API`), imports, SELF/TEAM/BUSINESS_UNIT permission-level cases, background-job tenant propagation, MFA/password-reset/refresh flows. Independent QA/Security review of this pass is pending.
## 2h. Backlog verification pass (2026-11-22)

The directive was to process the whole open backlog, not only the work packages. The headline "323 open" is misleading: it counts records marked FIXED but not yet QA-verified. The actual state at develop 23335bdc was **55 OPEN bugs (40 FIX_NOW, 15 PLAN_REQUIRED), 235 FIXED awaiting verification, 56 deferred bugs, 69 deferred items, 31 READY items, 16 product decisions**. Records go stale (an earlier audit found five of fifty with false premises), so each of the 40 open CRITICAL and HIGH bugs was first checked against the current code by an independent reader before anything was changed. Verdicts:

| Bug | Verdict | Done / next |
|---|---|---|
| BUG-3110 live DB password in git history | OWNER_GATED | needs credential rotation; not touched |
| BUG-3137 reset link in delivery log | STILL_OPEN, now FIXED | forgot-password path fixed, scrub added; historical rows hold expired links, scrubbing them is an owner decision |
| BUG-3138 reset reactivates disabled | STILL_OPEN, now FIXED | |
| BUG-3139 replayable reset token | STALE_FIXED, closed | existing unit spec |
| BUG-3140 refresh flag resets session | STILL_OPEN, now FIXED | flag now relaxes idle only |
| BUG-3141 branding SVG XSS | STALE_FIXED (serving path) | no regression test yet; upload still accepts SVG; slug-addressed public asset is by design. Next: an e2e test |
| BUG-3154 PII plaintext | PARTIAL | expand phase merged; Employee.cnic and tax-profile writes not wired to the codec (S-M); backfill and contract are OWNER_GATED (need a tested backup, ITEM-0131) |
| BUG-3155 field masking only in browser | STILL_OPEN, L | extract a server-side field-security service and apply on employee reads, the entity data API and exports; high risk to the three frontends and the agent, needs an ExecPlan |
| BUG-3156 tenant admin writes shared geography | OWNER_GATED | QUESTION-3931 unanswered; recommended option A (platform-only) |
| BUG-3162 resolve cache poisoning | STILL_OPEN, now FIXED | |
| BUG-3165 ~27 statements per request | PARTIAL | 39 to 27 shipped; 22 of the rest are nested-include round trips; flat findMany rewrite behind a golden-equivalence spec, M-L, security review required; not relationJoins |
| BUG-3166 deploy before CI verdict | OWNER_GATED | set Render autoDeployTrigger to checksPass |
| BUG-3167 browser gate runs zero web tests | STALE_FIXED | env block seeds tenant flows; close after a skip-count assertion |
| BUG-3168 gates that execute nothing | PARTIAL, now FIXED | DB e2e verdict refuses zero-passed or any skipped; browser readiness loop now fails instead of warning |
| BUG-3169 notification fan-out | STILL_OPEN, M | batch dedupe and creates per rule |
| BUG-3170 timesheet import per-row loop | STILL_OPEN, M | batched reads; all-or-nothing semantics are a product choice |
| BUG-3171 audit filter DISTINCT scan | STILL_OPEN, S-M | needs EXPLAIN on a populated table to choose between skip-scan, a time window and a TTL |
| BUG-3172 GET /payslips unpaginated | STILL_OPEN, S-M | a silent cap would truncate a 50-employee tenant's history; needs paging in the web screen, left planned |
| BUG-3173 duplicate shell fetches | STALE_FIXED, closed | transport-level dedupe, existing spec |
| BUG-3174 per-click fan-out | PARTIAL, L | structural; stays PLAN_REQUIRED |
| BUG-3175 nine admin modules page in memory | STILL_OPEN, L | push where/orderBy/skip/take into Prisma, module by module; search semantics change |
| BUG-3176 server-table search | STILL_OPEN, now FIXED | browser check owed |
| BUG-3177 storageKey IDOR | STALE_FIXED, closed | existing spec |
| BUG-3179 multipart limits | STALE_FIXED, closed | source guard added |
| BUG-3183 platform-ops alerts never sent | STILL_OPEN, M | handler logs at a level production discards; setting the recipients env today would silence the alerts it should surface; send through the notifications orchestrator |
| BUG-3184 termination not audited | STILL_OPEN, now FIXED | |
| BUG-3185 document reads not audited | STILL_OPEN, now FIXED | employee-document, recruitment and support-case readers still unaudited |
| BUG-3186 no erasure path | OWNER_GATED | retention and what "erased" means |
| BUG-3187 rate limit covers writes only | STILL_OPEN, M | five or six public GETs unguarded; widen the invariant; the read budget must not break shared-IP offices |
| BUG-3188 429 writes a DB row | PARTIAL, S-M | coalesce 429 occurrences; keep 401/404/400 rows |
| BUG-3189 login CPU | STILL_OPEN | refresh tokens do not need bcrypt (256-bit random): S-M; lowering the cost or a new hash library is OWNER_GATED |
| BUG-3195 pool defaults | PARTIAL | 15 s connect timeout shipped; max, idle and statement timeout are dashboard-owned |
| BUG-3196 payroll calculation inline | STILL_OPEN, claim now FIXED | asynchronous calculation remains PLAN_REQUIRED |
| BUG-3197 leave overdraw | PARTIAL, ceiling now FIXED | pending requests still do not reserve balance (product choice) |
| BUG-3198 health is static ok | PARTIAL | live and ready routes shipped; Render setting owner-gated |
| BUG-3199 outbound deadlines | STILL_OPEN, now FIXED | |
| BUG-3200 sync email on request thread | STILL_OPEN, L | route through the outbox; changes delivery status semantics |
| BUG-3201 P2002 inside interactive transactions | STILL_OPEN, M | three sites: identity ensure, recruitment draft, invoice number; raw INSERT ... ON CONFLICT |
| BUG-3202 payroll ignores isDeleted | STALE_FIXED, closed | unit spec only; add an e2e |
| BUG-3205 tenant delete cascades through audit | OWNER_GATED | retention policy |

Everything marked FIXED has a regression test that fails without the fix, a REG entry and a QA scenario; independent review of the batch is still pending. What is not fixed is stated above rather than hidden.

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

**Health route dependency trace (2026-11-22).** `/api` and `/api/health` call `entitlements.describeEnforcement()`, which reads `PlatformSetting` when a 30 s cache expires; the read is wrapped, so a refused connection cannot fail the route. Measured against a locally booted API on the isolated database, with the database stopped and the cache expired: `/api` 200 in 61 ms, `/api/health/live` 200 in 37 ms, `/api/health/ready` 503 in 32 ms. A hanging database (not refusing) was not reproduced; there the read waits for the 15 s pool timeout. So `/api` is database-tolerant, not database-independent. Source change: a dedicated `/api/health/live` (no imports, no database), registered before Nest; the claim in `readiness.ts` that `/api/health` was environment-only was stale and is corrected. The live service is not changed; after the release, set the Render health check to `/api/health/live` ([[ITEM-0236]]).

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
