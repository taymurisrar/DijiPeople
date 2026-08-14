# AGENTS.md — DijiPeople Engineering Instructions

This is the primary instruction file for AI coding agents working in this
repository. It describes **the repository as it actually is**, not a generic
best-practice template. Where a rule is a convention rather than an enforced
mechanism, this file says so explicitly, because the difference is where
regressions come from.

Nested `AGENTS.md` files add scope-specific rules and take precedence within
their directory:

- [`services/api/AGENTS.md`](services/api/AGENTS.md) — NestJS backend
- [`services/api/prisma/AGENTS.md`](services/api/prisma/AGENTS.md) — schema, migrations, seeds
- [`apps/web/AGENTS.md`](apps/web/AGENTS.md) — tenant product frontend
- [`apps/admin/AGENTS.md`](apps/admin/AGENTS.md) — platform admin frontend
- [`apps/landing/AGENTS.md`](apps/landing/AGENTS.md) — public site
- [`packages/config/AGENTS.md`](packages/config/AGENTS.md) — shared runtime config

Planning rules live in [`PLANS.md`](PLANS.md). Agent role definitions live in
[`.agent/agents/`](.agent/agents/). Documentation conventions live in
[`docs/README.md`](docs/README.md).

---

## Product Context

DijiPeople is a **multi-tenant SaaS HRM and business platform**. One codebase,
one database, many tenants. It is built as a configurable product, never as a
per-client custom build.

Three authenticated surfaces plus one public one:

- **Tenant product** (`apps/web`) — employees, managers, HR, payroll, admins of a tenant
- **Platform admin** (`apps/admin`) — DijiPeople's own SaaS operations across all tenants
- **Agent desktop** (`apps/agent-desktop`) — Electron attendance agent, own auth client
- **Landing** (`apps/landing`) — marketing, lead capture, partner enquiry, plan browsing

### Domains actually implemented

**60 modules** under `services/api/src/modules/`, as committed at this baseline.

| Area | Modules |
|---|---|
| People | `employees`, `employee-levels`, `employment-types`, `users`, `teams`, `organization` |
| Time | `attendance`, `timesheets`, `leave` |
| Pay | `payroll`, `payslips`, `pay-components`, `compensation`, `tax-rules`, `loans`, `claims`, `benefits`, `business-trips`, `time-payroll` |
| Talent | `recruitment`, `onboarding`, `projects`, `documents`, `policies` |
| Governance | `approvals`, `workflows`, `sla`, `audit`, `error-logs`, `permissions`, `roles` |
| Commercial | `leads`, `partners`, `partner-experience`, `contracts`, `support-cases`, `billing`, `super-admin` (customers, plans, subscriptions, invoices, payments, tenant provisioning) |
| Configuration | `tenant-settings`, `settings-runtime`, `customization`, `lookups`, `views`, `navigation`, `data`, `platform-runtime` |
| Platform ops | `platform-auth`, `platform-users`, `platform-events`, `platform-monitoring`, `platform-communications`, `tenants`, `demo-data`, `data-management`, `agent`, `dashboard`, `inbox`, `reports` |

> **Work in flight, not in this branch.** At the time this baseline was written
> the primary checkout also contained substantial **uncommitted** work that is
> *not* part of any commit: the `attendance-engine`, `attendance-integrations`
> and `app-releases` API modules, a **.NET on-premise integration gateway** in
> `gateway/`, a ZKTeco device proof-of-concept in `tools/`, and a larger
> `schema.prisma`.
>
> Do not assume those exist. Check the branch you are on. If you are working in
> a worktree cut from this baseline, they are absent — and an instruction file
> that claimed otherwise is exactly the failure mode this framework exists to
> prevent.

---

## Repository Layout

```
apps/
  landing/        Next.js App Router — port 3000 — public site
  web/            Next.js App Router — port 3001 — tenant product
  admin/          Next.js App Router — port 3002 — platform admin
  docs/           Next.js starter — port 3003 — effectively unused
  agent-desktop/  Electron attendance agent
services/
  api/            NestJS 11 — port 4000 — global prefix /api
packages/
  config/         @repo/config — plain JS, no build step
  ui/             @repo/ui — button/card/code only; NOT the design system
  eslint-config/  shared ESLint config
  typescript-config/ shared tsconfig bases
gateway/          .NET solution — NOT COMMITTED at this baseline
tools/            device POC — NOT COMMITTED at this baseline
scripts/          repo-level node scripts (ports, smoke tests, codegen)
docs/             repository documentation (see docs/README.md)
```

**`packages/database`, `packages/types` and `packages/utils` are empty
directories.** They are not npm workspaces and contain no code. Do not import
from them, do not document them as existing, and do not create them without an
explicit decision recorded as an ADR. Shared backend code lives in
`services/api/src/common/`; shared frontend code lives in each app's `lib/` and
`app/components/`.

Node `22.x`, npm `11.x`, npm workspaces + Turborepo.

---

## Architecture Principles

1. **Preserve tenant isolation.** It is the single most important invariant in
   this codebase and it is enforced by convention, not by the database. See
   [Tenant Isolation](#tenant-isolation).
2. **Extend the existing architecture; never build a competing one.** This
   repository already has a metadata-driven module runtime, a settings runtime,
   a permission matrix, an error catalog, an audit service and a notification
   orchestrator. If a capability is missing, extend the existing mechanism.
3. **Reuse existing domain services.** Before writing employee, attendance,
   payroll or settings logic, read the existing service. Cross-module needs are
   satisfied by injecting the owning module's service, not by re-querying its
   tables.
4. **No duplicate sources of truth.** Permission keys, entity keys, settings
   catalogs, module registries and view definitions each have exactly one home.
   Adding a second one is a regression even if it compiles.
5. **Preserve backward compatibility** unless the requirement explicitly changes
   it. API response shapes, permission keys, enum values and settings keys are
   consumed by three frontends, an Electron agent and a .NET gateway.
6. **Inspect before abstracting.** Read the existing implementation first. This
   codebase favours explicit, business-named code over premature abstraction.
7. **Modular monolith.** Keep modules cohesive. Do not introduce microservice
   boundaries, message brokers or separate deployables.
8. **Configuration over hardcoding.** Tenant-specific behaviour belongs in
   `tenant-settings` / `settings-runtime` / `customization`, never in code
   branches keyed on a tenant name or id.

---

## Tenant Isolation

### How it actually works

1. The JWT carries `tenantId`. `JwtAuthGuard`
   (`services/api/src/common/guards/jwt-auth.guard.ts`) verifies the token with a
   **per-client secret** (`web`, `admin`, `agent-desktop`), checks the token's
   `appClientId`/`aud` matches the requesting client, confirms the session row is
   still live, then calls `AuthAccessService.loadAccessContext(sub, tenantId)`.
2. That produces `request.user: AuthenticatedUser`
   (`common/interfaces/authenticated-request.interface.ts`) containing
   `userId`, `tenantId`, `roleIds`, `roleKeys`, `permissionKeys`,
   `rolePrivileges`, `accessContext` (business units, org, teams) and, for
   platform admins, `platform`.
3. **Services then pass `user.tenantId` into every Prisma `where` clause by
   hand.** e.g. `EmployeesService.findByTenant()` reads
   `const tenantId = currentUser.tenantId` and forwards it to the repository.

### What does NOT exist

- **No PostgreSQL row-level security.**
- **No global tenant Prisma middleware.** `PrismaService` registers a `$use`
  middleware, but that middleware scopes by **business unit**, not tenant — and
  on the installed `@prisma/client@7.8.0` `$use` is unavailable, so it is
  effectively inert. Never treat it as a safety net.
- No automatic tenant filter in the generic entity data API. `modules/data/`
  resolves scope explicitly through `entity-scope.resolver.ts`.

### Rules

- Every query against a tenant-owned model **must** filter on `tenantId`, taken
  from `request.user.tenantId`. Never from a request body, query string, path
  param or header.
- Never accept `tenantId` as client input on an authenticated endpoint.
- `findUnique` by id alone is unsafe on tenant-owned models. Use `findFirst`
  with `{ id, tenantId }`, or re-verify `record.tenantId === user.tenantId`
  before returning or mutating.
- Update and delete must be tenant-scoped too: `updateMany`/`deleteMany` with
  `{ id, tenantId }`, or a read-then-verify-then-write inside a transaction.
- Cross-tenant reads are only legitimate on the **platform** path
  (`authSubjectType: 'platform-user'`, `user.platform` present). Those endpoints
  live in `super-admin`, `platform-*` and `tenants` modules and must be
  explicitly platform-guarded. Never widen a tenant endpoint to serve platform
  needs.
- Audit rows use `tenantId: 'platform'` to route to `PlatformAuditLog`. That is
  the only string sentinel; do not invent others.
- Background jobs, queue processors and seeds carry no request context — they
  must take `tenantId` as an explicit argument and thread it through.
- When adding a tenant-owned model, add `tenantId`, the `tenant` relation, and
  at minimum `@@index([tenantId])`. Composite uniqueness must include
  `tenantId` (e.g. `@@unique([tenantId, employeeCode])`), never bare uniqueness
  on a business key.

---

## Database / Prisma

Prisma **7.8** with `@prisma/adapter-pg` against PostgreSQL. Single schema file:
`services/api/prisma/schema.prisma` — **10,436 lines, 266 models, 222 enums**,
with **183** migrations in `services/api/prisma/migrations/`. Prisma is configured
by `services/api/prisma.config.ts` — every Prisma CLI call in this repo passes
`--config prisma.config.ts`.

Full rules: [`services/api/prisma/AGENTS.md`](services/api/prisma/AGENTS.md).
Summary:

- **Conventions**: `id String @id @default(uuid())`, `createdAt`/`updatedAt`,
  `createdById`/`updatedById` where an actor matters, `tenantId` + `tenant`
  relation on tenant-owned models. `PascalCase` models, `camelCase` fields,
  `SCREAMING_SNAKE_CASE` enum members. No `@@map` — Prisma names are the table
  names.
- **Relations**: explicit `onDelete` on every relation (381 use `Cascade`).
  Named relations where two relations connect the same pair of models.
- **Migrations**: timestamped directories, created with
  `npm run prisma:migrate:dev` locally. **Never hand-edit an applied migration.
  Never delete one. Never run `migrate reset` or `db push` against a shared
  database.** Deployment applies them via `npm run prisma:migrate:deploy`
  (wrapped by `npm run release:api`).
- **Indexes**: 992 `@@index` and 192 `@@unique` exist. Index every foreign key
  you filter on and every `(tenantId, <filter column>)` pair a list screen sorts
  or filters by.
- **Soft delete is not universal.** Only a handful of models carry `isDeleted`
  (`Employee` is one). Do not assume it exists; do not add it to a model without
  updating every query that reads it.
- **Destructive changes** — dropping a column/model/enum value, narrowing a
  type, adding a `NOT NULL` column without a default, or changing a unique
  constraint — require an ExecPlan under [`PLANS.md`](PLANS.md) with an explicit
  backfill and rollback section. Do them in expand/backfill/contract phases.
- **Seeds/provisioning**: `seed-config` (production-safe system configuration),
  `seed-admin` (platform super admin), `seed-demo` (demo tenant data),
  `seed-platform-workflows`. A new required configuration row must be added to
  `seed-config` **and** verified by `verify-seed-config`, or fresh deploys break.
  See [`docs/seed-architecture.md`](docs/seed-architecture.md).

---

## Backend

Full rules: [`services/api/AGENTS.md`](services/api/AGENTS.md). Summary:

- **Module layout**: `src/modules/<domain>/` with `<domain>.module.ts`,
  `<domain>.controller.ts`, `<domain>.service.ts`, usually
  `<domain>.repository.ts`, a `dto/` folder, and colocated `*.spec.ts`.
  Cross-cutting code lives in `src/common/`.
- **Controllers are thin.** They carry route decorators, guards, permission
  decorators and `@CurrentUser()`, then delegate. No business logic, no Prisma.
- **Services own business rules.** Repositories own Prisma access and shared
  `include` shapes, and accept `PrismaService | Prisma.TransactionClient` so
  callers can compose transactions.
- **Validation**: `class-validator` DTOs. The global `ValidationPipe` runs with
  `whitelist: true, transform: true, forbidNonWhitelisted: true` — **an unknown
  request field is a 400**, so DTO and frontend payload must change together.
- **Errors**: throw `AppError` with a code from
  `common/errors/error-catalog.ts`, or a Nest exception carrying
  `{ code, message }`. `HttpExceptionFilter` renders the standard contract
  (`success`, `traceId`, `statusCode`, `errorCode`, `message`, `description`,
  `fieldErrors`, `support`) and records the failure through `ErrorLogsService`.
  Do not invent ad-hoc error shapes; add a catalog entry instead.
- **Auth**: `@UseGuards(JwtAuthGuard, PermissionsGuard)` at the controller.
  `@Public()` marks a genuinely unauthenticated route. At this baseline there
  are **24 `@Public()` handlers across 10 controllers**, including partially
  public controllers such as `auth`, `agent`, `tenants` and `tenant-settings`
  where most handlers are guarded and a few are not. Count them on your branch;
  never assume a controller is uniformly public or uniformly guarded.
- **Permissions**: DijiPeople runs **two permission systems at once** and
  `PermissionsGuard` requires *all* declared legacy keys **and** *at least one*
  matrix privilege. Both decorators are normally required:
  ```ts
  @Permissions('employees.read')                          // common/constants/permissions.ts
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')       // common/constants/rbac-matrix.ts
  ```
  Row-level scope is a third, separate step done inside the service via
  `buildScopedAccessWhere()` / `resolveEffectiveAccessLevel()` from
  `common/security/rbac-query-scope.ts`.
- **Logging**: Nest `Logger` per class. Never log tokens, passwords, secrets or
  full request bodies; `sanitizeForErrorLog` exists for error payloads.
- **Audit**: call `AuditService.log()` for every state-changing operation that a
  tenant admin or auditor would need to see, passing `beforeSnapshot` and
  `afterSnapshot`. Pass the transaction client when inside `$transaction`.
- **Events / notifications**: platform-side events via `PlatformEventsService`;
  tenant notifications via the `notifications` module (catalog → orchestrator →
  queue → processor). Do not send email directly from a domain service.
- **Integrations**: `billing/` (Stripe) at this baseline. The
  `attendance-integrations` module and the `gateway/` .NET solution exist only
  in the uncommitted work noted in Product Context — verify presence on your
  branch before planning against them.
  Third-party credentials go through `SecretEncryptionService` —
  `SECRET_ENCRYPTION_KEY` is mandatory in production.

---

## Frontend

Full rules: [`apps/web/AGENTS.md`](apps/web/AGENTS.md) and
[`apps/admin/AGENTS.md`](apps/admin/AGENTS.md). Summary:

- **Search for the shared component before writing one.** The two apps have
  different shared kits:
  - `apps/admin` — **`ProDataTable`** (`app/_components/crm/data-table.tsx`) is
    the table for every production admin screen, plus `RuntimeModulePage`,
    `RuntimeRecordPage`, `RuntimeForm`, `RuntimeViewSelector`, `ModuleActionBar`.
  - `apps/web` — `app/components/data-table/`, `app/components/runtime/`
    (`StandardModuleListPage`, `StandardModuleRecordPage`, `ModuleDataTable`,
    `ModuleRecordHeader`, `ModuleEmptyState`, …), `app/components/ui/`
    (`Button`, `EmptyState`, `FormControl`, `SectionCard`, `StatusPill`),
    `app/components/metadata/` for form rendering.

  A hand-rolled table, form control or empty state in either app is a review
  failure.
- **Metadata-driven UI is the default.** New tenant-product modules are declared
  through `apps/web/lib/runtime/` (module registry, metadata registry, command
  registry, per-module adapters under `lib/runtime/modules/`) and rendered by the
  standard runtime pages. Only add a bespoke page when the runtime genuinely
  cannot express the requirement — and say so in the plan.
- **Settings** pages go through the settings runtime
  (`apps/web/app/(authenticated)/settings/_lib/`) and the API `settings-runtime`
  module. See [`docs/architecture/settings-and-branding.md`](docs/architecture/settings-and-branding.md),
  which is the canonical contract for settings, branding and formatting.
- **Layouts**: App Router route groups — `(authenticated)` and `(public)` in web,
  `(internal)` in admin. Shared shells provide navigation and branding; do not
  build a parallel shell.
- **Loading / error / empty states are mandatory** for every data surface. Use
  the existing `loading.tsx` / `error.tsx` conventions and the shared
  `EmptyState` / `ModuleEmptyState` components.
- **Server calls**: `apps/web/lib/server-api.ts` (and the admin equivalent)
  handle cookie auth, the `X-DijiPeople-App` header, refresh-on-401 and error
  normalisation. Route handlers under `app/api/` are thin proxies — **never
  re-implement an authorization or tenant decision there**; the API is the
  authority.
- **Permissions in the UI are cosmetic.** `apps/web/lib/permissions.ts` and
  `lib/security-keys.ts` gate navigation and controls for usability only. Every
  gated action must also be enforced server-side.
- **Responsiveness**: Tailwind CSS v4. Screens must work at tablet and mobile
  widths; the runtime shells already handle the common breakpoints
  (`responsive-runtime-tabs.tsx`).
- **Accessibility**: label every control, keep dialogs focus-trapped and
  escapable, keep tables navigable by keyboard, never encode meaning in colour
  alone (`StatusPill` carries text). Respect the tenant theme tokens rather than
  hardcoding colours.

---

## Security

Before reporting any change complete, verify each of these that applies:

| Check | What to confirm |
|---|---|
| **Tenant isolation** | Every new/changed query filters `tenantId` from `request.user`. No `findUnique` by bare id on a tenant-owned model. No `tenantId` accepted from client input. |
| **RBAC** | Both `@Permissions(...)` and `@RequirePermission(...)` present and consistent. New permission keys registered in `common/constants/permissions.ts` and/or `rbac-matrix.ts`, mirrored where the frontend needs them. Nothing added to the elevated-role list without an explicit decision — `hasElevatedTenantRole` bypasses the guard entirely. |
| **Object-level authorization** | Owning the right permission is not the same as owning the record. Apply `buildScopedAccessWhere()` / access-level checks so `OWN`/`TEAM`/`BUSINESS_UNIT` roles cannot reach other people's records. |
| **Input validation** | Every request body has a DTO with `class-validator` rules. Bounded strings, enum validation, numeric ranges, date sanity. |
| **Mass assignment** | Never spread a DTO straight into `prisma.*.create/update`. Pick fields explicitly. Never let a client set `tenantId`, `id`, `createdById`, status/approval fields or money fields that the domain should compute. |
| **Sensitive data exposure** | No password hashes, refresh tokens, encrypted secrets, full national ids or bank details in responses or logs. Use explicit `select`, not `include` everything. |
| **Auditability** | State-changing operations call `AuditService.log()` with before/after snapshots. |
| **Secrets** | Nothing hardcoded. Integration credentials via `SecretEncryptionService`. New env vars registered in `packages/config` validation, `turbo.json` `globalEnv`, `render.yaml` and `docs/environment-variables.md`. |
| **Unsafe client trust** | Server never trusts client-sent role, permission, tenant, price, total or approval state. Frontend gating is UX only. |

Public endpoints (`@Public()`) additionally need rate limiting
(`PublicRateLimitGuard`), strict input validation and no tenant enumeration in
responses or error messages.

---

## Testing and Validation

These commands exist in this repository. **Do not invent others.**

Repository root:

```bash
npm run lint                 # turbo run lint across workspaces
npm run typecheck            # turbo run check-types (alias: npm run check-types)
npm run build                # turbo run build --concurrency=1
npm run test:runtime-schema  # node --test packages/config/platform-runtime-schema.test.js
npm run prisma:validate      # prisma validate --config prisma.config.ts
npm run prisma:generate
npm run prisma:migrate:status
npm run smoke:deployment     # scripts/smoke-deployment.mjs
```

Per workspace:

```bash
npm --workspace api   run test         # jest, *.spec.ts under services/api/src
npm --workspace api   run test:e2e     # jest --config ./test/jest-e2e.json
npm --workspace api   run check-types  # tsc --noEmit -p tsconfig.build.json
npm --workspace api   run lint         # eslint --fix
npm --workspace api   run format       # prettier --write (api only)
npm --workspace web   run test         # jest --config jest.config.js
npm --workspace web   run check-types  # next typegen && tsc --noEmit
npm --workspace admin run test
npm --workspace admin run check-types
```

.NET gateway: `npm run gateway:build`, `npm run gateway:test`.

Seeds and release: `npm run seed:config`, `seed:admin`, `seed:demo`,
`seed:all`, `npm run release:api`.

### Rules

- Run the validation that is **relevant to what you changed**, plus a repository
  typecheck for anything crossing a workspace boundary. A full `npm run build`
  is slow (`--concurrency=1`); run it when you changed build inputs.
- **There is no CI in this repository** (no `.github/` workflows). Nothing runs
  these for you. If you skip them, they are not run.
- New backend business logic gets a colocated `*.spec.ts`. Follow the existing
  patterns — see `attendance.service.spec.ts`, `rbac-matrix.spec.ts`,
  `payroll-operations.service.spec.ts`.
- Changes to permissions, tenant scoping or cross-module wiring should extend
  the existing invariant tests (`common/constants/wiring-invariants.spec.ts`,
  `rbac-matrix.*.spec.ts`). The e2e suites present at this baseline are
  `test/app.e2e-spec.ts` and `test/platform-workflows.e2e-spec.ts` — list the
  directory rather than assuming which exist.
- **Never report work complete while a relevant validation is failing or was not
  run.** Say exactly which commands were run, which passed, which failed, and
  which were skipped and why. A pre-existing failure must be identified as
  pre-existing, with evidence.

---

## Implementation Process

For any substantial change — new module, cross-module feature, migration,
auth/permission change, payroll or attendance logic, provisioning, integration,
or a large refactor — follow this order. Small, local, single-file fixes may go
straight to step 6.

1. **Inspect the existing implementation.** Read the module, its service,
   repository, DTOs, specs and the frontend that consumes it. Read the relevant
   documents in `docs/architecture/`.
2. **Determine architecture and dependencies.** Which modules, which models,
   which permissions, which settings, which runtime registries, which other apps
   consume the contract.
3. **Identify reusable code.** Existing services, shared components, existing
   permission keys, existing settings, existing runtime adapters. Reuse beats
   new code every time.
4. **Create a plan.** For the change classes listed in [`PLANS.md`](PLANS.md),
   write a full ExecPlan before touching code.
5. **Identify parallel-safe work** and mark every task `PARALLEL_SAFE`,
   `DEPENDENCY_BLOCKED` or `INTEGRATION`. See
   [`docs/development/parallel-work.md`](docs/development/parallel-work.md).
6. **Implement**, keeping the change scoped to the task. No opportunistic
   refactors, no drive-by reformatting, no unrelated file edits.
7. **Review** your own diff against the [Security](#security) checklist before
   handing off.
8. **Test** — run the relevant commands above and report the results honestly.
9. **Summarize**: files changed and why, decisions made, assumptions, risks,
   unresolved issues, follow-up work.

---

## Working Agreements

- **Do not commit or push unless asked.** Do not work directly on `main`; see
  [`docs/development/git-worktrees.md`](docs/development/git-worktrees.md).
  Branch naming: `agent/<feature>-<scope>`.
- The working tree may already contain unrelated in-flight changes. Check
  `git status` before you start and never revert, stage or commit files you did
  not touch.
- Do not add dependencies without justification; prefer what is already
  installed.
- Do not reformat files you are not otherwise changing.
- Do not delete or rewrite existing documentation to make your change look
  cleaner. Update it.
- Strict TypeScript. No `any` escape hatches to silence the compiler; no
  `@ts-ignore` without a comment explaining why.
- Comments explain *why*, not *what*. This codebase has a house style of
  substantial explanatory comments where behaviour is non-obvious (see
  `main.ts`, `tenant-modules.ts`, the `workedMinutes` field in `schema.prisma`).
  Match it — do not strip those comments.
