# Testing Architecture

> **Last verified:** 2026-08-16
> **Verified against commit:** 78072d2
> **Key source files:** .github/workflows/ci.yml, services/api/package.json, services/api/tsconfig.json, services/api/tsconfig.build.json, services/api/test/jest-e2e.json, services/api/src/common/constants/wiring-invariants.spec.ts, apps/web/jest.config.js, apps/admin/jest.config.js, apps/landing/jest.config.js, e2e/package.json, e2e/playwright.config.ts, package.json, turbo.json, packages/config/platform-runtime-schema.test.js
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

**CI exists** at `.github/workflows/ci.yml`: **ten** required jobs aggregated
into a single `CI required gate` check, plus **four** non-gating report-only
jobs. See [`../../docs/development/ci.md`](../../docs/development/ci.md).

The ten, from the gate's own `needs` list: `validate`, `typecheck`, `lint`,
`test-api`, `test-web`, `test-admin`, `test-landing`, `test-runtime`,
`database-migration`, `build`. The four report-only: `database-e2e-report`,
`lint-api-report`, `security-invariant-report`, `browser-e2e-report`.

Two consequences, both load-bearing:

- **CI runs on push, not on your machine.** Nothing runs these commands locally
  for you. A check you skip locally is not run until you push.
- **A local pass is not a CI pass.** CI uses a different Node build, filesystem
  and cache. Where CI is available its verdict is what gates a merge, and
  `ASSUMED_PASS` is not a permitted value — see
  [`task-completion-contract.md`](task-completion-contract.md).

### Test types, and what actually exists

| Type | Tooling | Status |
|---|---|---|
| `UNIT` | jest (api, web, admin, **landing**) | **Available** |
| `INTEGRATION` | jest + a real database | **Available in CI** — ephemeral `postgres:16-alpine` service container |
| `API` | supertest; `*.e2e-spec.ts` under `services/api/test/` | **Available in CI**, report-only (`database-e2e-report`). List the directory — the set changes |
| `BROWSER_E2E` | **Playwright, in the `e2e` workspace** | **Installed** — `@playwright/test`, two journey specs; runs in CI as `browser-e2e-report`, **report-only, not a gate** |
| `MANUAL_VISUAL` | a human | Available |
| `DEPLOYMENT_SMOKE` | `scripts/smoke-deployment.mjs`, `docs/deployment/smoke-tests.md` | Available against a reachable environment |

> The `BROWSER_E2E` row previously read "**Not installed** — no Playwright,
> Cypress or Puppeteer in any workspace", and the paragraph below it said the
> same. Both became false when the `e2e` workspace landed and closed
> [[ITEM-0001]]. Corrected 2026-08-16 at `78072d2` — see
> [[BUG-0037-integration-patterns-context-denies-four-subsystems-that-exi]].

Verified at `78072d2`: web, admin and landing jest all run in a **node**
environment with no jsdom, so component *rendering* still cannot be unit-tested.
Extract the logic and test that; use the `e2e` workspace when the thing under
test genuinely needs a browser.

### Isolated test databases

Integration, e2e and migration tests must **never** depend on the production
database. Preference order:

1. **Ephemeral PostgreSQL container** — created per run, destroyed after
2. **Dedicated CI test database** — isolated and resettable
3. **Isolated Neon branch or database** — the managed provider already in use
4. **Local isolated database** — a developer's own, not shared

**Never** the production database, and never a shared staging database for
anything destructive. A read-only, explicitly non-destructive check against
shared staging is the only exception, and must be labelled as one.

**CI now provides an ephemeral PostgreSQL.** Two jobs run a
`postgres:16-alpine` service container, created fresh for the job and destroyed
with the runner — nothing persists, so no cleanup step can be forgotten:

| Job | Database | Gating |
|---|---|---|
| `database-migration` | `dijipeople_test` | **Required** — inside `ci-required` |
| `database-e2e-report` | `dijipeople_e2e_test` | Report-only, with written promotion criteria |

`database-migration` runs `node scripts/verify-database.mjs`: assert the target
is disposable → `prisma generate` → **`prisma migrate deploy`** → `migrate
status` → `seed:config` → `seed:verify`.

**`prisma migrate dev` is never used in CI.** It is interactive, can author new
migrations, and can reset the database — none of which belong in a verification
of the committed history.

Service containers are **per job**, so the two databases cannot collide and
concurrent runs never share state. They are named differently regardless, so a
future change that did share one service would be obvious rather than silent.

Jobs outside those two still set `DATABASE_URL` to a placeholder they never
connect to: Prisma requires the variable for `generate` and `validate`, and
neither dials out.

`scripts/assert-test-database.mjs` runs before anything destructive and refuses
any target that is not demonstrably disposable. It is allowlist-shaped — an
unrecognised host fails closed — and rejects managed providers, production-ish
database names, and names carrying no test marker. It never prints the
connection string.

**Do not assume whether a local database exists — check.** This paragraph used
to assert flatly that there was none on this workstation. A local PostgreSQL was
in fact present, and both the commercial-onboarding E2E and the provisioning
recovery suite have since run against it. The claim is a property of a machine,
not of the repository, so establish it per machine: probe `DATABASE_URL`, and
create a **disposable** database rather than borrowing a developer's working one
— `scripts/assert-test-database.mjs` exists to refuse the latter. Note that
`psql` may be absent even where the server is running; `pg` is a dependency
already installed and connects fine.

CI remains the authoritative database environment, and developer laptops are not
required to run PostgreSQL. See
[`../../docs/development/agent-tooling-matrix.md`](../../docs/development/agent-tooling-matrix.md).

When no isolated database is reachable, record
`DB_E2E = BLOCKED_INFRASTRUCTURE` and state which scenarios that leaves
unproven. It is not a pass. Do not make database e2e mandatory before the
infrastructure exists.

### API unit tests

Jest config lives **inline in `services/api/package.json`** under the `"jest"`
key — there is no `jest.config.js` for the API. Verified contents:

```json
"rootDir": "src",
"testRegex": ".*\\.spec\\.ts$",
"testEnvironment": "node",
"transform": { "^.+\\.(t|j)s$": "ts-jest" },
"transformIgnorePatterns": ["/node_modules/(?!(htmlparser2|domelementtype|domhandler|domutils|dom-serializer|entities)/)"],
"coverageDirectory": "../coverage"
```

Only `src/**` is discovered; `services/api/test/` is invisible to
`npm --workspace api run test`. **112 `*.spec.ts` files** live under
`services/api/src`, colocated next to the code they cover.

### API e2e tests

`services/api/test/` contains **13 `*.e2e-spec.ts` suites**, plus
`sanitize-html.e2e-mock.ts` (a module mock, not a test) and `jest-e2e.json`
(`rootDir: "."`, `testRegex: ".e2e-spec.ts$"`, `testEnvironment: "node"`, ts-jest
with **`diagnostics: false`**, `moduleNameMapper` remapping `sanitize-html` to
the local mock).

Run with `npm --workspace api run test:e2e`. These boot the Nest application and
**may require a live database** (`DATABASE_URL`) — `validateDeploymentEnv`
demands it and Prisma connects on module init. Do not assume they pass in a bare
checkout.

**List the directory rather than trusting any list of it, including this one.**
The set changes with in-flight work, and this paragraph previously asserted that
`test/permission-propagation.e2e-spec.ts` and
`test/attendance-integrations-isolation.e2e-spec.ts` — both referenced by root
`AGENTS.md` — did not exist. Both do, and had for some time; nothing failed when
the claim went stale, which is exactly why it survived. See
[`../../docs/bugs/BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist.md`](../../docs/bugs/BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist.md)
and the bug pattern `doc-code-drift`.

### The typecheck blind spot (highest-value fact in this document)

`services/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "incremental": false },
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"]
}
```

`npm --workspace api run check-types` is `tsc --noEmit -p tsconfig.build.json`,
so it **does not typecheck any `*.spec.ts` file and does not typecheck
`services/api/test/` at all.** A spec can be broken TypeScript and
`check-types` stays green. The only way to typecheck specs is to run them
(ts-jest compiles them) or `tsc -p tsconfig.json` (the base config includes
`src/**/*.ts`, `test/**/*.ts`, `prisma/**/*.ts`, `prisma.config.ts`).

`tsconfig.json` also sets `noImplicitAny: false`, `strictBindCallApply: false`,
`noFallthroughCasesInSwitch: false` — only `strictNullChecks` is on. The API is
**not** in full `strict` mode.

### Frontend tests

`apps/web/jest.config.js` and `apps/admin/jest.config.js` both use
`testEnvironment: "node"`, `testMatch: ["<rootDir>/**/*.spec.ts"]` (`.ts` only —
`.spec.tsx` is not matched), `moduleNameMapper` `^@/(.*)$ → <rootDir>/$1`, and
ignore `/node_modules/` and `/.next/`. Their ts-jest `tsconfig` block is inline
and sets `strict: true` — stricter than the API.

The header comments carry the design rationale:

- **web**: "This app had no test coverage at all… Typecheck does not catch a
  fallback that can never be reached, a merge that drops a property, or a rule
  that quietly matches nobody — all of which have happened here. Scoped
  deliberately to pure logic: resolvers, merges, catalogs. **Rendering tests
  would need jsdom and a testing library, which are not installed**."
- **admin**: "role handling here is enforced by string comparisons that nothing
  type-checks: `role !== "SUPER_ADMIN"` compiles perfectly and silently locks out
  PLATFORM_OWNER, which is what happened across five call sites. Scoped to pure
  logic — RBAC helpers and the module registry. **Rendering tests would need
  jsdom, which is not installed**."

**Component render tests are impossible in all three apps.** jsdom and
`@testing-library/*` are absent from every frontend `package.json`. Do not write
one without adding the dependencies as an explicit decision.

**Frontend spec count at `78072d2`: 28 — web 17, admin 9, landing 2.** Do not
copy that number forward; count them. A previous version of this file said "9
total" and named them individually, which stayed accurate for exactly as long as
nobody added a spec.

Per app:

- **`apps/landing` has a jest config and a `test` script** — `jest.config.js`,
  `lib/plan-presentation.spec.ts`, `lib/subscribe-selection.spec.ts`, gated by
  the required `test-landing` CI job. This file previously said it had neither;
  so did `frontend-architecture.md`, `docs/architecture/frontend.md` and
  `apps/landing/AGENTS.md`. **Four documents agreed with each other and all four
  were wrong** — which is the most dangerous shape of drift, because consensus
  reads as confirmation. Corrected 2026-08-16.
- **`apps/docs`** has no test script and nothing to test — a stock starter. See
  [[docs-application]].
- **`apps/agent-desktop`** has no test script and no tests, and neither does the
  `agent` API module that serves it. That gap is tracked as [[ITEM-0028]] and is
  how [[BUG-0035-desktop-agent-logout-never-revokes-the-refresh-token]] survived.

### packages/config

Plain Node test files run via `node --test`, not jest:
`platform-runtime-schema.test.js`, `platform-runtime-views.test.js`,
`system-widget-registry.test.js`, `widget-runtime-contract.test.js`.
Root exposes only one of them: `npm run test:runtime-schema` →
`node --test packages/config/platform-runtime-schema.test.js`. The other three
must be invoked directly with `node --test <path>`.

### Wiring invariants — `services/api/src/common/constants/wiring-invariants.spec.ts`

Its own comment: *"These do not test a feature. They test that the parts are
wired to each other, which is where most defects in this codebase have actually
lived."* Five invariants across two `describe` blocks:

1. **Every permission an endpoint requires is held by at least one role.** Walks
   every `*.controller.ts` under `src`, regexes `@Permissions(...)` keys, diffs
   against the union of `SYSTEM_ROLE_MISC_PERMISSIONS`,
   `BASE_ROLE_PERMISSION_KEYS` and non-`NONE` `SYSTEM_ROLE_PRIVILEGES` entries.
   An `ADMIN_ONLY_PERMISSIONS` allowlist (~28 keys incl. `payroll.finalize`,
   `audit.read`, `recruitment.delete`) exempts the administrator-bypass routes.
2. **Every permission a role is granted is a defined permission.** Parses
   `permissions.ts` source text (keys are declared in several places) plus
   `PERMISSION_KEYS` / `MISC_PERMISSION_KEYS`.
3. **Every settings menu item resolves to a route and an adapter.** Reads
   `apps/web/.../settings-navigation.ts`, `settings-adapter-registry.ts` and
   `settings-runtime.ts` **across the workspace boundary** (`REPO_ROOT =
   resolve(process.cwd(), '..', '..')`). Asserts >20 items.
4. **Every filter condition the table offers is accepted by a module API.**
   Reads `apps/web/app/components/data-table/types.ts` and checks the eight text
   operators against `employees/dto/employee-query.dto.ts`.
5. **The dual-permission invariant** (separate `describe`, 600 s timeout).
   Dynamically imports every controller, walks the prototype chain, and reads
   `GUARDS_METADATA` / `PATH_METADATA` / `METHOD_METADATA` via the same
   `Reflector` and `getAllAndOverride` order `PermissionsGuard` uses —
   deliberately not regex, which is fooled by commented-out decorators and by the
   aliases (`@RequirePermissions` is `@Permissions`; `@RequireAnyPermission`
   writes the same key as `@RequirePermission`). Asserts >500 handlers
   discovered. For each non-`@Public()` handler **actually behind
   `PermissionsGuard` (identity comparison, never name — `PlatformPermissionsGuard`
   shares the suffix but is an unrelated system)** it requires a non-empty
   `@Permissions` array **and** a non-empty `@RequirePermission` array. Rationale
   from the file: the guard treats an *absent* family as satisfied, so a
   one-family handler is authorized on one axis silently; and the matrix axis
   carries the `SecurityAccessLevel` that `resolveEffectiveAccessLevel()` /
   `buildScopedAccessWhere()` consume. Violations print as a full inventory
   before the assertion because jest truncates long diffs.

Related invariant specs in the same directory: `rbac-matrix.spec.ts`,
`rbac-matrix.benefits.spec.ts`, `rbac-matrix.claims.spec.ts`,
`rbac-matrix.loans.spec.ts`, `rbac-matrix.manager-customizer.spec.ts`,
`rbac-matrix.payroll-operations.spec.ts`.

### The lint hazard

```
services/api/package.json → "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
```

`npm --workspace api run lint` **rewrites files in place across all of `src`**,
not just what you changed. In a dirty working tree (which this repo usually has)
that produces a diff touching files you never opened, violating the "do not
reformat files you are not otherwise changing" rule. **Scope lint to changed
paths instead** (e.g. `npx --workspace api eslint services/api/src/modules/<domain> --fix`).
`apps/web` and `apps/admin` use bare `"lint": "eslint"` (no `--fix`), so those
are safe to run whole.

### Real commands (verified from package.json files)

```bash
# root: lint | typecheck (== check-types) | build (turbo, --concurrency=1)
#       test:runtime-schema | smoke:deployment | generate:runtime-schema
#       prisma:validate|generate|migrate:status|seed
#       seed:config|verify|admin|demo|demo:reset|demo:reseed|all|payroll-flow|platform-workflows|system
#       release:api|web|admin
npm --workspace api run test        # jest, inline config, src only
npm --workspace api run test:watch | test:cov | test:debug
npm --workspace api run test:e2e    # jest --config ./test/jest-e2e.json
npm --workspace api run check-types # tsc --noEmit -p tsconfig.build.json  (SKIPS specs)
npm --workspace api run lint        # eslint --fix across all of src — see hazard
npm --workspace api run format | build | start:dev | start:prod | free:port
npm --workspace web   run test | test:watch | check-types | lint | build | dev | start | release
npm --workspace admin run test | check-types | lint | build | dev | start | release
#   admin has no test:watch; web/admin check-types is `next typegen && tsc --noEmit`
```

`apps/landing`: `dev`, `build`, `check-types`, `start`, `lint`, **`test`** — no
`release`, unlike web and admin.

`gateway:build`, `gateway:test` and `gateway:package` **do exist** in the root
`package.json`, alongside `zkteco:*`, `release:app`, `test:browser` and
`test:release-cli`. This paragraph previously denied the first two.

## Key abstractions

- **Colocated unit specs** beside the service under test — the dominant pattern
  (112 files). Follow `attendance.service.spec.ts`,
  `payroll-operations.service.spec.ts`, `webhook.service.spec.ts`,
  `secret-encryption.service.spec.ts`, `jwt-auth.guard.spec.ts`.
- **Invariant specs** that read source files or Nest metadata rather than
  exercising behaviour — `wiring-invariants.spec.ts`, `rbac-matrix.*.spec.ts`.
- **Pure-logic frontend specs** — resolvers, catalogs, merges, RBAC string
  helpers. No rendering, by design.

## Known exceptions

- `test:e2e` uses `diagnostics: false`, so e2e specs are not type-checked either.
- The web/admin jest `tsconfig` overrides are inline and use `strict: true`,
  stricter than each app's own `tsconfig.json`; a spec can fail to compile under
  jest while `check-types` passes.
- `turbo.json` defines only `build`, `lint`, `check-types` and `dev` — **there is
  no turbo `test` task.** Tests must be invoked per workspace.
- Invariant 3 reads `apps/web` files from the API workspace; renaming those
  settings files breaks an API test.

## Anti-patterns to avoid

- Reporting "typecheck passes" as evidence a spec compiles. It does not compile
  specs.
- Running `npm --workspace api run lint` in a dirty tree.
- Writing `*.spec.tsx` in web/admin — `testMatch` will not pick it up.
- Writing a component render test in web/admin — jsdom is not installed.
- Adding a spec under `services/api/test/` and expecting `run test` to find it.
- Adding a permission key without updating role grants — invariant 1 fails.
- Adding a controller handler with only one permission decorator family —
  invariant 5 fails and the endpoint is silently half-authorized in production.
- Claiming a suite passed without naming the command and its outcome.

## TARGET (required going forward)

1. New backend business logic ships with a colocated `*.spec.ts` under
   `services/api/src`.
2. Because `check-types` skips specs, **run `npm --workspace api run test` (or the
   affected spec) whenever you touch a spec** — it is the only compile check
   those files get.
3. Changes to permissions, tenant scoping, settings navigation, data-table
   operators or cross-module wiring run
   `npm --workspace api run test -- wiring-invariants` plus the relevant
   `rbac-matrix.*` specs.
4. Frontend logic changes get a pure-logic spec in the owning app.
5. Lint is scoped to changed paths, never the whole workspace.
6. Every completion report names which commands ran, passed, failed, or were
   skipped and why; pre-existing failures are labelled as such with evidence.

## What the specialist agent MUST verify before changing this

- Re-read `services/api/tsconfig.build.json` before asserting anything about
  typecheck coverage — the `exclude` array is the whole story.
- Re-read the header comments in `apps/web/jest.config.js` and
  `apps/admin/jest.config.js`; they encode why the scope is narrow.
- Check both apps' `devDependencies` for `jest-environment-jsdom` before
  proposing any render test.
- Run `git ls-files "services/api/src/**/*.spec.ts" | wc -l` before quoting
  counts, and confirm `DATABASE_URL` before promising `test:e2e`.
- Confirm no `.github/` directory has appeared before assuming CI coverage.
