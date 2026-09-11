# CI/CD, code quality gates and automated test coverage

Auditor area: **CI**. Worktree `D:/My Work/hrm-dijipeople/dijipeople-audit`, branch
`agent/full-technical-audit`, HEAD `f55cf4b2`.

## The central question, answered first

**Could broken or insecure code reach production today? Yes — and it did not
require a hypothetical.** Production currently serves commit `890cd96d`. Render
began deploying that commit at `16:02:36Z`; the CI run for that same commit
started at `16:02:37Z` and did not conclude until `16:16:30Z`. **The code was
live for 6 minutes 29 seconds before any CI verdict existed for it**, and its
migrations and seeds had already run against the production database in
`preDeployCommand` before the instance took traffic. Branch protection gates the
*pre-merge* SHA; the merge commit that actually deploys is validated only
afterwards, and Render is configured with `autoDeployTrigger: "commit"` rather
than `checksPass`. Full evidence in **CI-01**.

That is the crux. The rest of the picture is more favourable than that sentence
suggests: the pipeline itself is unusually well-built — fourteen genuinely
required jobs, zero `continue-on-error`, a real PostgreSQL in three of them, and
a test corpus with no `expect(true)` and no snapshot tests anywhere. The failures
are at the seams: what the gates *skip*, and what happens after the gate is
green.

---

## Pipeline shape (context for the findings)

`.github/workflows/` holds exactly three workflows: `ci.yml` (1,203 lines),
`release-app.yml`, `agent-auto-release.yml`.

`ci.yml` declares **15 jobs**. `ci-required` ("CI required gate") `needs` **14 of
them — every other job in the file**:

```
.github/workflows/ci.yml:1155
    needs:
      [resolve, validate, typecheck, lint, test-api, test-web, test-admin, test-landing,
       test-agent-desktop, test-runtime, database-migration, database-e2e-report, build, browser-e2e]
```

- **No job exists outside the gate.** `grep -rn "continue-on-error" .github/workflows/`
  returns only comments recording that two jobs *used* to carry it. There is no
  fail-open job.
- Triggers: `push: branches: ['**']`, `pull_request: [main, develop]`,
  `workflow_dispatch`. `concurrency` cancels in-flight runs on every ref **except**
  `main` and `develop`.
- The gate rejects `skipped` as firmly as `failure` (`ci.yml:1196-1199`), unless
  `resolve` found exact-SHA evidence — a mechanism I checked and consider sound
  (`scripts/ci-evidence.mjs`, job-level not run-level, so evidence cannot chain).
- Measured wall clock on a full run (34372726777, develop, 2026-09-09):
  **13.0 min**, critical path `Browser e2e` 12.7 min. Evidence-reuse runs finish
  in **0.3–1.0 min**. Timeouts: 5–45 min per job; every job declares one. npm
  cache on every heavy job; Turborepo cache restored in `build`.

Live branch protection, read from the GitHub API (not from the repo):

| Branch | PR required | Required checks | strict | enforce_admins | approvals |
|---|---|---|---|---|---|
| `main` | yes | `CI required gate` | **true** | true | **0** |
| `develop` | **no** | **none** | – | true | 0 |

---

### CI-01 — Production deploys before the deployed commit has a CI verdict

- **Category:** Deployment safety / CI gating
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** Render service `srv-d7js7fqqqhas739v4i7g`, `.github/workflows/ci.yml`, `render.yaml`
- **Evidence:**

  Render service configuration (GET `https://api.render.com/v1/services/srv-d7js7fqqqhas739v4i7g`):
  ```json
  "autoDeploy": "yes",
  "autoDeployTrigger": "commit",
  "branch": "main",
  ```
  Render supports `checksPass` for this field. It is set to `commit`.

  The deploy that produced the currently-live instance
  (GET `/v1/services/srv-.../deploys?limit=5`):
  ```
  dep-dago676417fc73fptpeg  live  890cd96d  created 2026-09-09T16:02:36.356Z
                                            finished 2026-09-09T16:10:01.579Z  trigger new_commit
  ```
  The CI run for that same SHA
  (GET `/repos/taymurisrar/DijiPeople/actions/runs?head_sha=890cd96d...`):
  ```
  34374199661  CI  success  main  created 2026-09-09T16:02:37Z -> 2026-09-09T16:16:30Z
  ```
  The deploy started **1 second before** the run began and went live **6m29s
  before** the run concluded.

  `890cd96d` is a merge commit, not the SHA the gate validated:
  ```
  $ git log -1 --format="%H%nparents: %P" 890cd96d...
  890cd96ded0ecbc77870c5841500d67eafa93aaf
  parents: 4d0635a0b99099af... 6f841a1593...
  ```
  The `CI required gate` ran on parent `6f841a15` (the PR head). The tree that
  deployed is a different object.

  `render.yaml` declares no `autoDeploy` key at all, so this behaviour is invisible
  from a clean clone.

  A fifth deploy in the same listing carries `trigger: deployed_by_render` — a
  dashboard-initiated deploy, which passes through no gate whatsoever.

- **Current behaviour:** any commit landing on `main` starts a production deploy
  immediately. `preDeployCommand` (`npm --workspace api run release` =
  `migrate deploy && seed:config && seed:verify && seed:admin &&
  repair:market-countries && seed:legal && legal:publish --confirm`) runs against
  the production database before the CI verdict for that commit exists.
- **Expected behaviour:** the deploy waits for the `CI required gate` check on the
  exact SHA being deployed, or the deploy is triggered by CI itself after the gate
  passes.
- **Risk:** because `strict: true` forces the PR head to be up to date, the merge
  commit's *tree* is normally identical to the validated head's, which is what has
  kept this from biting. It stops being true the moment two PRs merge in the same
  window, a merge conflict is resolved in the merge commit, `strict` is relaxed, or
  someone clicks "Manual Deploy" in the Render dashboard. In any of those cases a
  migration runs against production data with no automated verification of the tree
  that produced it. There is one instance and no automatic rollback (CI-09).
- **Remediation:** set the Render service's `autoDeployTrigger` to `checksPass`
  (one dashboard/API field), and add `autoDeploy`/`autoDeployTrigger` to
  `render.yaml` so the setting is reviewable. Longer term, move the deploy trigger
  into a `deploy` job in `ci.yml` gated on `needs: [ci-required]`, using a Render
  deploy hook.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### CI-02 — The required browser gate executes zero tests against `apps/web`

- **Category:** Test coverage / CI honesty
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `.github/workflows/ci.yml` (`browser-e2e`), `e2e/tests/flow-{h,i,j}*.spec.ts`
- **Evidence:**

  Only three Playwright specs drive the tenant product:
  ```
  $ grep -rln "BASE_URLS.web\|E2E_WEB_URL\|localhost:3001" e2e/tests/
  e2e/tests/flow-h-tenant-sign-in.spec.ts
  e2e/tests/flow-i-growth-modules.spec.ts
  e2e/tests/flow-j-tenant-settings.spec.ts
  ```

  All three gate on credentials:
  ```
  e2e/tests/flow-h-tenant-sign-in.spec.ts:49-52
    test.skip(
      !tenantCredentials(),
      'E2E_TENANT_USER_EMAIL / E2E_TENANT_USER_PASSWORD are unset (no default exists by design)',
    );
  ```
  (identically at `flow-i-growth-modules.spec.ts:115` and `flow-j-tenant-settings.spec.ts:103`)

  ```
  e2e/fixtures/web-session.ts:51-52
    const email = process.env.E2E_TENANT_USER_EMAIL?.trim();
    const password = process.env.E2E_TENANT_USER_PASSWORD;
  ```

  The `browser-e2e` job env block (`ci.yml`, the 17 keys between the job's
  `services:` and `steps:`) sets `DATABASE_URL`, `E2E_DATABASE_URL`, `NODE_ENV`,
  `SECRET_ENCRYPTION_KEY`, `STRIPE_*`, `PLATFORM_SUPER_ADMIN_*`,
  `E2E_PLATFORM_ADMIN_EMAIL`, `E2E_PLATFORM_ADMIN_PASSWORD`,
  `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL`, `API_ORIGIN`.
  **`E2E_TENANT_USER_EMAIL`, `E2E_TENANT_USER_PASSWORD`, `E2E_TENANT_SLUG` and
  `E2E_TENANT_ROOT_DOMAIN` appear nowhere in the workflow.**

  Test counts: flow-h 5, flow-i 4, flow-j 1 = **10 of the 69 Playwright tests skip
  unconditionally in CI**, plus 4 `test.fixme`.

  The job comment claims the opposite was fixed:
  ```
  ci.yml:1108-1112
    # `dev:web` joined on 2026-08-29 (ITEM-0034). Port 3001 was never started and
    # never polled, so `apps/web` — 254 pages, the app every employee of every
    # tenant uses — could not be reached by a test ... Its absence could not even
    # produce a skip: it was invisible rather than missing.
  ```

- **Current behaviour:** CI starts `dev:web` on port 3001 and polls it, then every
  test that would use it skips for want of credentials. Playwright exits 0; the job
  is green; the gate is satisfied.
- **Expected behaviour:** the browser gate exercises the tenant product, or the
  job fails loudly when it cannot.
- **Risk:** `apps/web` is the surface every employee of every tenant uses. The
  required browser gate provides it exactly zero executed assertions, while
  reporting success — which is worse than having no gate, because the QA records
  and the completion contract read the green as coverage.
- **Remediation:** add `E2E_TENANT_USER_EMAIL` / `E2E_TENANT_USER_PASSWORD` /
  `E2E_TENANT_SLUG` to the `browser-e2e` env block, pointing at the account
  `seed:demo` creates (the job already runs `seed:demo`). Then add a floor
  assertion (CI-03) so the credentials silently disappearing fails the job.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM — turning on 10 previously-unrun tests will surface
  real defects; that is the point, but budget for it.
- **Fix now:** YES

---

### CI-03 — Two required gates report success when they execute nothing

- **Category:** CI gating / fail-open
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/test/helpers/db-fixtures.ts`, `.github/workflows/ci.yml`
- **Evidence:**

  ```
  services/api/test/helpers/db-fixtures.ts:321-323
  export function describeWithDatabase(): jest.Describe {
    return process.env.DATABASE_URL ? describe : describe.skip;
  }
  ```
  **28 of the 38** `services/api/test/*.e2e-spec.ts` files are wrapped in it —
  including `tenant-isolation-pattern`, `reporting-tenant-isolation`,
  `workspace-domain-isolation`, `tenant-erasure-*`, `outbox-delivery`,
  `payment-authorised-provisioning` and every identity suite. If `DATABASE_URL`
  is unset or renamed, all 28 report as skipped, jest exits 0, and the
  `Publish the verdict` step (`ci.yml:1120-1129`) passes because it keys purely on
  `steps.e2e.outputs.exit_code`.

  The browser job's readiness loop **warns rather than fails**:
  ```
  ci.yml:1115-1120
    for i in $(seq 1 60); do
      if curl -sf -o /dev/null "$url"; then echo "ready: $url"; break; fi
      if [ "$i" = "60" ]; then echo "::warning::$url never became ready"; fi
  ```
  and every flow spec opens with `test.skip(!ready, 'BLOCKED_INFRASTRUCTURE …')`
  (e.g. `e2e/tests/flow-c-landing-public-surface.spec.ts:32-36`). A server that
  never starts produces a wholly-skipped, green run.

  Nothing anywhere asserts a minimum executed-test count. The `Summarise` step
  greps for `Tests:` lines but does not act on them.

- **Current behaviour:** the two gates that are the only ones exercising a real
  database and a real browser both degrade silently to zero coverage.
- **Expected behaviour:** absence of a precondition is an infrastructure failure,
  not a pass.
- **Risk:** the exact failure mode the pipeline's own comments say it exists to
  prevent — "a false green". CI-02 is this defect already realised for the tenant
  product.
- **Remediation:** in `database-e2e-report`, fail the job if `DATABASE_URL` is
  unset before jest runs, and assert a floor on the reported test count (the job
  comment already records the expected numbers: 25 suites / 304 tests). In
  `browser-e2e`, make the readiness loop `exit 1` on timeout, and add a Playwright
  reporter check (or parse `playwright-report/results.json`, already produced) that
  fails when executed tests fall below a floor.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### CI-04 — Tenant isolation is proven for one module; 60+ have no isolation test

- **Category:** Test coverage / Tenant isolation
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/test/`
- **Evidence:**

  The briefing named two specs. Read end to end, they are not what their filenames
  suggest to a reader scanning the directory:

  - **`test/attendance-integrations-isolation.e2e-spec.ts` (991 lines) is
    excellent and genuinely proves isolation** — for one module. It drives the
    *real* services against a *real* PostgreSQL and runs the ID-guessing attack:
    ```
    :30-33  The central case is ID GUESSING: tenant A holds a genuine, currently-valid id
            belonging to tenant B and calls each service with it. Every one must behave as
            though the record does not exist.
    ```
    34 such tests: `it('rejects reading another tenant's integration')`,
    `it('rejects rotating a credential on another tenant's gateway')`,
    `it('rejects a cross-tenant mapping at the service layer too')` (`:416`, `:615`, `:548`).
    Scope: `attendance-integrations` + the attendance-engine queue. Nothing else.

  - **`test/permission-propagation.e2e-spec.ts` is not an isolation test at all.**
    It tests `PermissionBootstrapService.bootstrapTenantRbac` seeding —
    `it('adds every missing foundation permission when synchronised')` (`:150`),
    `it('produces no duplicates when run repeatedly')` (`:235`). No cross-tenant
    read is attempted anywhere in its 376 lines.

  - `test/tenant-isolation-pattern.e2e-spec.ts` says of itself:
    ```
    :23-27  This suite is small on purpose. It is not an attempt to test tenant isolation
            across the product — it establishes the *pattern* that module-specific
            isolation tests copy...
    ```
    It asserts on `prisma.role` directly, so it proves PostgreSQL and Prisma
    behave, not that any service or endpoint is scoped.

  - `test/reporting-tenant-isolation.e2e-spec.ts` (302 lines) is a real
    cross-tenant test of the reporting engine's `planWhere` + `ReportScopeResolver`
    — `it('returns no row belonging to the other tenant')` (`:157`). It explicitly
    bypasses HTTP.

  Repo-wide search for any other test that constructs two tenants and attempts a
  cross-tenant access finds 23 files, **all of which are unit specs with a mocked
  Prisma** — they can assert a `where` clause was *shaped* with a `tenantId`, which
  is a weaker claim than "the database returned nothing".

  Confirmed: **no API unit spec touches a real database.**
  ```
  $ git grep -lE "new PrismaClient|PrismaPg" -- 'services/api/src/**/*.spec.ts'
  (no output)
  ```
  Of 307 API unit specs, 119 mock Prisma with `jest.fn()`, 188 test pure logic or
  scan source; exactly **1** uses `Test.createTestingModule`.

  Modules with **no** tenant-isolation test of any kind: `employees`, `payroll`,
  `payslips`, `leave`, `attendance`, `timesheets`, `documents`, `claims`, `loans`,
  `benefits`, `compensation`, `recruitment`, `onboarding`, `approvals`,
  `workflows`, `audit`, `views`, `navigation`, `data`, `inbox`, and the rest.

- **Current behaviour:** the isolation guarantee — which AGENTS.md states is
  "enforced by convention, not by the database" — has automated proof for
  `attendance-integrations` and `reporting`, and nothing else.
- **Expected behaviour:** for a convention-enforced invariant, a test that exercises
  the convention on every tenant-owned surface, or a static gate that fails on an
  unscoped query.
- **Risk:** a service written without `tenantId` in its `where` ships green.
  Nothing in CI would notice. Given no RLS and no working Prisma middleware
  (`$use` is inert on `@prisma/client@7.8.0`), CI is the only remaining net and it
  has one square of mesh.
- **Remediation:** two complementary moves. (1) Copy the
  `attendance-integrations-isolation` shape to the highest-value tenant-owned
  modules — `employees`, `payslips`, `leave`, `documents`, `attendance` first;
  the file's own header is written as a recipe for exactly this. (2) Add a static
  invariant spec in the style of `common/constants/wiring-invariants.spec.ts` that
  fails when a repository method on a tenant-owned model calls `findUnique` by bare
  id or issues a `where` with no `tenantId`, with an explicit allowlist for
  platform-guarded paths.
- **Difficulty:** HIGH (1), MEDIUM (2)
- **Regression risk:** LOW
- **Fix now:** YES for (2), LATER for (1) done module by module

---

### CI-05 — The payroll run engine has no tests

- **Category:** Test coverage / business risk
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/payroll/`
- **Evidence:**
  ```
  $ wc -l services/api/src/modules/payroll/payroll-run.service.ts services/api/src/modules/payroll/payroll.service.ts
    3257 payroll-run.service.ts
    2936 payroll.service.ts
  ```
  Neither has a colocated spec. The only specs naming `PayrollRunService` are:
  - `payroll-run.claim.spec.ts` — **one test**:
    `it('includes only payroll-approved claims inside the payroll cutoff')` (`:7`)
  - `payroll-run.loan.spec.ts` — loan instalment handling only

  `payroll-operations.service.spec.ts` has two tests, neither about calculation:
  `it('routes configured payroll finalization through generic Approvals')` (`:14`),
  `it('returns dashboard costs in the payroll currency')` (`:113`).

  Nothing anywhere exercises `calculateDraftPayrollRun`, `calculatePayrollRunTaxes`
  or `finalizeCycle`. The surrounding pieces *are* well covered —
  `tax-calculation.service.spec.ts` is 594 lines with real bracket maths
  (`it('calculates pure marginal tax across progressive brackets')`), and
  `payroll-journal.service.spec.ts`, `payroll-period-generation.service.spec.ts`
  and `compensation-formula.service.spec.ts` are all substantive. The gap is the
  engine that assembles them.
- **Current behaviour:** 6,193 lines of gross-to-net assembly, run finalisation and
  run locking ship with no automated assertion.
- **Expected behaviour:** at minimum, a table-driven test of a full run for a
  handful of employee shapes, and a test that a finalised run cannot be mutated.
- **Risk:** payroll is the highest-consequence output in an HRM. An arithmetic or
  ordering regression reaches customers with every gate green, and is discovered
  by an employee reading a payslip.
- **Remediation:** add `payroll-run.service.spec.ts` covering gross-to-net for a
  salaried and an hourly employee with one earning, one deduction, one loan
  instalment and tax; plus a finalisation/locking test asserting a locked run
  rejects mutation. A DB-backed e2e in the style of `attendance-engine.e2e-spec.ts`
  would be better still.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** YES

---

### CI-06 — Public repository with secret scanning, push protection and Dependabot all disabled

- **Category:** Security tooling in CI
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** repository settings, `.github/`
- **Evidence:**
  GET `/repos/taymurisrar/DijiPeople`:
  ```json
  "visibility": "public",
  "private": false,
  "security_and_analysis": {
    "secret_scanning":                  { "status": "disabled" },
    "secret_scanning_push_protection":  { "status": "disabled" },
    "dependabot_security_updates":      { "status": "disabled" },
    "secret_scanning_non_provider_patterns": { "status": "disabled" },
    "secret_scanning_validity_checks":  { "status": "disabled" }
  }
  ```
  `git ls-files .github` returns three workflow files and nothing else — **no
  `dependabot.yml`, no CodeQL workflow, no gitleaks/trufflehog step**.

  I scanned the tree for committed live credentials and found none — every hit on
  `sk_live_|whsec_|rnd_|vcp_|ghp_` is a placeholder or documentation
  (`.env.production.example:19  STRIPE_SECRET_KEY=sk_live_replace_me`;
  `services/api/src/modules/audit/audit-snapshot.spec.ts:64  apiKey: 'sk_live_abc'`).
  So this is a **control gap, not a live leak**.

- **Current behaviour:** the full source of a multi-tenant HRM, all 323 bug
  records, the deployment runbooks and the environment-variable inventory are
  world-readable; CI job logs and the 30-day `browser-e2e` / `database-e2e`
  artifacts (which include `api.log`) are world-readable; and nothing scans a push
  for a credential before it becomes permanent public history.
- **Expected behaviour:** either the repository is private, or push protection and
  secret scanning are on and a secret-scanning step runs in CI.
- **Risk:** one accidental `.env` commit is instantly public and permanent, with no
  detection. The dependency side is partially covered (see Healthy —
  `check:production-advisories` is a required blocking gate), but with Dependabot
  security updates off, nothing opens the PR that fixes a new advisory.
- **Remediation:** enable secret scanning + push protection (free on public repos)
  and Dependabot security updates; add `.github/dependabot.yml`; add a
  `gitleaks`/`trufflehog` step to the `validate` job. Separately, confirm with the
  owner that public visibility is intentional — that decision belongs to the
  security specialist and the owner, not to CI.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### CI-07 — `services/api` is not in TypeScript strict mode

- **Category:** Code quality gate
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/tsconfig.json`, `services/api/eslint.config.mjs`
- **Evidence:**
  ```jsonc
  // services/api/tsconfig.json:15-19  — no "strict" key anywhere in the file
      "skipLibCheck": true,
      "strictNullChecks": true,
      "forceConsistentCasingInFileNames": true,
      "noImplicitAny": false,
      "strictBindCallApply": false,
  ```
  The shared strict base exists and is used by only two near-empty workspaces:
  ```jsonc
  // packages/typescript-config/base.json:13-16
      "noUncheckedIndexedAccess": true,
      "skipLibCheck": true,
      "strict": true,
  ```
  `apps/docs` (2 files) and `packages/ui` (3 files) extend it. `services/api`
  (1,201 `.ts` files) extends nothing.

  The lint side does not compensate:
  ```js
  // services/api/eslint.config.mjs:29
  '@typescript-eslint/no-explicit-any': 'off',
  ```
  with `no-floating-promises`, `no-unsafe-argument`, `no-unsafe-assignment`,
  `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return` and
  `no-base-to-string` all downgraded to `warn` (`:30-36`), plus
  `'@typescript-eslint/require-await': 'off'` (`:57`).

  AGENTS.md states "Strict TypeScript. No `any` escape hatches" — the largest
  workspace is the one that does not comply.

- **Current behaviour:** implicit `any` compiles clean in the only workspace that
  writes to the database. The CI `lint` job caps warnings at `--max-warnings=789`
  against ~784 actual, so the ratchet is real, but it is a ratchet on a count, not
  a prohibition.
- **Expected behaviour:** `strict: true`, or an explicit recorded decision with a
  migration plan.
- **Risk:** an implicit `any` flowing into a Prisma `where` is exactly how a
  `tenantId` becomes `undefined` — which Prisma treats as "no filter". Given CI-04,
  the type system is not backstopping that either.
- **Remediation:** flip `noImplicitAny: true` first (it is the narrowest and highest
  value), fix the fallout module by module, then extend
  `@repo/typescript-config/base.json`. `no-floating-promises` deserves promotion to
  `error` on its own merits.
- **Difficulty:** HIGH
- **Regression risk:** MEDIUM
- **Fix now:** LATER (but `noImplicitAny` now)

---

### CI-08 — 24% of the API workspace is excluded from the typecheck CI runs

- **Category:** Code quality gate
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/tsconfig.build.json`, `services/api/test/jest-e2e.json`
- **Evidence:**
  `npm run typecheck` → `turbo run check-types` → for the API,
  `tsc --noEmit -p tsconfig.build.json`:
  ```jsonc
  // services/api/tsconfig.build.json:6
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"]
  ```
  That removes **307 colocated `*.spec.ts` + 41 files under `test/` = 348 files**
  from the only typecheck CI runs.

  The e2e jest config then disables ts-jest's own diagnostics:
  ```jsonc
  // services/api/test/jest-e2e.json
  "transform": { "^.+\\.(t|j)s$": ["ts-jest", { "diagnostics": false }] }
  ```
  So the 38 e2e specs — the suites that carry every tenant-isolation and
  data-integrity assertion the product has — are typechecked **nowhere**. (Unit
  specs are at least transpiled by ts-jest with diagnostics on, so they get a
  partial check at run time.)

  `services/api/tsconfig.json:23-28` *does* include `test/**/*.ts`, so an IDE shows
  a stricter file set than CI — the classic "green locally, and green in CI, for
  different reasons" shape.
- **Current behaviour:** a type error in an e2e spec is invisible to both
  `check-types` and jest.
- **Expected behaviour:** tests are typechecked.
- **Risk:** low direct blast radius, but it is how an isolation assertion quietly
  degrades — a mistyped fixture that silently compares `undefined` to `undefined`
  passes.
- **Remediation:** add a second `check-types:tests` script pointed at
  `tsconfig.json` and wire it into the `typecheck` job; remove
  `"diagnostics": false` from `jest-e2e.json` once it is clean.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

### CI-09 — The live Render service diverges from `render.yaml`: no disk, no health check, no `FILE_STORAGE_DIR`

- **Category:** Deployment safety / config drift
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN (ITEM-0084 `READY`, `FIX_NOW`; parent BUG-0767 `VERIFIED`)
- **Component:** `render.yaml`, Render service `srv-d7js7fqqqhas739v4i7g`
- **Evidence:**
  `render.yaml` declares:
  ```yaml
  plan: starter
  healthCheckPath: /api
  disk:
    name: dijipeople-storage
    mountPath: /var/data
    sizeGB: 5
  envVars:
    - key: FILE_STORAGE_DIR
      value: /var/data/storage
    - key: PLATFORM_ENVIRONMENT
      value: production
  ```
  The live service:
  ```json
  "plan": "standard",  "rootDir": "services/api",  "healthCheckPath": "",
  "buildCommand": "npm ci --include=dev && NODE_OPTIONS=\"--max-old-space-size=6144\" npm run build"
  ```
  ```
  GET /v1/disks?serviceId=srv-d7js7fqqqhas739v4i7g  ->  []
  ```
  Of the 85 env-var keys set on the service, `FILE_STORAGE_DIR`,
  `PLATFORM_ENVIRONMENT`, `EMAIL_PROVIDER`, `EMAIL_SMTP_*` and `EMAIL_FROM*` — all
  declared in `render.yaml` — are **absent**.

  ITEM-0084 predicted this exactly: *"It is fixed — somebody made them agree — and
  **nothing fails when they diverge again**."* They have diverged again.

  `preDeployCommand` is at least present now (`npm --workspace api run release`),
  so the memory of "migrations do not apply on deploy" is superseded.
- **Current behaviour:** `render.yaml` is a document, not a configuration. Two
  consequences are live: **(a)** there is no `healthCheckPath`, so Render routes
  traffic to a new instance as soon as the port opens — no readiness gate, one
  instance, no automatic rollback; **(b)** there is no persistent disk and
  `FILE_STORAGE_DIR` is unset, so `StorageService` writes uploaded tenant
  documents, branding assets and published installers to the container filesystem,
  which every deploy destroys.
- **Expected behaviour:** the committed file is applied, or a check fails when it
  is not.
- **Risk:** (a) a deploy that boots and immediately fails takes production down
  silently. (b) is a data-loss path and belongs to the storage/data specialist —
  routed below.
- **Remediation:** implement ITEM-0084 — a `check:render-drift` script comparing
  `render.yaml` against the live service via the Render API, run in CI (advisory,
  since it needs a credential) or in `repo:health`. Then reconcile the service.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** YES for the health check; route (b)

---

### CI-10 — Nothing detects a destructive migration before it merges

- **Category:** Schema / CI gating
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (searched specifically; absent)
- **Known:** NEW
- **Component:** `.github/workflows/ci.yml`, `scripts/`
- **Evidence:**
  The `database-migration` job runs `scripts/verify-database.mjs`, which is
  `generate → migrate deploy → migrate status → seed:config → seed:verify`
  against an **empty** PostgreSQL (`ci.yml:626-631`). That proves the history
  applies; an empty database has no data to lose, so it cannot distinguish an
  additive migration from one dropping a production column.

  ```
  $ grep -n -i "destructive" scripts/validate-framework.mjs scripts/repo-health.mjs scripts/db-preflight.mjs
  scripts/validate-framework.mjs:1415:    'destructive actions',      # a PLANS.md prose check
  scripts/repo-health.mjs:20: * It **reports only**. It never fetches destructively...
  scripts/db-preflight.mjs:29: * READ-ONLY by default...
  ```
  No script scans migration SQL for `DROP COLUMN`, `DROP TABLE`, `ALTER COLUMN …
  SET NOT NULL` or a changed unique constraint. The protection is `PLANS.md` prose
  requiring an ExecPlan — a process, not a gate.

  What *does* exist and is genuinely good:
  `services/api/src/common/prisma/schema-unique-drift.spec.ts` (23 tests) asserts
  that the set of `@@unique` declarations the migration chain fails to create is
  exactly the seven already recorded — a real schema/migration drift gate, running
  inside the required `test-api` job. `prisma validate` runs in `typecheck`
  (`ci.yml:239`).
- **Current behaviour:** a destructive migration merges on a green gate.
- **Expected behaviour:** a destructive statement in a new migration fails CI
  unless an ExecPlan reference is present.
- **Risk:** irreversible. `docs/deployment/rollback-runbook.md:22-32` states the
  case plainly — "Redeploying an older SHA does **not** roll the schema back —
  there are no down-migrations here" — and classifies destructive changes
  `MANUAL_RECOVERY_REQUIRED`. Combined with CI-01 (the migration runs before that
  commit's CI verdict exists), this is the sharpest edge in the deployment path.
- **Remediation:** a `check:destructive-migrations.mjs` that diffs
  `services/api/prisma/migrations/` against the merge base, greps the new SQL for
  the destructive verbs, and fails unless the commit or an accompanying
  `docs/plans/` ExecPlan opts in. Add it as a step in the `validate` job (no
  dependencies needed).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### CI-11 — A push to `develop` can publish a desktop-agent build with no CI dependency

- **Category:** Release gating
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `.github/workflows/agent-auto-release.yml`
- **Evidence:**
  ```yaml
  # agent-auto-release.yml:14-19
  on:
    push:
      branches: [develop]
      paths:
        - apps/agent-desktop/package.json
  ```
  The job declares no `needs`, checks no status of `ci.yml`, and runs
  `release:app --channel beta --no-build --yes` on a version bump. It races the CI
  run for the same commit.

  Mitigations that are real: it publishes to **BETA** only, promotion to STABLE
  stays manual, and `environment: release-${{ vars.AGENT_AUTO_RELEASE_ENVIRONMENT
  || 'production' }}` means GitHub environment protection rules (if configured)
  apply. It also runs its own `--dry-run` first.
- **Current behaviour:** a version bump on `develop` builds and publishes an
  unsigned Electron installer to the BETA feed regardless of whether the tree
  passes CI.
- **Expected behaviour:** the publish waits for the `CI required gate` on that SHA.
- **Risk:** BETA testers install a build from an unvalidated tree. The agent holds
  a refresh token in the OS credential vault, reads window titles and captures
  geolocation, and the installer is unsigned (ITEM-0026) — so the blast radius of a
  bad build is larger than "a broken app".
- **Remediation:** add a step that polls the `CI required gate` check for
  `github.sha` (`scripts/await-ci.mjs` already exists and does exactly this) and
  exits before the build if it is not `success`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### CI-12 — `smoke:deployment` exists and is wired to nothing

- **Category:** Deployment safety
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `scripts/smoke-deployment.mjs`, `.github/workflows/`
- **Evidence:**
  ```
  $ grep -rn "smoke" .github/workflows/
  (no matches)
  ```
  The script is a root npm script (`smoke:deployment = node scripts/smoke-deployment.mjs`)
  and is documented as a manual step:
  `docs/deployment/deployment-runbook.md:80-82` — *"8. Smoke tests …
  `npm run smoke:deployment` with `SMOKE_API_BASE_URL` and credentials set."*

  The runbook is candid about why this matters:
  ```
  docs/deployment/deployment-runbook.md:61-63
  ⚠️ `status` is hardcoded `ok` and tests no dependency. **A 200 here does not
  mean the system is healthy** — proceed to smoke tests before believing it.
  ```
  And `.agent/context/deployment-runtime.md:167-170`: *"**CI validates a commit;
  nothing validates a deployment.**"*
- **Current behaviour:** deployment is automatic (CI-01); verification of it is
  manual and depends on a person remembering. Nothing runs after a deploy.
- **Expected behaviour:** a post-deploy job that runs the smoke suite against the
  deployed URL and alerts on failure.
- **Risk:** the window between "deploy went live" and "someone noticed it is
  broken" is unbounded and human-paced. There is no automatic rollback to shorten
  it (CI-09).
- **Remediation:** a `post-deploy` workflow triggered by a Render deploy webhook
  (or on a schedule) running `npm run smoke:deployment` against
  `https://dijipeople.onrender.com/api` with a smoke account, plus a check that
  `/api`'s `commit` field equals the expected SHA — a comparison that is now
  possible and was not before (see Healthy).
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

### CI-13 — `develop` has no required status check, so integration is gated by process only

- **Category:** CI gating / branch policy
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN — deliberate, documented in `scripts/verify-branch-policy.mjs:26-33`
- **Component:** branch protection, `scripts/verify-branch-policy.mjs`
- **Evidence:**
  Live, from GET `/repos/taymurisrar/DijiPeople/branches/develop/protection` via
  `node scripts/verify-branch-policy.mjs --json`:
  ```json
  "develop": { "protected": true, "requirePullRequest": false,
               "requiredChecks": [], "enforceAdmins": true }
  ```
  The intent is explicit and reasoned:
  ```
  scripts/verify-branch-policy.mjs:26-33
   * `develop` has **no required status check** on purpose. A required check on a
   * branch with no pull-request requirement blocks direct pushes outright ...
   * Validation before integrating is enforced by the framework
   * (`DEVELOP_VALIDATION_REQUIRED`), and CI still runs on every push...
  ```
  For contrast, `main` is correctly locked: PR required, `CI required gate`
  required, `strict: true`, `enforce_admins: true`, force-push and deletion off.
  Note `required_approving_review_count: 0` — merges to production need a green
  gate but no human.
- **Current behaviour:** red code can land on `develop` and stay there. Nothing
  mechanical prevents it; the agent framework is expected to.
- **Expected behaviour:** for an autonomous-integration branch this is a defensible
  trade, but it should be measured rather than assumed.
- **Risk:** bounded — `main` still requires the gate, so nothing reaches production
  this way. The cost is a `develop` that can sit broken, which delays everyone.
- **Remediation:** no change to the policy; instead add a scheduled job that
  reports `develop` HEAD's gate status, so a red integration branch is visible
  rather than discovered by the next agent.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### CI-14 — Stripe webhook signature verification is asserted by reading source text, never by executing it

- **Category:** Test honesty / payments
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW (the underlying incident is KNOWN — BUG-1543)
- **Component:** `services/api/src/modules/billing/`
- **Evidence:**
  ```ts
  // services/api/src/modules/billing/webhook-rejection-diagnostics.spec.ts:1-8
  const CONTROLLER = readFileSync(
    join(__dirname, 'controllers/stripe-webhook.controller.ts'), 'utf8',
  ).replace(/\r\n/g, '\n');
  ...
  :45   expect(code).toContain("check: 'signature-header-present'");
  ```
  ```ts
  // services/api/src/modules/billing/services/webhook-event-not-ready.spec.ts:236
  expect(controller).toContain("@Headers('stripe-signature')");
  ```
  `services/api/src/modules/billing/services/webhook.service.spec.ts` is **33
  lines / 1 test** — an idempotency check ("does not dispatch an already processed
  Stripe event"). No test anywhere feeds a forged, missing or replayed signature
  through the real handler.

  This is a class, not a one-off: **65 spec files assert on source text read with
  `readFileSync`** (~140 assertions of 8,556 total). Some are legitimate structural
  invariants; this one stands in for behaviour on a payment-integrity boundary.
  The spec's own header records that BUG-1543 fired the *"a customer may have paid
  without us knowing"* alert on production.
- **Current behaviour:** the signature gate is proven to be *written*, not to
  *work*. Renaming a variable breaks the test; removing the verification while
  keeping the string would not.
- **Expected behaviour:** a test that POSTs a body with a valid, an invalid and an
  absent `stripe-signature` header and asserts 2xx / 400 / 400 respectively.
- **Risk:** an unverified webhook endpoint accepts forged payment events — a
  subscription activated without payment, or a tenant provisioned for free.
- **Remediation:** add a behavioural spec using `stripe.webhooks.generateTestHeaderString`
  with the CI placeholder secret, exercising the real controller. Keep the
  source-text spec; it serves a different purpose.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### CI-15 — Notification delivery, employee termination, leave draw-down, refresh-token replay and the agent auth path are untested

- **Category:** Test coverage / business risk
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** multiple
- **Evidence:** flow-by-flow, from reading the relevant specs:

  | Flow | Verdict | Basis |
  |---|---|---|
  | Authentication (login, logout, lockout) | **STRONG** | `auth-session-lifecycle.spec.ts` (441L), `login-lockout.service.spec.ts` — `it('cannot be disabled by configuring a threshold of zero')`, `it('locks the person globally after enough failures, and clears on success')`; `test/admin-logout-revocation.e2e-spec.ts` |
  | Refresh-token rotation / replay | **NONE** | `auth.service.spec.ts` is 144L / 2 tests; no test asserts a used refresh token cannot be replayed |
  | RBAC wiring | **STRONG** | `wiring-invariants.spec.ts` (543L) walks >500 handlers: `it('every guarded, non-public endpoint declares both permission systems')`; `attendance-controller-authorization.spec.ts` instantiates a real `PermissionsGuard` and calls `canActivate` |
  | Row scope (OWN/TEAM/BUSINESS_UNIT) | **PARTIAL** | `rbac-query-scope.spec.ts` is 132L; it asserts the predicate is *shaped* right, never that a BUSINESS_UNIT caller cannot read another unit's rows |
  | Payroll run | **NONE** | see CI-05 |
  | Attendance | **STRONG** | `attendance.service.spec.ts` (1248L) + 3 DB-backed e2e suites (963L/952L/1104L) — `it('flags Karachi to London half an hour apart')`, `it('produces the same result when run five times')` |
  | Timesheets | **PARTIAL** | only `timesheet-workflow.service.spec.ts` (403L) is substantive; no submission→approval→lock path |
  | Leave | **PARTIAL** | entitlement allocation well covered; **`approveLeaveRequest`'s draw-down of `totalUsed` has no test**, nor does overlapping-request rejection |
  | Employee lifecycle | **PARTIAL** | hire and change are audited and tested; `grep terminateEmployee\|TERMINATED\|offboard` across employee specs returns nothing — **termination and soft delete are untested** |
  | Subscriptions / entitlements | **STRONG** | `tenant-entitlement.service.spec.ts` (333L), `entitlement.guard.spec.ts` (316L) — `it('still refuses when the caller holds every elevated role at once')` |
  | Tenant provisioning | **STRONG** | `provisioning-queue`, `tenant-activation`, `tenant-provisioning-recovery` e2e — `it('returns the winner's tenant when a concurrent request already linked one')` |
  | Payments / Stripe | **PARTIAL** | checkout and invoices strong (`payment-authorised-provisioning.e2e-spec.ts` 505L); webhook signature source-text only (CI-14) |
  | Outbox | **STRONG** | `it('loses the event when the surrounding business transaction rolls back')`, `it('hands each event to exactly one of two concurrent dispatchers')` |
  | Notification orchestrator / queue / email processor | **NONE** | no spec for `notification-orchestrator.service.ts`, `notifications.service.ts`, `queues/notification-queue.service.ts`, `processors/email-notification.processor.ts` |
  | Agent-desktop sync | **PARTIAL** | `offline-queue.spec.ts` (219L) is excellent — `it('drops the oldest, not the newest, when full')`. `api-client.ts` (login/refresh/logout) and `session-manager.ts` (686L) have **no spec** |

- **Current behaviour:** the outbox reliably delivers events to a consumer; nothing
  verifies the consumer ever produces a notification. An agent that silently fails
  to refresh loses the attendance the queue is faithfully preserving.
- **Remediation:** in priority order — notification processor, leave approval
  draw-down, employee termination, refresh-token replay, agent `session-manager`.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

### CI-16 — Three workspaces are never linted, and `packages/config` is never typechecked

- **Category:** Code quality gate coverage
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `.github/workflows/ci.yml` (`lint`), `turbo.json`, workspace manifests
- **Evidence:**
  The CI `lint` job invokes eslint directly in exactly four directories —
  `apps/web`, `apps/admin`, `apps/landing`, `services/api` (`ci.yml:262-289`) —
  not via `turbo run lint`. Workspaces with **no `lint` script at all**:
  `apps/agent-desktop` (30 `.ts` files), `e2e` (21 `.ts` files), `packages/config`,
  `packages/eslint-config`, `packages/typescript-config`.

  `packages/config` has no `check-types` script either, so `turbo run check-types`
  silently skips it — and it is shipped runtime code consumed by all three
  `next.config.ts` files (security headers, app URLs, the platform runtime schema).

  `turbo.json:150-179` defines only four tasks — `build`, `lint`, `check-types`,
  `dev`. **There is no `test` task**, so no single command runs the repo's jest
  suites; CI invokes each workspace individually, which is why five separate test
  jobs exist.

  `tools/zkteco-poc` is not in the `workspaces` array, so turbo never touches it
  despite having all three scripts.
- **Risk:** low. `agent-desktop` is the most notable — it is the app with native
  capabilities, and it is unlinted.
- **Remediation:** add a `lint` script to `apps/agent-desktop` and `e2e`, a
  `check-types` to `packages/config`, and switch the CI lint job to
  `turbo run lint` once `services/api`'s `--fix` is removed from its script.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### CI-17 — No SAST, and no coverage floor anywhere

- **Category:** Security testing / quality gates
- **Severity:** LOW
- **Confidence:** CONFIRMED (searched specifically; absent)
- **Known:** NEW
- **Component:** `.github/workflows/`
- **Evidence:** no CodeQL workflow, no Semgrep, no SonarQube configuration in
  `git ls-files .github` (three workflow files only) or the repo root. No jest
  `coverageThreshold` in any workspace config; `test:cov` exists in `services/api`
  but is wired to nothing.

  Dependency scanning is genuinely present and blocking — see Healthy.
- **Risk:** low as a standalone gap. The repository substitutes ~30 hand-written
  bespoke invariant scripts (`check:proxies-forward-refusals`,
  `check:proxies-decide-nothing`, `check:no-hardcoded-urls`,
  `check:dialogs-contained`, …) that are far more targeted than generic SAST would
  be, and all run in a required job. The absence of a coverage floor is a
  deliberate and defensible choice given the evidence in Healthy.
- **Remediation:** GitHub's CodeQL default setup is one toggle on a public repo and
  costs nothing. Do not add a coverage threshold — it would degrade this suite, not
  improve it.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### CI-18 — The gate job's own comment describes a job that no longer exists

- **Category:** Documentation drift
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `.github/workflows/ci.yml:1138-1139`
- **Evidence:**
  ```yaml
  # ci.yml:1138-1139
  # security-invariant-report is deliberately absent from `needs` — it is
  # still report-only, with written promotion criteria (ITEM-0043).
  ```
  Sixty lines earlier the same file says:
  ```yaml
  # ci.yml:927
  # security-invariant-report was PROMOTED on 2026-08-17 and no longer exists.
  ```
  A reader auditing `needs` for completeness is told a job is deliberately excluded
  when in fact every job in the file is included. Given that this repository's whole
  method is "the comment is the reasoning", a comment that contradicts itself in one
  file is worth a line.
- **Remediation:** delete the stale sentence.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

## Healthy — verified good

- **Zero fail-open jobs.** `grep -rn "continue-on-error" .github/workflows/` returns
  only historical comments. Every one of the 15 jobs in `ci.yml` is in the
  `CI required gate`'s `needs` list.
- **The gate rejects `skipped` as firmly as `failure`** — `ci.yml:1196-1199`,
  `if [ "$r" != "success" ]; then ... exit 1`.
- **The exact-SHA evidence-reuse mechanism is sound.** `scripts/ci-evidence.mjs`
  evaluates *each required job's own conclusion* on the SHA, not the run envelope,
  so reuse cannot chain off a run that itself only reused (`:265-270`). The workflow
  file is part of the SHA, so a matching SHA cannot have been validated by a
  different pipeline. Measured effect: a develop re-run drops from 13.0 min to
  0.3 min.
- **`main` is properly locked.** Live API: PR required, `CI required gate` required,
  `strict: true` (branch must be up to date), `enforce_admins: true`,
  `allow_force_pushes: false`, `allow_deletions: false`,
  `required_conversation_resolution: true`.
- **Three jobs run against a real PostgreSQL 16** — `database-migration`,
  `database-e2e-report`, `browser-e2e` — each with its own ephemeral service
  container and a distinct database name, and each preceded by
  `scripts/assert-test-database.mjs`, which is allowlist-shaped and fails closed on
  an unrecognised host.
- **The migration gate applies the whole committed history to an empty database**
  (`scripts/verify-database.mjs`), then `migrate status`, then `seed:config` and
  `seed:verify` — the only way to test the history rather than a developer's
  already-migrated database. `prisma validate` runs in `typecheck` (`ci.yml:239`).
- **Schema/migration drift is a real gate.**
  `services/api/src/common/prisma/schema-unique-drift.spec.ts` (23 tests) parses
  both `schema.prisma` and the whole migration chain — following renames, drops and
  commented-out DDL — and asserts the set of unenforced `@@unique` declarations is
  exactly the seven recorded. It runs in the required `test-api` job.
- **Dependency scanning is blocking, and thoughtfully scoped.**
  `npm run check:production-advisories` (`scripts/check-production-advisories.mjs`)
  runs in the required `test-runtime` job: zero criticals allowed unconditionally,
  every surviving advisory needing a written disposition naming a record. Its
  header documents why blanket-zero was rejected. `check:overrides-applied` proves
  declared npm overrides actually took effect — the failure mode where a security
  fix silently does not happen.
- **The lockfile is proven regenerable, not merely present** (`ci.yml:174-197`) —
  a from-scratch `npm install --package-lock-only` in a temp dir containing only the
  manifests. `npm ci` cannot answer this question.
- **`next.config` suppression is absent, and cleanly so.**
  `rg 'ignoreBuildErrors|ignoreDuringBuilds'` across the repo returns **no matches**.
  All three real Next apps will fail `next build` on a type or lint error, and all
  three set `strict: true`.
- **`@ts-ignore` and `@ts-expect-error` counts are zero** across every tracked
  source file. The only occurrence in the tree is the AGENTS.md rule forbidding
  them. Genuine `any` usages number **15, in 6 files**, four of which are specs.
  35 `eslint-disable` comments repo-wide, every one rule-scoped — no file-wide
  bare disables.
- **CI never mutates the checkout, and proves it.** `ci.yml:290-298` runs
  `git status --porcelain` after linting and fails if anything changed — defence in
  depth against `services/api`'s `eslint --fix` script leaking into CI.
- **The lint ceiling is an enforced ratchet, not a target** —
  `npx eslint "{src,test}/**/*.ts" --max-warnings=789` against 784 actual, with the
  history of every reduction recorded above it and an explicit "when this fails, the
  fix is to reduce warnings, not to raise the number."
- **The test corpus is honest by every measure I could apply.** 513 test files,
  4,414 `it`/`test` blocks, 8,556 assertions — a ratio of **1.94 assertions per
  test**. And:
  - `expect(true)` — **0 occurrences**
  - `expect(1).toBe(1)` — **0**
  - `toMatchSnapshot` — **0**
  - `expect.any(` — **0**
  - files with tests but zero assertions — **0**
  - weak assertions (`toBeDefined`/`toBeTruthy`) — 87, **1.0%** of all assertions
- **Quarantine is explicit and named.** 4 `test.fixme` blocks, each carrying the
  bug id in the test itself (e.g. BUG-0019 in flow-b). No `.only`, no `xit`, no
  `fdescribe` anywhere. Playwright `retries: 1` in CI only, with the reasoning
  written out and "a test that only passes on retry must be investigated, not
  tolerated". Jest configures no retries at all.
- **`wiring-invariants.spec.ts` (543 lines) is a strong structural gate** — it walks
  every discovered handler using `getAllAndOverride` *exactly as `PermissionsGuard`
  does*, requires both permission families on every guarded non-`@Public` route, and
  forces every route not behind `PermissionsGuard` onto a reviewed allowlist of 20
  controllers and 4 alternative guards. It proves declaration, not enforcement — but
  it is the reason the dual-permission baseline went from 796 violations to 0 and
  stayed there.
- **`attendance-integrations-isolation.e2e-spec.ts` is a model for how to prove
  tenant isolation** — 34 ID-guessing tests through the real services against a real
  database, covering read, update, activate, attach, scope, map, retry, cancel,
  rotate and ingest. If it were copied to five more modules, CI-04 would close.
- **The deployed commit is now verifiable.** `/api` returns
  `{"commit":"890cd96ded0ecbc77870c5841500d67eafa93aaf","commitShort":"890cd96"}`,
  resolved from `RENDER_GIT_COMMIT` / `VERCEL_GIT_COMMIT_SHA` / `GIT_COMMIT_SHA`
  (`services/api/src/config/env.validation.ts:194-238`). I confirmed it equals
  `origin/main`'s tip. ITEM-0010 is closed, and the comment explaining why git HEAD
  is *not* read is correct.
- **`preDeployCommand` is present on the live service** (`npm --workspace api run
  release`), so migrations and seeds do apply on deploy — the condition BUG-0767
  recorded is fixed.
- **The rollback runbook is genuinely good** —
  `docs/deployment/rollback-runbook.md` classifies changes into seven rollback
  classes and states plainly that redeploying an older SHA does not roll the schema
  back. It is manual, but it is correct.
- **~30 bespoke invariant checks run in the required `test-runtime` job**, each
  citing the bug that motivated it: `check:proxies-forward-refusals` (BUG-0039 — two
  proxies turned a 403 into a 200 carrying another employee's payslips),
  `check:proxies-decide-nothing` (BUG-0041), `check:proxy-forwards-client-ip`
  (BUG-0032), `check:env-registered` (BUG-0042), `check:dialogs-contained`
  (BUG-0043), `test:database-urls` (BUG-0086), `test:security-headers` (BUG-0040).
  This is a stronger and more targeted mechanism than generic SAST would be.
- **Framework governance gates are in the required `validate` job** — 15 steps
  including `validate-framework.mjs`, the component index, and `--check` runs of
  `rebuild-backlog`, `rebuild-tasks`, `rebuild-sessions`, `rebuild-qa`,
  `generate-dashboards`, `generate-data-model`, `generate-screen-map`,
  `generate-record-graph`. Each is its own step so a red build names the system that
  drifted. Not in CI: `remediation:check`, `wp:check`, `questions:check`,
  `test:db-preflight`.

## Not examined / limits

- **I could not read the values of the 85 production env vars** on the Render
  service — the key names came back but the tool call reading values was blocked by
  the permission classifier. So `EXPOSE_AUTH_DEBUG_ERRORS` and `EXPOSE_DEV_AUTH_LINKS`
  are *present* on the production service; whether they are set to `true` I did not
  determine. **This should be checked by the security specialist** — an enabled auth
  debug flag in production would be a HIGH finding.
- **Vercel was not examined.** `VERCEL_TOKEN` is available and the three frontends
  deploy there via a GitHub integration, but I ran out of scope before querying it.
  Whether `apps/web`, `apps/admin` and `apps/landing` auto-deploy on push, from which
  branch, and whether those deploys are gated on CI is **unknown and matters** — the
  same CI-01 question applies to them and I could not answer it. `render.yaml` is the
  only committed deployment configuration; there is no `vercel.json`.
- **I did not read a CI job log.** `gh api .../jobs/<id>/logs` returned empty (it
  serves a redirect this environment did not follow), so I could not confirm the
  *observed* skip counts in the last `browser-e2e` run. CI-02 and CI-03 are proven
  from the workflow env block and the test source, which is sufficient, but a log
  line reading "10 skipped" would have been better.
- **I did not run the test suites, `npm run build`, eslint, or `tsc`.** Per the
  briefing. So the `--max-warnings=789` ratchet's accuracy at this commit is
  unverified, and I take the pipeline's own green runs as evidence that it holds.
- **The .NET gateway** (`gateway/DijiPeople.Gateway.sln`) and `tools/zkteco-poc`
  are never built or tested in CI. This is KNOWN and documented as a deliberate
  deferral in `docs/development/ci.md:268-273`, so I have not raised it as a
  separate finding, but a shipped on-premise component with zero automated
  validation belongs in the consolidated register.
- **Test *quality* was sampled, not exhaustively reviewed.** The honesty metrics
  (assertion ratios, `expect(true)`, snapshots, zero-assertion files) are complete
  counts over the whole corpus. The flow-by-flow verdicts in CI-15 come from reading
  the most relevant files per flow, not all 513.

## Routed to other specialists

- **No persistent disk and `FILE_STORAGE_DIR` unset on the live Render service**
  (evidence in CI-09) — uploaded tenant documents, branding assets and published
  installers are written to a filesystem every deploy destroys. That is a data-loss
  path for the **storage/data** specialist, not a CI finding.
- **`EXPOSE_AUTH_DEBUG_ERRORS` and `EXPOSE_DEV_AUTH_LINKS` are set on the production
  service** — values unread. For the **security** specialist.
- **The repository is public** (CI-06) — I have covered the CI-control consequences
  (secret scanning, artifact visibility). Whether public visibility is itself
  intended is an owner decision for the **security** specialist.
- **`hasElevatedTenantRole` bypasses `PermissionsGuard` entirely**, and
  `wiring-invariants.spec.ts` exempts 20 controllers onto a service-layer-authorizes
  allowlist (`DataController`, `MetadataController`, `TenantControlPlaneController`,
  `PlatformRuntimeController` among them) with nothing verifying that promise. For
  the **AuthZ** specialist.
- **`services/api/src/common/prisma/prisma.service.ts:33` — `(this as any).$use`**
  is inert on `@prisma/client@7.8.0`, and it scopes by business unit rather than
  tenant in any case. For the **tenant isolation** specialist.
