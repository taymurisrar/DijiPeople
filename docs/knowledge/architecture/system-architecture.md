# System Architecture

> Generated from repository evidence at `ad8f77f`. The code is the source of
> truth; this is a readable map with pointers back to it.

## Shape

A **modular monolith**, not a microservice estate. One NestJS API, one
PostgreSQL database, three Next.js applications, one Electron agent, one
on-premise .NET gateway.

```
apps/landing   :3000  public site — marketing, leads, partner enquiry, plans
apps/web       :3001  tenant product — employees, managers, HR, payroll, admins
apps/admin     :3002  platform admin — DijiPeople's own SaaS operations
apps/docs      :3003  stock create-turbo starter — NOT part of the product
apps/agent-desktop     Electron workstation activity agent, its own auth client
services/api   :4000  NestJS 11, global prefix /api
packages/config        @repo/config — plain JS, no build step
gateway/               .NET on-premise integration gateway
tools/zkteco-poc/      ZKTeco device POC + .NET worker
e2e/                   Playwright browser journeys
```

Per-application detail: [[monorepo-application-map]].

Two corrections worth carrying, both verified at `78072d2`: `apps/docs` was
absent from this list entirely, and `agent-desktop` is an **activity** agent,
not an attendance one — it writes no attendance data at all
([[desktop-api-gateway-relationship]]). Module and model counts are deliberately
not quoted here; they go stale within days, so re-derive them.

Node 22, npm 11, npm workspaces + Turborepo.

`packages/database`, `packages/types` and `packages/utils` are **empty
directories** — not workspaces, no code. Shared backend code lives in
`services/api/src/common/`; shared frontend code in each app's `lib/` and
`app/components/`.

## Why a monolith

Every tenant shares one database and one API. The isolation boundary is a
`tenantId` column, not a deployment — see [[multi-tenancy]]. Splitting services
would multiply the number of places that boundary must be enforced correctly,
and it is already enforced by convention rather than by the database.

## The standing principles

1. **Preserve tenant isolation.** The most important invariant, with the least
   mechanical support.
2. **Extend the existing architecture; never build a competing one.** There is
   already a metadata-driven module runtime, a settings runtime, a permission
   matrix, an error catalog, an audit service and a notification orchestrator.
3. **Reuse existing domain services.** Cross-module needs are met by injecting
   the owning module's service, not by re-querying its tables.
4. **No duplicate sources of truth.** Permission keys, entity keys, settings
   catalogs, module registries and view definitions each have exactly one home.
   This repository's defect history is substantially a history of that rule
   being broken — see [[divergent-duplicate-guard]] and
   [[BUG-0011-signed-agreement-editable-defeating-the-lead-conversion-gate]].
5. **Preserve backward compatibility.** API shapes, permission keys, enum values
   and settings keys are consumed by three frontends, an Electron agent and a
   .NET gateway that is not upgraded in lockstep.
6. **Configuration over hardcoding.** Tenant-specific behaviour belongs in
   `tenant-settings` / `settings-runtime` / `customization`, never a code branch
   keyed on a tenant name or id.

## Related

[[multi-tenancy]] · [[authentication]] · [[rbac]] · [[api-architecture]] ·
[[database-architecture]] · [[runtime-module-system]] ·
[[tenant-workspace-routing]] · [[deployment-architecture]] ·
[[integration-architecture]] · [[qa-and-ci-architecture]] ·
[[agent-engineering-architecture]] · [[monorepo-application-map]] ·
[[landing-architecture]] · [[desktop-agent-architecture]] ·
[[desktop-api-gateway-relationship]] · [[docs-application]]

Source: root `AGENTS.md`, `.agent/context/system-overview.md`,
`.agent/context/repo-map.md`, `docs/architecture/`.
