# Skills Assessment

A **Skill** is a packaged, repeatable procedure an agent can invoke instead of
re-deriving a multi-step convention each time. Skills are worth building only
where the pattern is genuinely repetitive, mechanical enough to describe
precisely, and expensive to get wrong.

**No Skills have been created yet — deliberately.** This document records the
first five worth building, each justified by a pattern actually observed in this
repository. Build them one at a time, after the workflow in
[`../../AGENTS.md`](../../AGENTS.md) and [`../../PLANS.md`](../../PLANS.md) has
been used on real work.

Ranked by expected value.

---

## 1. `review-tenant-isolation`

**Trigger** — any backend change touching a query, before merge. Should also be
runnable as a standalone audit over a module.

**Why it is worth automating.** Tenant isolation in DijiPeople is enforced only
by the `where` clause an engineer remembers to write. There is no RLS, and the
Prisma `$use` middleware does not run on Prisma 7. Across 68 modules and 285
models, this is the same check repeated hundreds of times, it is mechanical, and
a single miss is a data breach. Nothing else in the repository catches it.

**Inputs** — a diff, or a module path.

**Steps**
1. Find every Prisma call in scope (`findMany`, `findFirst`, `findUnique`,
   `count`, `create`, `update`, `updateMany`, `delete`, `deleteMany`,
   `aggregate`, `groupBy`).
2. For each, determine whether the model is tenant-owned (has `tenantId` in
   `schema.prisma`).
3. For tenant-owned models, confirm a `tenantId` filter exists and traces back
   to `request.user.tenantId` — not a DTO field, param, query or header.
4. Flag every `findUnique` by bare id on a tenant-owned model.
5. Flag writes not scoped by `tenantId`.
6. Confirm background jobs, queue processors and seeds receive `tenantId`
   explicitly.
7. Identify deliberate cross-tenant (platform-path) access and check it is
   guarded.

**Validation** — output a table of call sites with verdicts, and a list of
CRITICAL findings. Cross-check against
[`../architecture/tenancy.md`](../architecture/tenancy.md).

**Repetitiveness** — every backend change, forever.

---

## 2. `implement-rbac`

**Trigger** — adding or changing a permission on an endpoint.

**Why it is worth automating.** The permission wiring here is a **seven-step
sequence across five files**, and skipping any step produces a defect that only
appears on a fresh environment or as a silent authorization hole. The two
permission systems (`@Permissions` + `@RequirePermission`) and the manual
frontend mirror make this the most error-prone repeated procedure in the
codebase.

**Inputs** — entity key, privilege(s), which roles should receive it, the
endpoint(s), whether the UI needs to gate on it.

**Steps**
1. Add the key to `services/api/src/common/constants/permissions.ts`.
2. Add/extend the entity–privilege entry in
   `services/api/src/common/constants/rbac-matrix.ts`, with access levels.
3. Grant to the intended system roles in `prisma/seed-config.ts`.
4. Assert it in `prisma/verify-seed-config.ts`.
5. Decorate the endpoint with **both** decorators.
6. Apply `buildScopedAccessWhere()` in the service.
7. Mirror into `apps/web/lib/security-keys.ts` only if the UI gates on it.

**Validation** — `npm --workspace api run test` (the `rbac-matrix*.spec.ts`
suite), `npm --workspace api run test:e2e` for
`permission-propagation.e2e-spec.ts`, `npm --workspace api run check-types`.

**Repetitiveness** — every new endpoint and every permission change.

---

## 3. `create-prisma-entity`

**Trigger** — adding a new tenant-owned model.

**Why it is worth automating.** The conventions are strict and unforgiving:
uuid PK, `tenantId` + cascade relation, tenant-scoped composite uniqueness,
`@@index([tenantId])` plus filter indexes, timestamps, actor columns, explicit
`onDelete`, `Decimal` for money. Missing tenant-scoped uniqueness or a
`tenantId` index is not caught by any test and is expensive to fix after data
exists. There are 285 models following this shape — the pattern is well
established and mechanical.

**Inputs** — model name, fields and types, relations, which columns lists filter
and sort by, whether soft delete applies.

**Steps**
1. Write the model in `schema.prisma` following the conventions in
   [`../../services/api/prisma/AGENTS.md`](../../services/api/prisma/AGENTS.md).
2. Add indexes for every declared filter/sort column, prefixed by `tenantId`.
3. Add tenant-scoped composite uniqueness.
4. Generate the migration (never hand-write it).
5. `npm run prisma:validate` and `npm run prisma:generate`.
6. If the model is exposed to the platform runtime, run
   `npm run generate:runtime-schema` and `npm run test:runtime-schema`.
7. Report whether a backfill is needed.

**Validation** — `prisma:validate`, `prisma:generate`, `npm run typecheck`.

**Repetitiveness** — every new entity, and the mistakes are permanent.

---

## 4. `create-module-screen`

**Trigger** — adding a list/record screen to `apps/web`.

**Why it is worth automating.** The metadata-driven runtime is the intended path
and has a fixed registration sequence — spec, adapter, module registry, command
registry, route, navigation, navigation spec. The failure mode is well known and
already documented: an agent that does not know the runtime writes a bespoke
page with its own table and its own data path, creating exactly the duplication
[`../architecture/module-runtime-overhaul.md`](../architecture/module-runtime-overhaul.md)
exists to prevent.

**Inputs** — module key, entity, columns, filters, commands, permissions,
related records.

**Steps**
1. Extend `apps/web/lib/runtime/modules/standard-module-specs.ts`.
2. Add a data adapter only if the standard adapter cannot serve it.
3. Register in `module-registry.ts` (and `command-registry.ts` if applicable).
4. Create the route rendering `StandardModuleListPage` /
   `StandardModuleRecordPage`.
5. Add navigation in `app/(authenticated)/_components/navigation.ts` and extend
   `navigation.spec.ts`.
6. Confirm loading, error, empty and access-denied states are covered.
7. Report explicitly if a bespoke page was required, and why.

**Validation** — `npm --workspace web run test`,
`npm --workspace web run check-types`.

**Repetitiveness** — every new tenant-product screen.

---

## 5. `implement-audit-logging`

**Trigger** — adding or changing a state-changing operation.

**Why it is worth automating.** `AuditService.log()` is called at 165 sites
across 60 services, always in the same shape, and always with the same easy
mistakes: forgetting the transaction client (so the audit row survives a
rollback), omitting snapshots, inventing a new action name for an existing
concept, or leaking sensitive fields into a snapshot. Nothing enforces audit
coverage, so this is exactly where a checklist pays.

**Inputs** — module, operation, entity type, what changed.

**Steps**
1. Determine whether the operation warrants an audit row (would a tenant admin
   or auditor need to see it?).
2. Choose a `SCREAMING_SNAKE_CASE` action name, checking existing names first so
   an established concept is not renamed.
3. Capture `beforeSnapshot` and `afterSnapshot` — changed fields plus context,
   never secrets, tokens, hashes or full bank details.
4. Pass the transaction client when inside `$transaction`.
5. Set `sourceModule`, and `requestId`/`traceId` where available.
6. Decide whether a platform event or notification event is also required.

**Validation** — `npm --workspace api run test`; confirm against
[`../architecture/audit-events.md`](../architecture/audit-events.md).

**Repetitiveness** — every mutation.

---

## Considered and deferred

| Candidate | Why not yet |
|---|---|
| `create-admin-module` | The platform runtime registration sequence is real and repetitive, but `apps/admin`'s module set is largely complete. Revisit if new platform modules become frequent. |
| `create-api-module` | Full-module scaffolding is high-variance — the larger domains subdivide by concern in ways a template would fight. The narrower Skills above cover the mechanical parts. |
| `write-execplan` | `PLANS.md` already is the procedure. Wrap it as a Skill only if the Architect role proves to skip sections in practice. |
| `add-tenant-setting` | Likely valuable, but the settings runtime spans a canonical contract document, a catalog, an adapter registry and API-side resolution. Understand it through real use before freezing it into a Skill. |
| `add-environment-variable` | A six-step checklist across `@repo/config`, `turbo.json`, `render.yaml`, docs and `.env.example` files. Small enough to stay a checklist in `packages/config/AGENTS.md` for now. |
| `run-validation` | The commands are already listed in `AGENTS.md`. A Skill would add indirection, not value. |

## Before building any of these

1. Use the documented workflow on two or three real changes first.
2. Note where agents actually stumble — that is the evidence for which Skill to
   build, and it may not match this ranking.
3. Build one, use it, correct it, then build the next.
4. A Skill that encodes a convention which later changes is a stale instruction
   with extra steps. Keep each one short, and reference the `AGENTS.md` files
   rather than copying their content.
