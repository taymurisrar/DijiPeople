# System Overview

> **Last verified:** 2026-08-16
> **Verified against commit:** 78072d2
> **Key source files:** package.json, turbo.json, render.yaml, services/api/src/main.ts, services/api/src/app.module.ts, services/api/src/common/config/auth.config.ts, packages/config/index.js, services/api/prisma/schema.prisma, AGENTS.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

DijiPeople is a **multi-tenant SaaS HRM and business platform**: one codebase,
one PostgreSQL database, many tenants. Turborepo + npm workspaces monorepo.

Root `package.json` declares `engines: { node: "22.x", npm: "11.x" }`,
`packageManager: npm@11.9.0`, and workspaces
`["apps/*", "packages/*", "services/*", "e2e"]` — `e2e` is the Playwright
browser-journey workspace and is easy to miss.

### Surfaces

| Surface | Path | Port (dev) | Notes |
|---|---|---|---|
| Landing (public marketing) | `apps/landing` | 3000 | Next.js App Router. No test script. |
| Tenant product | `apps/web` | 3001 | Next.js App Router, metadata-driven runtime. |
| Platform admin | `apps/admin` | 3002 | Next.js App Router, cross-tenant SaaS ops. |
| Agent desktop | `apps/agent-desktop` | — | Electron attendance/activity agent. |
| API | `services/api` | 4000 | NestJS 11, global prefix `/api`. |
| Docs starter | `apps/docs` | — | Next.js starter, effectively unused. |

Ports come from `DEFAULT_LOCAL_PORTS` in `packages/config/index.js`
(`landing: 3000, web: 3001, admin: 3002, api: 4000`), overridable via
`LANDING_PORT` / `WEB_PORT` / `ADMIN_PORT` / `API_PORT`.

### Backend domains — 60 modules under `services/api/src/modules/`

Verified by directory listing (exact count: 60).

- **People / org** — `employees`, `employee-levels`, `employment-types`, `users`,
  `teams`, `organization`
- **Time** — `attendance`, `timesheets`, `leave`, `agent` (Electron agent API:
  sessions, heartbeats, devices, location requests)
- **Pay** — `payroll`, `payslips`, `pay-components`, `compensation`, `tax-rules`,
  `loans`, `claims`, `benefits`, `business-trips`, `time-payroll`
- **Talent / content** — `recruitment`, `onboarding`, `projects`, `documents`,
  `policies`
- **Governance** — `approvals`, `workflows`, `sla`, `audit`, `error-logs`,
  `permissions`, `roles`
- **Commercial** — `leads`, `partners`, `partner-experience`, `contracts`,
  `support-cases`, `billing`, `super-admin`
- **Configuration / runtime** — `tenant-settings`, `settings-runtime`,
  `customization`, `lookups`, `views`, `navigation`, `data`, `platform-runtime`
- **Platform ops** — `platform-auth`, `platform-users`, `platform-events`,
  `platform-monitoring`, `platform-communications`, `tenants`, `demo-data`,
  `data-management`
- **Cross-cutting product surfaces** — `auth`, `dashboard`, `inbox`,
  `notifications`, `reports`

`app.module.ts` wires these in a single root module (~64 `Module,` import
entries). It is a **modular monolith** — no brokers, no separate deployables.

### Data layer

Prisma 7.8 with `@prisma/adapter-pg` against PostgreSQL (Neon in production).
Single schema: `services/api/prisma/schema.prisma` — **10,436 lines, 266
`model` declarations, 222 `enum` declarations**, with **184 migration
directories** under `services/api/prisma/migrations/`. Every Prisma CLI call
passes `--config prisma.config.ts`.

### Auth model

`AUTH_CLIENT_IDS` in `services/api/src/common/config/auth.config.ts` defines
three clients: `web`, `admin`, `agent-desktop`. Each has its own JWT secrets,
TTLs and cookie names (see `turbo.json` `globalEnv` for the full env matrix).
`JwtAuthGuard` verifies the per-client secret, matches `appClientId`/`aud`
against the requesting client, checks the session row is live, then loads the
access context. **Tenant isolation is enforced by convention in service code**,
not by row-level security and not by Prisma middleware.

## Key abstractions

- **Dual permission system.** `PermissionsGuard` reads two metadata families:
  legacy keys via `@Permissions(...)` (`common/constants/permissions.ts`) and
  matrix privileges via `@RequirePermission(...)` (`common/constants/rbac-matrix.ts`).
  Row-level scope is a third step inside services (`common/security/rbac-query-scope.ts`).
- **Metadata-driven module runtime** (`apps/web/lib/runtime/`): module registry,
  metadata registry, command registry, per-module adapters under
  `lib/runtime/modules/`, rendered by standard runtime pages.
- **Settings runtime**: `apps/web/app/(authenticated)/settings/_lib/` paired with
  the API `settings-runtime` module.
- **Error catalog + `HttpExceptionFilter`**: one response contract for failures.
- **Notification orchestrator**: catalog → orchestrator → queue → processor
  (`services/api/src/modules/notifications/`).
- **`@repo/config`** (`packages/config/`, plain JS, no build step): ports, app
  URLs, CORS origins, `validateDeploymentEnv`, platform runtime schema/views.

## Known exceptions

> **Five "does not exist" claims that used to sit here have been removed** —
> every one of them had become false. They denied `gateway/`,
> `tools/zkteco-poc/`, `attendance-engine`, `attendance-integrations` and
> `app-releases`. All five exist. Corrected 2026-08-16 at `78072d2`; see
> [[BUG-0036-integration-patterns-context-denies-four-subsystems-that-exi]] and
> the generalised guard in [[ITEM-0011]].

- **Re-derive counts; do not trust them here or in root `AGENTS.md`.** Measured
  at `78072d2`: **65** modules under `services/api/src/modules/`, and
  `schema.prisma` at **12,211 lines, 292 models, 264 enums**, with **194**
  migrations. Root `AGENTS.md` states 63 / 11,802 / 285 / 255 / 191, measured at
  `78716c4`. Neither set is wrong for its commit; both go stale within days.
  This repository moves fast enough that a count is a timestamp, not a fact.
- `@Public()` appears **24 times across 10 controllers**, not the four routes
  root `AGENTS.md` claims: `agent` (3), `auth` (9), `admin-auth` (3),
  `public-billing` (2), `stripe-webhook` (1), `public-leads` (1),
  `public-tenants` (2), `tenants` (1), `tenant-settings` (1),
  `tenant-branding` (1).

## Anti-patterns to avoid

- Treating the `PrismaService` `$use` middleware as a tenant safety net. It
  scopes by business unit, and `$use` is unavailable on `@prisma/client@7.8.0`.
- `findUnique` by bare id on a tenant-owned model. Use `findFirst({ id, tenantId })`.
- Accepting `tenantId` from a request body, query, param or header.
- Adding a second registry for permission keys, entity keys, settings catalogs,
  module registries or view definitions.
- Building a competing runtime, shell, table or form layer instead of extending
  `apps/web/lib/runtime/` or the admin `Runtime*` components.
- Branching business logic on a tenant name or id instead of using
  `tenant-settings` / `settings-runtime` / `customization`.

## TARGET (required going forward)

1. Every new tenant-owned query filters `tenantId` taken from `request.user`.
2. Every guarded, non-public handler declares **both** `@Permissions(...)` and
   `@RequirePermission(...)` — enforced by
   `services/api/src/common/constants/wiring-invariants.spec.ts`.
3. New tenant-product modules are declared through the metadata runtime; a
   bespoke page requires an explicit justification in the plan.
4. New env vars are registered in `packages/config` validation, `turbo.json`
   `globalEnv`, `render.yaml` and `docs/environment-variables.md`.
5. State-changing operations call `AuditService.log()` with before/after
   snapshots.
6. Context docs that reference `gateway/`, `tools/zkteco-poc/` or
   `attendance-integrations` must be corrected, not propagated.

## What the specialist agent MUST verify before changing this

- `ls services/api/src/modules` — the module list drifts; do not trust this doc's
  enumeration for a decision.
- `grep -c '^model ' services/api/prisma/schema.prisma` and
  `ls services/api/prisma/migrations | wc -l` before quoting schema scale.
- `services/api/src/common/config/auth.config.ts` before touching anything
  token-, cookie- or client-id-related; the per-client branching is dense.
- `services/api/src/app.module.ts` to confirm a module is actually wired.
- Whether `gateway/` / `tools/` have reappeared before writing integration code
  that assumes either exists.
- The relevant nested `AGENTS.md` (`services/api/`, `services/api/prisma/`,
  `apps/web/`, `apps/admin/`, `packages/config/`) — they take precedence in
  their directory.
