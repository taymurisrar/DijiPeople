# Repository Map

> **Last verified:** 2026-08-17
> **Verified against commit:** 3f9063f
> **Key source files:** package.json, turbo.json, services/api/src/common/, apps/web/lib/runtime/, apps/admin/lib/, packages/config/index.js, packages/ui/src/, gateway/, tools/zkteco-poc/, e2e/, scripts/, docs/README.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

### Workspaces

Root `package.json`:

```json
"workspaces": ["apps/*", "packages/*", "services/*", "e2e"]
```

Actual workspace members at this commit:

```
apps/       admin, agent-desktop, docs, landing, web
packages/   config, eslint-config, typescript-config, ui
services/   api
```

**`packages/database`, `packages/types` and `packages/utils` do not exist at
this commit.** `ls packages` returns exactly the four directories above. They
are not npm workspaces, contain no code, and cannot be imported. (Git does not
track empty directories, so if they appear in a working tree they are stray
local artifacts — still empty, still not workspaces.) Do not import from them,
do not document them as existing, and do not create them without an ADR.

### Top-level layout

```
apps/
  landing/         Next.js — port 3000 — public marketing site
  web/             Next.js — port 3001 — tenant product
  admin/           Next.js — port 3002 — platform admin
  docs/            Next.js starter — effectively unused
  agent-desktop/   Electron attendance/activity agent
services/
  api/             NestJS 11 — port 4000 — global prefix /api
packages/
  config/            @repo/config — plain JS + .d.ts, no build step
  ui/                @repo/ui — button.tsx, card.tsx, code.tsx ONLY (not the design system)
  eslint-config/     base.js, next.js, react-internal.js
  typescript-config/ base.json, nextjs.json, react-library.json
scripts/           repo-level node scripts (ports, smoke, codegen, UAT probes)
docs/              repository documentation (see docs/README.md)
render.yaml        Render service definition for the API
turbo.json         task graph + globalEnv allowlist
AGENTS.md          primary agent instructions (CLAUDE.md is a one-line include)
PLANS.md           planning rules
DEPLOYMENT_CHECKLIST.md
.agent/agents/     10 agent role definitions (architect, backend-api, database,
                   frontend, integration, integrator, qa, release-devops,
                   reviewer, ui-ux) — there is no `implementer`
```

`gateway/` and `tools/` **both exist** — `git ls-files gateway tools` returns
**1,422 entries** at `78072d2` (gateway 1,387, tools 35).

> This paragraph previously read "There is **no `gateway/` and no `tools/`**
> directory at this commit (`git ls-files gateway tools` → 0 entries)." It was
> true when written and is now false. See
> [[BUG-0037-integration-patterns-context-denies-four-subsystems-that-exi]] —
> absence claims are the documentation that ages worst, because nothing breaks
> when they stop being true.

### Shared code — where it actually lives

- **Shared backend code:** `services/api/src/common/` —
  `config`, `constants`, `decorators`, `errors`, `excel`, `filters`, `guards`,
  `interfaces`, `mailer`, `middleware`, `prisma`, `reference-data`,
  `request-context`, `security`, `storage`, `utils`, `validation`.
- **Shared frontend code:** per app, never cross-app.
  - `apps/web/lib/` (`server-api.ts`, `auth*.ts`, `permissions.ts`,
    `security-keys.ts`, `branding.ts`, `routes.ts`, `runtime/`, `customization/`,
    `location/`) and `apps/web/app/components/` (`data-table/`, `runtime/`,
    `metadata/`, `ui/`, `views/`, `view-selector/`, `settings/`, `branding/`,
    `approvals/`, `command-bar/`, `dashboard/`, `entity-data/`, `errors/`,
    `feedback/`, `inbox/`, `notifications/`, `theme/`, `attendance-corrections/`).
  - `apps/admin/lib/` (`server-api.ts`, `platform-rbac.ts`,
    `platform-appearance.ts`, `auth-config.ts`, `runtime/`, `reference-data/`)
    and `apps/admin/app/_components/`.
- **Cross-workspace shared code:** only `@repo/config` (`packages/config/`),
  consumed by both the API (`main.ts`, `src/config/env.validation.ts`) and the
  Next apps.

### Route groups

- `apps/web/app/` — `(authenticated)`, `(public)`, plus `dashboard`, `partner`,
  `t`, `activate-account`, `api/` (thin proxies).
- `apps/admin/app/` — `(internal)`, plus `login`, `forgot-password`,
  `reset-password`, `access-denied`, `api/`.

## Key abstractions

- **`services/api/src/modules/<domain>/`** — `<domain>.module.ts`,
  `.controller.ts`, `.service.ts`, usually `.repository.ts`, a `dto/` folder,
  colocated `*.spec.ts`. Some modules subdivide (`billing/controllers`,
  `billing/services`, `notifications/email|jobs|processors|queues`).
- **`apps/web/lib/runtime/`** — the metadata-driven module runtime: registries
  (`module-registry.ts`, `metadata-registry.ts`, `command-registry.ts`,
  `solution-registry.ts`), resolvers (`*.resolver.ts`), and per-module adapters
  under `lib/runtime/modules/`.
- **`apps/web/app/(authenticated)/settings/_lib/`** — settings navigation,
  adapter registry, page config, runtime.
- **`packages/config/index.js`** — ports, app origins, CORS origins,
  `validateDeploymentEnv`, agreement categories; plus generated platform runtime
  schema/views/widget registry with their own `node --test` test files.

## "I need to change X → look here"

| Change | Start here |
|---|---|
| Backend endpoint / business rule | `services/api/src/modules/<domain>/` (controller thin, service owns rules) |
| Prisma query / include shape | `services/api/src/modules/<domain>/<domain>.repository.ts` |
| Schema, migration, seed | `services/api/prisma/` + `services/api/prisma/AGENTS.md` |
| Permission key | `services/api/src/common/constants/permissions.ts` and/or `rbac-matrix.ts` |
| Row-level access scoping | `services/api/src/common/security/rbac-query-scope.ts` |
| Auth token / cookie / client id | `services/api/src/common/config/auth.config.ts`, `common/guards/jwt-auth.guard.ts` |
| Error shape or new error code | `services/api/src/common/errors/`, `common/filters/http-exception.filter.ts` |
| Boot-time env requirement | `services/api/src/config/env.validation.ts`, `packages/config/index.js`, `turbo.json`, `render.yaml` |
| Email sending / templates | `services/api/src/modules/notifications/email/`, `common/mailer/` |
| Stripe / subscriptions / invoices | `services/api/src/modules/billing/`, `modules/super-admin/` |
| Electron agent API | `services/api/src/modules/agent/`, `apps/agent-desktop/src/main/` |
| Tenant product list/record page | `apps/web/lib/runtime/modules/` + `apps/web/app/components/runtime/` |
| Tenant product table behaviour | `apps/web/app/components/data-table/` |
| Tenant product form rendering | `apps/web/app/components/metadata/` |
| Tenant settings screen | `apps/web/app/(authenticated)/settings/_lib/` + API `modules/settings-runtime/` |
| Admin (platform) screen | `apps/admin/app/(internal)/`, `apps/admin/app/_components/crm/data-table.tsx` |
| Admin RBAC / role strings | `apps/admin/lib/platform-rbac.ts` |
| Ports / app URLs / CORS | `packages/config/index.js` |
| Deployment behaviour | `render.yaml`, `DEPLOYMENT_CHECKLIST.md`, `scripts/smoke-deployment.mjs` |

## Known exceptions

- `apps/docs` is a stock Next.js starter and is not part of the product.
- `packages/ui` contains three demo components (`button.tsx`, `card.tsx`,
  `code.tsx`). It is **not** the product design system — the design system is
  `apps/web/app/components/ui/` and the admin `_components/` kit.
- `apps/web/proxy.ts` and `apps/admin/proxy.ts` exist alongside `app/api/` route
  handlers; both are transport plumbing, never authorization authority.
- `services/api/prisma/seed-admin.js` sits next to `seed-admin.ts` (compiled
  artifact checked in).
- `services/api/prisma/seed-system.ts` exists but `seed:system` is scripted as an
  alias for `seed:config`.

## Anti-patterns to avoid

- Importing from `@repo/ui` for product UI.
- Creating `packages/types` / `packages/utils` "to share a type". Put backend
  shared code in `services/api/src/common/`, frontend shared code in that app's
  `lib/`.
- Sharing code between `apps/web` and `apps/admin` by relative path traversal.
  They deliberately have separate kits.
- Re-implementing an authorization or tenant decision in `app/api/` route
  handlers — the API is the authority.
- Adding a new top-level directory without an ADR under `docs/decisions/`.

## TARGET (required going forward)

1. New shared backend utility → `services/api/src/common/<area>/`, never a new
   package.
2. New tenant-product screen → a runtime adapter under
   `apps/web/lib/runtime/modules/`, rendered by `app/components/runtime/`.
3. New admin screen → `ProDataTable` / `Runtime*` components, never a hand-rolled
   table, form control or empty state.
4. Any new top-level path is recorded in this map and in root `AGENTS.md` in the
   same change.

## What the specialist agent MUST verify before changing this

- `ls packages` before assuming a shared package exists.
- `ls apps/web/app/components/<area>` and `ls apps/admin/app/_components` before
  writing any UI primitive — a duplicate is a review failure.
- The target app's `AGENTS.md` (`apps/web/AGENTS.md`, `apps/admin/AGENTS.md`) —
  they carry per-app component rules that override this map.
- `git status` before starting: the working tree frequently carries unrelated
  in-flight changes that must not be reverted, staged or committed.
