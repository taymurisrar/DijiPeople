# AGENTS.md — DijiPeople Engineering Instructions

> **Last verified:** 2026-08-19
> **Verified against commit:** 494c44d
>
> This file outranks every role and context document, and until now it was the
> only tier that carried no provenance of its own — so the two highest-severity
> findings of the 2026-08-17 drift audit were both here. Every counted figure
> and every module named below was re-derived at that commit. When you change a
> claim in this file, move these two lines with it; `validate-framework.mjs`
> requires them and checks the claims they vouch for.

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
- [`apps/agent-desktop/AGENTS.md`](apps/agent-desktop/AGENTS.md) — Electron attendance agent
- [`packages/config/AGENTS.md`](packages/config/AGENTS.md) — shared runtime config

Planning rules live in [`PLANS.md`](PLANS.md). Agent role definitions live in
[`.agent/agents/`](.agent/agents/). Documentation conventions live in
[`docs/README.md`](docs/README.md).

---

## The operating model, in nine lines

```
The user talks only to the Architect.       Nobody names a specialist.
`DP:` and `DijiPeople Task:` are the same.  Both mean the whole framework.
Ordinary work integrates into `develop`.    `main` deploys production.
Several Architect chats may run at once.    Sessions, leases, one id allocator.
QA reuses durable plans and scenarios.      It adapts; it never starts from zero.
The backlog is maintained, not merely kept. Nothing stays TRIAGE_REQUIRED.
Obsidian runs in both directions.           Intent in, verified truth out.
Release/DevOps owns deployment and health.  The Integrator owns Git.
A required agent that did not pass          blocks completion.
```

**The user must never have to paste the framework again.** Everything below and
in [`.agent/context/`](.agent/context/) is the standing instruction set.

---

## `DP:` — the framework activates itself

A prompt beginning **`DP:`** or **`DijiPeople Task:`** means *"use the complete
DijiPeople autonomous engineering framework"* — the entire lifecycle in
[`.agent/context/task-completion-contract.md`](.agent/context/task-completion-contract.md),
from knowledge retrieval through integration, knowledge capture, Obsidian sync
and cleanup.

The two triggers are identical. `DP:` is shorter to type, and that is the whole
of the difference.

**The user never restates these rules.** Being asked to repeat them means this
section was not read, which is a framework defect and not a user preference.

An optional keyword after the colon is an **intent hint**, not a separate
workflow — the lifecycle stays one and unified:

```
DP:            DP BUG:      DP FIX:       DP FEATURE:    DP UI:        DP UX:
DP QA:         DP TEST:     DP E2E:       DP SECURITY:   DP DB:        DP DATABASE:
DP ARCH:       DP ARCHITECTURE:           DP INTEGRATION:              DP PERFORMANCE:
DP DOC:        DP KNOWLEDGE:              DP BACKLOG:    DP AUDIT:     DP CLEANUP:
DP RELEASE:    DP DEPLOY:   DP HOTFIX:    DP FRAMEWORK:
```

**Keywords are optional.** With none — or with one not in the list — the
Architect infers the type from the description and states what it inferred.
`DP: fix the tenant provisioning retry` is a `BUG`; `improve payroll UI` is
`UI/UX` + `FEATURE`; `DP FIX: agent logout` is `BUG` + `SECURITY`;
`DP: make tenant provisioning production ready` is a `LARGE` `FEATURE` that
decomposes into work packages before any code is written. Routing, inference,
the shorthand aliases and the per-type definition of done live in
[`.agent/context/task-router.md`](.agent/context/task-router.md) — **the
Architect reads it before planning.**

Sizing, work-package decomposition, automatic continuation between packages,
the assumption register and the concise progress format live in
[`.agent/context/task-orchestration.md`](.agent/context/task-orchestration.md).
Repository health, `MAIN_SYNC_STATUS`, protected-branch recovery and deployment
drift live in
[`.agent/context/repository-health.md`](.agent/context/repository-health.md).

**No keyword weakens a gate** — not the shared-target CI rule, not branch
protection, not tenant isolation, not `main` as production control, not the
requirement that findings become durable records. `HOTFIX` is the one most often
read as an exception. It is not: urgency narrows scope, never evidence.

---

## The Architect is the only user-facing agent

The user should never need to invoke Backend/API, Frontend, UI/UX, Database,
Integration, QA, the Reviewer, the Integrator or Release/DevOps. The Architect
selects them from impact analysis, sequences them, validates each handoff,
routes rework when a stage rejects one, and refuses to report completion while a
required agent is not `PASS`.

Full rules — the handoff contract, the required-agent matrix, the acceptance
tokens and rework routing — are in
[`.agent/context/agent-handoffs.md`](.agent/context/agent-handoffs.md).

---

## Branches: `develop` integrates, `main` deploys

```
main        production deployment branch   ← RELEASE / DEPLOY / HOTFIX_PRODUCTION only
  ↑
develop     autonomous integration branch  ← every ordinary task
  ↑
agent/*     isolated implementation branches
```

**Any mutation of `main` may trigger a production deployment**, so ordinary
tasks — `BUG`, `FEATURE`, `UI/UX`, `QA`, `E2E`, `ARCHITECTURE`, `DATABASE`,
`INTEGRATION`, `SECURITY`, `PERFORMANCE`, `KNOWLEDGE`, `FRAMEWORK`, `BACKLOG`,
`AUDIT` — target `develop` and finish with `MAIN_CHANGE_STATUS = UNTOUCHED`.

Integration into `develop` needs no PR and no human approval; it still needs
validation. Only the Integrator writes a shared branch, and concurrent
integrations serialise through a merge queue. `main` keeps every protection it
has. See [`.agent/context/branch-model.md`](.agent/context/branch-model.md).

---

## Several Architect chats may run at once

Two or three sessions working concurrently is expected, not exceptional. Before
planning, and before changing any file:

```bash
node scripts/session.mjs list                    # who is running, what they hold
node scripts/session.mjs check --paths <paths>   # classify the proposed work
```

Every substantial task registers a session, takes write leases on the high-risk
shared resources it will write, and releases them when it finishes. Durable ids
come from one allocator that scans every branch and reserves before the record
exists — never from counting files in a directory.

```bash
node scripts/allocate-id.mjs bug --session SESSION-nnnn
```

The database stays **single-writer across all sessions**. Full rules:
[`.agent/context/multi-session.md`](.agent/context/multi-session.md).

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

**67 modules** under `services/api/src/modules/`, verified at commit 7c97ff2.

| Area | Modules |
|---|---|
| Identity | `auth` — sessions, per-client JWT issuance, `JwtAuthGuard`; the module every other row depends on |
| People | `employees`, `employee-levels`, `employment-types`, `users`, `teams`, `organization` |
| Time | `attendance`, `attendance-engine`, `attendance-integrations`, `timesheets`, `leave` |
| Pay | `payroll`, `payslips`, `pay-components`, `compensation`, `tax-rules`, `loans`, `claims`, `benefits`, `business-trips`, `time-payroll` |
| Talent | `recruitment`, `onboarding`, `projects`, `documents`, `policies` |
| Governance | `approvals`, `workflows`, `sla`, `audit`, `error-logs`, `permissions`, `roles` |
| Commercial | `legal` (versioned legal documents, publication, acknowledgements), `leads`, `partners`, `partner-experience`, `contracts`, `support-cases`, `billing`, `super-admin` (customers, plans, subscriptions, invoices, payments, tenant provisioning) |
| Configuration | `tenant-settings`, `settings-runtime`, `customization`, `lookups`, `views`, `navigation`, `data`, `platform-runtime` |
| Messaging | `notifications` — the only route for tenant notification and email; catalog → orchestrator → queue → processor |
| Platform ops | `platform-auth`, `platform-users`, `platform-events`, `outbox` (transactional outbox — the delivery half `platform-events` deliberately is not), `platform-monitoring`, `platform-communications`, `app-releases`, `tenants`, `tenant-control-plane`, `tenant-domains`, `demo-data`, `data-management`, `agent`, `dashboard`, `inbox`, `reports` |

> **Verify counts on your branch.** The figures above were measured at commit
> 3f9063f. This repository moves quickly, and instruction files here have
> previously described an uncommitted working tree rather than a commit.
> Re-derive a number rather than trusting it if your branch differs — see the
> `doc-code-drift` bug pattern.
>
> The table itself is now validated, not merely asserted:
> `scripts/validate-framework.mjs` fails when the stated count disagrees with
> `services/api/src/modules/`, when a directory is missing from the table, or
> when a module this file names as a mandatory routing target is absent from it.
> That check exists because this table once claimed 63 modules, enumerated 61,
> and omitted `auth` and `notifications` — while the Events/notifications rule
> below required routing through `notifications` by name.

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
gateway/          .NET on-premise integration gateway (DijiPeople.Gateway.sln)
tools/zkteco-poc/ ZKTeco device POC + .NET worker
scripts/          repo-level node scripts (ports, smoke tests, codegen)
docs/             repository documentation (see docs/README.md)
```

**`packages/` contains exactly four workspaces — `config`, `ui`,
`eslint-config`, `typescript-config` — and nothing else.** In particular there
is no `packages/database`, `packages/types` or `packages/utils`. Do not import
from them, and do not create them without an explicit decision recorded as an
ADR. Shared backend code lives in `services/api/src/common/`; shared frontend
code lives in each app's `lib/` and `app/components/`.

> This paragraph previously described those three paths as "empty directories",
> which read as a statement that they exist. They do not exist at all, and have
> not for as long as the tree records. The instruction was right; its premise
> was not.

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
`services/api/prisma/schema.prisma` — **13,703 lines, 312 models, 295 enums**,
with **210** migrations in `services/api/prisma/migrations/`, all re-derived at
494c44d and drifting upward from the day they were written. Prisma is configured
by `services/api/prisma.config.ts` — every Prisma CLI call in this repo passes
`--config prisma.config.ts`.

Full rules: [`services/api/prisma/AGENTS.md`](services/api/prisma/AGENTS.md).
Summary:

- **Conventions**: `id String @id @default(uuid())`, `createdAt`/`updatedAt`,
  `createdById`/`updatedById` where an actor matters, `tenantId` + `tenant`
  relation on tenant-owned models. `PascalCase` models, `camelCase` fields,
  `SCREAMING_SNAKE_CASE` enum members. No `@@map` — Prisma names are the table
  names.
- **Relations**: explicit `onDelete` on every relation (447 use `Cascade`).
  Named relations where two relations connect the same pair of models.
- **Migrations**: timestamped directories, created with
  `npm run prisma:migrate:dev` locally. **Never hand-edit an applied migration.
  Never delete one. Never run `migrate reset` or `db push` against a shared
  database.** Deployment applies them via `npm run prisma:migrate:deploy`
  (wrapped by `npm run release:api`).
- **Indexes**: 1,163 `@@index` and 221 `@@unique` exist. Index every foreign key
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
  are **32 `@Public()` handlers across 12 controllers**, including partially
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
- **Integrations**: `billing/` (Stripe), the `attendance-integrations` module and
  the `gateway/` .NET solution (`DijiPeople.Gateway.sln`). **All three are
  committed and present** — `gateway/` and `attendance-integrations/` have been
  tracked since 78716c4, and `npm run gateway:build` / `gateway:test` run
  against the solution. This bullet previously called the last two "uncommitted
  work", contradicting Product Context in the same file.
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

npm run validate:framework   # structural validation of the agent framework
npm run repo:health          # PRE/POST_TASK_REPO_HEALTH — sync, worktrees, branches
npm run backlog:check        # records valid, indexes current — fails on drift
npm run backlog:rebuild      # regenerate every backlog index
npm run backlog:new-bug -- "<title>" --severity HIGH --type AUTHORIZATION
npm run backlog:new-item -- "<title>" --type TEST_GAP
npm run backlog:review       # aging, revalidation, duplicate candidates
npm run tasks:check          # parent-task records valid, indexes current
npm run tasks:rebuild        # regenerate the parent-task indexes
npm run tasks:new -- "<title>" --type FEATURE --size LARGE

npm run session -- list                          # active sessions, leases, merge queue
npm run session -- check --paths <a,b>           # classify work against what is in flight
npm run session -- start "<title>" --type FEATURE --size LARGE --branch agent/<x>
npm run session -- lease acquire schema --session SESSION-nnnn --reason "<why>"
npm run session -- queue add --session SESSION-nnnn --branch agent/<x>
npm run session -- finish SESSION-nnnn
npm run sessions:check       # session records valid, indexes current
npm run allocate:id -- bug   # atomic id, safe across branches and sessions

npm run qa:select -- <module> [<module>…]        # plans, scenarios, regressions to re-run
npm run qa:check             # QA records valid, coverage matrix current
npm run qa:rebuild           # regenerate the QA indexes and coverage matrix
npm run qa:new-scenario -- "<title>" --scope AUTH --area authentication
npm run qa:new-plan -- "<title>" --area <area>
npm run qa:new-run -- <feature-slug>

npm run branch:policy        # verify main/develop protection — read-only
npm run ci:metrics           # rolling CI metrics + regression triggers (Release/DevOps)
npm run ci:classify -- --run <id>   # is a cancelled run still valid evidence?
npm run knowledge:retrieve -- <module> <feature>
npm run knowledge:dashboards # dashboards + the Engineering Control Center
npm run knowledge:sync       # publish into the vault (needs a local config)
npm run knowledge:verify     # read the vault back — notes, substance, wikilinks
npm run history:new -- <task-slug>
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
- **CI exists** — `.github/workflows/ci.yml`, **twelve** jobs named behind a
  single `CI required gate` check
  ([`docs/development/ci.md`](docs/development/ci.md)). Count them in the gate's
  `needs` list rather than trusting this number. A job can still be fail-open
  through `continue-on-error`, so inspect both the dependency list and the job
  policy; `browser-e2e` currently has that contradiction.
  It runs on push, not locally: nothing runs these commands for you before you
  push, and a local pass is not a CI pass.
- New backend business logic gets a colocated `*.spec.ts`. Follow the existing
  patterns — see `attendance.service.spec.ts`, `rbac-matrix.spec.ts`,
  `payroll-operations.service.spec.ts`.
- Changes to permissions, tenant scoping or cross-module wiring should extend
  the existing invariant tests (`common/constants/wiring-invariants.spec.ts`,
  `rbac-matrix.*.spec.ts`, `test/permission-propagation.e2e-spec.ts`,
  `test/attendance-integrations-isolation.e2e-spec.ts`). List `services/api/test/`
  rather than assuming which suites exist — the set changes with in-flight work.
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

0. **Find out what is already known to be wrong here.**
   `node scripts/retrieve-knowledge.mjs <module> <feature>` surfaces the open
   bug records, backlog items, regressions and bug patterns for the modules in
   scope. Every specialist opens its report with a `KNOWN_MISTAKES_TO_AVOID`
   block listing the relevant ones — **only** the relevant ones.
   A defect already recorded in `docs/bugs/`, the regression register, a bug
   pattern or module knowledge is **not new information**; reintroducing it is a
   repeat, and the Reviewer raises its severity accordingly.
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
9. **Finalize** — commit, push, obtain a CI verdict, merge, validate the merged
   SHA, capture knowledge, sync Obsidian, clean up. Mandatory for any task that
   modified tracked files. See
   [Task Completion](#task-completion) below.
10. **Summarize**: files changed and why, decisions made, assumptions, risks,
    unresolved issues, follow-up work, and the `## Task Finalization` block.

---

## Task Completion

**A task is not complete when the code is written.** Implementation, tests, QA
and review all passing means the *work* is sound — not that it landed.

Completion is defined by
[`.agent/context/task-completion-contract.md`](.agent/context/task-completion-contract.md),
which `scripts/validate-framework.mjs` enforces. Every field must be resolved:

```
PRE_TASK_REPO_HEALTH            REVIEW_STATUS                 ENGINEERING_HISTORY_STATUS
SESSION_STATUS                  PR_STATUS                     FEEDBACK_PROMOTION_STATUS
PARENT_TASK_STATUS              REMOTE_CI_STATUS              KNOWLEDGE_CAPTURE_STATUS
WORK_PACKAGE_STATUS             MERGE_STATUS                  OBSIDIAN_SYNC_STATUS
REQUIRED_AGENTS_STATUS          DEVELOP_INTEGRATION_STATUS    CONTROL_CENTER_STATUS
IMPLEMENTATION_STATUS           DEVELOP_SYNC_STATUS           CLEANUP_STATUS
LOCAL_VALIDATION_STATUS         POST_MERGE_VALIDATION_STATUS
QA_STATUS                       MAIN_SYNC_STATUS
QA_FINDINGS_CLASSIFIED_STATUS   MAIN_CHANGE_STATUS
QA_SCENARIO_PROMOTION_STATUS    POST_TASK_REPO_HEALTH
BUG_RECORD_STATUS               PRIMARY_WORKTREE_STATUS
ARCHITECT_TRIAGE_STATUS         TASK_WORKTREE_STATUS
BACKLOG_UPDATE_STATUS           UNEXPLAINED_DIRTY_FILES
                                POST_INTEGRATION_GENERATOR_STATUS
                                DEPLOYMENT_STATUS
                                DEPLOYMENT_DRIFT_STATUS
```

Resolved means `PASS`, `DONE`, `NOT_REQUIRED` (with a reason),
`BLOCKED_<REASON>` or `FAILED`. **Never `ASSUMED_PASS`; never omitted.**

Six of these are terminal invariants rather than ordinary fields. After a
completed **ordinary** task:

```
MAIN_SYNC_STATUS        = SYNCED
MAIN_CHANGE_STATUS      = UNTOUCHED   ← production is where the task found it
DEVELOP_SYNC_STATUS     = SYNCED      ← where a local develop exists
POST_TASK_REPO_HEALTH   = PASS
UNEXPLAINED_DIRTY_FILES = 0
PRIMARY_WORKTREE_STATUS ∈ { CLEAN, DIRTY_USER_OWNED, DIRTY_OTHER_SESSION_OWNED }
```

No stuck push, unfinished merge, unfinished rebase, unexpected local-`main`
commit or unverified divergence may remain — see
[`.agent/context/repository-health.md`](.agent/context/repository-health.md).
`MAIN_CHANGE_STATUS = CHANGED` on anything but a `RELEASE`, `DEPLOY` or
`HOTFIX_PRODUCTION` is a **failed** task, not an untidy one.

**Repository health is not a property of the worktree you are standing in.**
A task worktree can be spotless while the user's primary checkout carries files
nobody has explained — which is exactly how a task once reported
`CLEANUP_STATUS = DONE` while GitHub Desktop showed six changed files on
`develop`. `PRIMARY_WORKTREE_STATUS` is never `NOT_REQUIRED`, and every dirty
path there must name an owner: the user, a session, a generator, or `UNKNOWN`.
`UNKNOWN` blocks completion; nothing is reverted, restored, stashed or cleaned
to make the report look tidier.

`REQUIRED_AGENTS_STATUS` is the fifth invariant and is never `NOT_REQUIRED`: a
task may not complete while an agent the work needed is not `PASS`. See
[`.agent/context/agent-handoffs.md`](.agent/context/agent-handoffs.md).

A prompt beginning `DP:` or `DijiPeople Task:` requests the whole lifecycle — historical
knowledge retrieval, regression awareness, durable handling of your corrections,
Git finalization and knowledge sync included. Nobody should have to add "push
it", "merge it", "sync Obsidian", "clean the worktree", "remember this", "don't
make this mistake again" or "check previous bugs".

### No finding may exist only in a report

**Every material QA finding becomes a durable record** under
[`docs/bugs/`](docs/bugs/) — evidence, reproduction, severity — and appears in
the backlog automatically. The Architect then triages it: `FIX_NOW`,
`PLAN_REQUIRED`, `DEFER`, `PRODUCT_DECISION`, `BLOCKED_EXTERNAL` or
`ACCEPTED_RISK`.

```
QA finds an issue → BUG record → backlog → Architect triage
  → fix / plan / defer / decision → QA retest → regression → knowledge
  → a future agent retrieves the lesson before writing the same defect
```

A substantial task **cannot complete** while a finding it produced is
unclassified, or while a record it created is still `TRIAGE_REQUIRED`.

Two boundaries hold this together: **QA does not prioritise, and specialists do
not triage.** QA establishes what is true; the Architect decides what the
project does about it.

Bug records and backlog indexes are Git-tracked and **generated** —
`node scripts/rebuild-backlog.mjs` rebuilds every index; nothing is maintained
by hand. See [`docs/bugs/README.md`](docs/bugs/README.md) and
[`docs/backlog/README.md`](docs/backlog/README.md).

### Knowledge systems

Each answers exactly one question — see
[`.agent/context/knowledge-architecture.md`](.agent/context/knowledge-architecture.md):

| System | Answers |
|---|---|
| **Git** | What changed? |
| **CI** | Did this commit pass automated validation? |
| **QA runs** | What behaviour was actually tested? |
| **`docs/bugs/*`** | What is wrong, and what state is that in? |
| **`docs/backlog/*`** | What is outstanding, and what did we decide? |
| **`docs/engineering-history/*`** | How did a task run, start to finish? |
| **`.agent/context/*`** | How does DijiPeople currently work? |
| **`docs/knowledge/*`** | What did we learn, in a Git-tracked form? |
| **Obsidian** | Why does it work this way, and what happened before? |

**Obsidian carries intent and history; the code is implementation truth.** Never
change code because a note disagrees — classify the discrepancy and report it.
Retrieve selectively with `node scripts/retrieve-knowledge.mjs <terms>`; never
bulk-load the vault.

**Your corrections are durable.** Each is classified under `USER_FEEDBACK_CLASS`
and promoted into tests, knowledge, ADRs, agent instructions or validation
checks — so it does not have to be repeated.

Until the contract has been evaluated, do not write "complete" or "done". The
phrasing is **`IMPLEMENTATION COMPLETE — FINALIZATION PENDING`**.

Collect the facts with `node scripts/finalize-agent-task.mjs`.

---

## Working Agreements

- **Commit, push and merge your own task's work — that is the Integrator's job,
  and it is mandatory, not on request.** Do not work directly on `main`; see
  [`docs/development/git-worktrees.md`](docs/development/git-worktrees.md).
  Branch naming: `agent/<feature>-<scope>`.
  > This bullet used to read "do not commit or push unless asked". Because this
  > file outranks every role document, that single line quietly disabled the
  > Integrator: a completed tenant control-plane implementation — new API
  > module, migration, ten replaced components — was reported as finished while
  > entirely uncommitted. Committing *your task's* output is now required;
  > touching anything else still is not.
- **Ordinary tasks integrate into `develop` and leave `main` untouched.** Any
  mutation of `main` may trigger a production deployment, so only a `RELEASE`,
  `DEPLOY` or `HOTFIX_PRODUCTION` task may target it — and the Architect may not
  reclassify a normal task into one of those because integration would be
  simpler. `node scripts/rebuild-sessions.mjs --check` enforces this on the
  session record. See
  [`.agent/context/branch-model.md`](.agent/context/branch-model.md).
- **Register a session before planning, and check what else is in flight.**
  `node scripts/session.mjs list` and `… check --paths <paths>`. Take a write
  lease for any high-risk shared resource you will write, and release it when
  you finish. The database is single-writer across **all** sessions. See
  [`.agent/context/multi-session.md`](.agent/context/multi-session.md).
- **Never allocate a durable id by counting files.** `node
  scripts/allocate-id.mjs <kind>` scans every branch and reserves before the
  record exists. A directory scan cannot see an id a sibling session already
  took, which is how this repository twice had to renumber colliding records.
- **`main` is protected, and there is no admin bypass** (`enforce_admins: true`).
  A direct push fails with `GH006` / "Changes must be made through a pull
  request". That is `PROTECTED_BRANCH_REQUIRES_PR` — a recoverable policy
  outcome, **not** a terminal error and not a question for the user. The
  Integrator preserves the commits on a task branch, opens a PR, waits for the
  exact-SHA `CI required gate` verdict, merges, and fast-forwards local `main`.
  **Never force-push `main`. Never discard an unverified commit to tidy the
  state.** The full recovery is in
  [`.agent/context/repository-health.md`](.agent/context/repository-health.md).
- **Run `npm run repo:health` before creating a branch and again before the
  final report**, passing `--main-baseline <sha>` so `MAIN_CHANGE_STATUS` is a
  fact rather than a guess, and `--task-branch agent/<x>` so the primary, task
  and other worktrees are told apart. A task worktree is never cut from a stale
  base, and a task never ends leaving the repository for a human to clean up.
- **Record which paths were already dirty in the primary checkout before you
  start**, and pass them back as `--primary-baseline` at the end. It is the only
  thing that distinguishes the user's in-flight work from a mess the task made,
  and without it the framework reports `DIRTY_UNEXPLAINED` rather than assuming
  the flattering reading.
- The working tree may already contain unrelated in-flight changes. Check
  `git status` before you start and never revert, stage or commit files you did
  not touch. **Other people's uncommitted work remains untouchable** — if the
  primary checkout is dirty with work that is not yours, use another worktree.
  This applies to the primary checkout above all: it is the user's interactive
  workspace, not a scratch directory, and `git status --short` being non-empty
  there is something they will see in GitHub Desktop long before you do.
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
