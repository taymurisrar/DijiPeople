# Architecture

Implementation-facing architecture documentation for DijiPeople. These describe
**how the system is actually built**, verified against the code at the time of
writing. Where something could not be confidently determined, the document says
so rather than guessing.

## Snapshot documents

| Document | Scope |
|---|---|
| [`tenancy.md`](tenancy.md) | Multi-tenancy model, how `tenantId` flows, what does and does not enforce isolation |
| [`authentication.md`](authentication.md) | JWT access/refresh, per-client auth, sessions, cookies, timeouts |
| [`rbac.md`](rbac.md) | The two coexisting permission systems and row-level access scoping |
| [`audit-events.md`](audit-events.md) | Audit logs, platform events, notifications, error logging, tracing |
| [`backend.md`](backend.md) | NestJS structure, module conventions, request lifecycle, errors, transactions |
| [`frontend.md`](frontend.md) | The three Next.js apps, module runtime, settings runtime, shared components |
| [`database.md`](database.md) | Prisma setup, schema conventions, migrations, seeds |
| [`tenant-control-plane.md`](tenant-control-plane.md) | Platform Admin's control plane over a tenant: lifecycle, access identities, module entitlement, apps, provisioning runs, erasure |
| [`workspace-routing-and-domains.md`](workspace-routing-and-domains.md) | **Canonical** for hostname → tenant routing, workspace slugs, custom domains, environments, and the production DNS/TLS checklist |

## Pre-existing design contracts

These predate the snapshot set and remain authoritative in their areas:

| Document | Scope |
|---|---|
| [`settings-and-branding.md`](settings-and-branding.md) | **Canonical** for tenant settings, branding, User/Employee boundary, work configuration, attendance schedule resolution |
| [`module-runtime-overhaul.md`](module-runtime-overhaul.md) | The metadata-driven module runtime |
| [`tenant-settings-attendance-runtime.md`](tenant-settings-attendance-runtime.md) | Settings/attendance runtime implementation companion |

Where a snapshot document and one of these disagree, the design contract wins —
and the snapshot is a bug to fix.

## Reading order for a new agent

1. [`backend.md`](backend.md) — how the API is shaped
2. [`tenancy.md`](tenancy.md) — the invariant that matters most, then
   [`workspace-routing-and-domains.md`](workspace-routing-and-domains.md) for how
   a request becomes a tenant in the first place
3. [`rbac.md`](rbac.md) — how authorization actually works
4. [`database.md`](database.md) — before touching the schema
5. [`frontend.md`](frontend.md) — before touching a screen
6. [`audit-events.md`](audit-events.md) — before adding a mutation

## Maintaining these

Update the relevant document in the same change that alters the architecture. A
snapshot that describes a system that no longer exists is worse than no
snapshot — that is the failure mode the previous duplicated `apps/*/AGENTS.md`
demonstrated.
