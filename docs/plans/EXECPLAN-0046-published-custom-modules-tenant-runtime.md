CONTEXT_FILES_REQUIRED:
  - AGENTS.md, services/api/AGENTS.md, apps/web/AGENTS.md
  - docs/decisions/ADR-0016-published-custom-modules-render-in-the-tenant-runtime.md (on the TASK-0031 records branch)
  - docs/architecture/record-page-layout-contract.md
  - .agent/context/multi-session.md

SPECIALIST_AGENTS_REQUIRED:
  - backend-api                         — runtime read path in the data module, published-state gate, endpoint decorators
  - frontend                            — sidebar composition, four runtime routes, record GET proxy
  - security                            — tenant scoping and permission denial on the /data endpoints
  - qa                                  — browser retest on the demo tenant after deploy (orchestrator)
DELIBERATELY_NOT_USED:
  - database                            — no schema change; existing indexes cover the list query
  - integration                         — no gateway, agent or Stripe contract is touched
  - ui-ux                               — screens are the standard runtime pages, no new layout

SINGLE_WRITER_FILES:
  - none. The plan deliberately reuses the existing `custom-records` entity and its derived
    legacy keys, so `permissions.ts`, `rbac-matrix.ts`, `security-keys.ts`, guards, schema
    and `app.module.ts` are not edited.

QA_REQUIRED: yes — new tenant-product surface and a permission-gated data path.

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/tenant-filter-missing.md
  - docs/qa/known-bug-patterns/authorization-missing.md
  - docs/qa/known-bug-patterns/service-authorization-hidden.md
  - docs/qa/known-bug-patterns/ui-permission-backend-mismatch.md
  - docs/qa/known-bug-patterns/read-filter-without-a-write-check.md
  - docs/qa/known-bug-patterns/fail-open-scope.md
  - docs/qa/known-bug-patterns/declared-but-unwired-step.md
  - docs/qa/known-bug-patterns/per-module-fix-behind-a-per-module-test.md

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-491 … REG-494 (reserved for this work package; REG-490 in the reserved range is already
    taken on develop by ITEM-0168 and is not used)

KNOWN_MISTAKES_TO_AVOID:
  - BUG-3374 / ITEM-0104 — customization routes verified by unit test only; this plan asks the
    orchestrator for a browser check of every new route, not only specs.
  - BUG-2623 — `ownerTeamId` scope field exists only on `CustomDataRecord`; keep
    `entity-scope.resolver.ts` passing it, do not add it anywhere else.
  - BUG-1952 — a sidebar shortcut above an entitlement check leaked modules; custom entries go
    through the same rule/feature/permission pipeline as fixed entries, never around it.
  - ITEM-0111 — a new top-level authenticated route must be added to
    `PROTECTED_ROUTE_PREFIXES` (`apps/web/lib/auth-config.spec.ts` enforces it).
  - ITEM-0167 — a new record detail route must be classified in
    `record-page-shell.conformance.spec.ts`.
  - read-filter-without-a-write-check — hiding a draft module from the sidebar is not enough;
    the data endpoints themselves must refuse an unpublished table.
  - Memory: "guard the seam, not the ends"; "a read filter is not an access control";
    "CRLF makes source-reading specs pass vacuously".

TARGET_BRANCH:            develop (via the TASK-0031 integration branch; the orchestrator merges)
TARGET_ENVIRONMENT:       LOCAL, then PRODUCTION at the orchestrator's release
DEPLOYMENT_REQUIRED:      yes (at release)
DEPLOYMENT_COMPONENTS:    api, web
DEPLOYMENT_ORDER:         api -> web
ROLLBACK_CLASS:           MULTI_COMPONENT_CONTRACT (code only; no data or schema change)
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  yes (orchestrator)
POST_DEPLOY_QA_REQUIRED:  yes — render "QA Asset" on the demo tenant
MERGE_STRATEGY:           merge --no-ff (orchestrator)
KNOWN_CONCURRENT_WORK:    WP-01 owns `settings/customization/**` and `customization-access.guard.ts`;
                          WP-03 owns `module-widget-renderer.tsx` and the employee runtime.
ENVIRONMENT_DEPENDENCIES: none

# ExecPlan — A published custom module renders in the tenant runtime

## Objective

When a tenant administrator publishes a custom module in Settings → Customization, every
user allowed to read it gets a sidebar entry, a list screen built from its published views,
and create, edit and record screens built from its published forms. All of these persist
through the existing generic `/data` API, scoped to `request.user.tenantId` and the
`custom-records` row scope. Drafts, deactivated modules and modules the user cannot read
never appear, and their routes answer not-found or access-denied rather than crashing. No
code names an individual module.

## Business requirement

BUG-3494, owner decision ADR-0016 (2026-09-13, USER_CONFIRMED D3): "Published custom modules
MUST get sidebar entry + list/form/record screens (part of P1 blocker fix)." Acceptance
criteria are copied from BUG-3494 into Requirements below.

`TODO: Confirm product/business rule.` — where a custom entry sits in the sidebar by default.
This plan places custom entries immediately before Settings (INFERENCE: Settings is the
administrative tail of the list, and the Sidebar Designer can move them).

## Existing behavior

- FACT: the sidebar is the code list `dashboardNavItems` in
  `apps/web/app/(authenticated)/_components/navigation.ts:28-161`. Tenant overrides are laid
  over it by `applyDashboardNavOverrides` (`:205-246`), which never adds entries.
- FACT: the Sidebar Designer (`settings/customization/_components/sidebar-designer.tsx:9,38-48`)
  lists only `dashboardNavItems`.
- FACT: overrides come from `GET /navigation/sidebar`
  (`services/api/src/modules/navigation/navigation.controller.ts:26-31`) and are loaded in
  `apps/web/app/(authenticated)/layout.tsx:168-170`.
- FACT: custom records are stored in `CustomDataRecord` (`schema.prisma:11168-11192`) and served
  by `CustomDataService` (`services/api/src/modules/data/custom-data.service.ts`), which is
  exposed by `DataController` (`data.controller.ts`): `GET/POST /data/:entity`,
  `PATCH/DELETE /data/:entity/:recordId`, `DELETE /data/:entity`. There is **no**
  `GET /data/:entity/:recordId`.
- FACT: `DataController` is guarded by `JwtAuthGuard` only (`data.controller.ts:20`). No
  handler declares `@Permissions`/`@RequirePermission`. Authorization is done inside the
  service by `EntityPermissionResolver.assertCan` (`entity-permission.resolver.ts:26-49`),
  which checks both the legacy key (`custom-records.read|create|write|delete`) and the matrix
  privilege on `ENTITY_KEYS.CUSTOM_RECORDS`.
- FACT: those legacy keys are not in `permissions.ts`. They are derived per role privilege as
  `${entityKey}.${privilege.toLowerCase()}` in
  `services/api/src/modules/auth/auth-access.service.ts:206-213`, and the matrix grants
  `custom-records:*` to system roles (`rbac-matrix.ts:656-983`; `SYSTEM_ADMIN` is `FULL_MATRIX`).
- FACT: row scope is already applied: `findMany` and `recordOrThrow` AND
  `buildScopedAccessWhere(custom-records, privilege)` with
  `{ tenantId: user.tenantId, tableId, isDeleted: false }` (`custom-data.service.ts:164-184,378-399`).
- FACT (defect): `findTable` (`custom-data.service.ts:624-639`) accepts any `isCustom && isActive`
  table. It never consults the publish snapshot, so a draft module's records are readable
  and writable through `/data`.
- FACT: published metadata is `CustomizationPublishSnapshot.snapshotJson` for the latest
  `status: 'published'` row, served by `GET /runtime-metadata/published`
  (`customization-runtime.controller.ts`, `customization.service.ts:370-393`). It has two shapes:
  - Package publish (Publish Center, `customization.service.ts:871-893`) stores
    `{ components, modules, fields, forms, views, publishedComponentIds, effectiveMetadata }`.
    `modules`/`fields`/`forms`/`views` hold only rows whose solution component is `published`
    (`getEffectiveMetadata`, `:927-1004`). The demo tenant's snapshot v1 is this shape.
  - Legacy `publish()` / `publishTenantDefaults()` (`:3405-3470`) store
    `{ tables, columns, views, forms }` with every row at publish time.
- FACT: `apps/web/lib/customization-forms.ts` and `customization-views.ts` already read
  `tables ?? modules` from that endpoint.
- FACT: no page under `apps/web/app/(authenticated)/` renders custom-table records. The
  web record proxy `apps/web/app/api/data/[entityLogicalName]/[recordId]/route.ts` has PATCH
  and DELETE only.

Must keep working: related-record subgrids through `/data` with `parentEntity` params
(`custom-data.service.ts:401-489`), `/metadata/entities/:name`, all fixed sidebar entries and
existing overrides.

## Existing architecture

- Runtime engine: `apps/web/lib/runtime/modules/standard-module-runtime.ts`
  (`StandardModuleRuntimeSpec`, `buildStandardModuleRuntimeContext`), route glue
  `standard-module-route-helpers.ts` (`resolveStandardActiveForm`, and the private
  `mapPublishedForm` that converts a published layout into `FormMetadata`), generic adapter
  `standard-module-data.adapter.ts` (`apiPath` → list/getById/create/update/softDelete).
- Pages: `app/components/runtime/standard-module-list-page.tsx`,
  `standard-module-record-page.tsx`. Reference routes: `app/(authenticated)/projects/**`.
- States: `(authenticated)/loading.tsx`, `(authenticated)/error.tsx`, `_components/access-denied-state.tsx`,
  `_components/record-not-found-state.tsx`; the data table's own empty message
  (`app/components/data-table/data-table.tsx:702`).
- API data module: `data.module.ts`, `custom-data.service.ts`, `entity-permission.resolver.ts`,
  `entity-scope.resolver.ts`, `metadata.controller.ts`/`metadata.service.ts`.

## Requirements

1. R1 — A custom module is runtime-available only if its table is `isCustom && isActive`
   **and** listed in the tenant's latest published snapshot (either shape). Its runtime fields
   are the live active columns that are also in the snapshot.
2. R2 — `GET /metadata/custom-modules` returns the runtime-available modules for the caller's
   tenant, gated by `custom-records` READ in both permission systems.
3. R3 — `GET /metadata/custom-modules/:moduleKey` returns one module's published definition:
   table labels, fields (after field-level read security), published active forms,
   published non-hidden views, and CRUD capabilities. Unpublished, inactive or other-tenant
   keys return 404.
4. R4 — `/data/:entity` list, create, update, delete and the new `GET /data/:entity/:recordId`
   refuse a table that fails R1 with 404. Draft columns are neither accepted nor required.
5. R5 — `POST`, `PATCH`, `DELETE` and the new record `GET` declare both `@Permissions` and
   `@RequirePermission` on `custom-records`, enforced by `PermissionsGuard`. The dispatching
   list `GET` keeps its in-service two-system check (see Permission impact).
6. R6 — Every runtime-available module the user can read appears in the sidebar, composed
   with the fixed list before overrides, so the Sidebar Designer's hide, order, rename and
   audience rules apply keyed by its href.
7. R7 — Routes `/custom-modules/[moduleKey]`, `/new`, `/[recordId]`, `/[recordId]/edit`
   render through `StandardModuleListPage`/`StandardModuleRecordPage`, from published
   metadata only.
8. R8 — On 403 a route renders `AccessDeniedState`, and on 404 `RecordNotFoundState`. It never
   renders the error boundary for either.
9. R9 — No module-specific code: a second module works with zero code changes (tested with
   two differently-shaped definitions).

## Dependencies

- BUG-3493 (publish must succeed) and BUG-3491 (customization access) are WP-01. The demo
  tenant already holds a published "QA Asset" snapshot, so this WP is testable without them.
- WP-01 must switch the Sidebar Designer's catalog and the Properties ROUTE value (both in
  `settings/customization/**`). Described in the stream report, not edited here.

## Files / modules affected

services/api:
- `src/modules/data/published-custom-modules.ts` (new, pure snapshot reader)
- `src/modules/data/published-custom-modules.spec.ts` (new)
- `src/modules/data/custom-module-runtime.service.ts` (new)
- `src/modules/data/custom-module-runtime.service.spec.ts` (new)
- `src/modules/data/custom-module-runtime.controller.ts` (new)
- `src/modules/data/custom-data.service.ts` (published gate, `findOne`)
- `src/modules/data/custom-data.service.spec.ts` (extended)
- `src/modules/data/data.controller.ts` (guard, decorators, record GET)
- `src/modules/data/data.controller.permissions.spec.ts` (new)
- `src/modules/data/data.module.ts` (register controller/service)
- `test/custom-module-runtime.e2e-spec.ts` (new, DB-backed)

apps/web:
- `lib/runtime/custom-modules/custom-module-runtime.ts` (new, pure)
- `lib/runtime/custom-modules/custom-module-runtime.spec.ts` (new)
- `lib/runtime/custom-modules/custom-module-navigation.ts` (new, pure)
- `lib/runtime/custom-modules/custom-module-navigation.spec.ts` (new)
- `lib/runtime/custom-modules/custom-module-api.ts` (new, server-only fetch helpers)
- `lib/runtime/modules/standard-module-route-helpers.ts` (export `mapPublishedForm`)
- `app/(authenticated)/_components/navigation.ts` (accept custom entries)
- `app/(authenticated)/_components/navigation.spec.ts` (extended)
- `app/(authenticated)/_components/dashboard-sidebar.tsx` (pass-through prop)
- `app/(authenticated)/layout.tsx` (fetch custom modules)
- `app/(authenticated)/custom-modules/[moduleKey]/page.tsx`, `new/page.tsx`,
  `[recordId]/page.tsx`, `[recordId]/edit/page.tsx` (new)
- `app/(authenticated)/_components/record-page-shell.conformance.spec.ts` (classify new route)
- `app/api/data/[entityLogicalName]/[recordId]/route.ts` (add GET)
- `lib/auth-config.ts` (`/custom-modules` protected prefix)

## Database impact

None. PROPOSAL rejected: an index for list queries. FACT: `@@index([tenantId, tableId, isDeleted])`
already exists (`schema.prisma:11187`), which is the list predicate. The snapshot lookup uses
`@@index([tenantId, status])` (`:11377`).

## Backend impact

- `published-custom-modules.ts`: `readPublishedCustomizationIndex(snapshotJson)` → `{ tables,
  columnIds, forms, views }`, tolerant of both shapes; `null` for absent or malformed input
  (fail closed: no modules).
- `CustomModuleRuntimeService` (data module; injects `PrismaService`,
  `EntityPermissionResolver`):
  - `resolvePublishedTable(tenantId, key)` → live table (active custom, key match
    case-insensitive on `tableKey`/`systemName`, as today) whose id is in the index, with
    columns filtered to published ids; else `null`.
  - `listModules(user)` → `[{ moduleKey, displayName, pluralDisplayName, icon, displayOrder }]`.
  - `getModule(user, key)` → definition or `NotFoundException`.
  - Reads the snapshot with `findFirst({ tenantId: user.tenantId, status: 'published' }, orderBy version desc)`.
    INFERENCE: this duplicates one query from `CustomizationService.getPublished`. Injecting
    `CustomizationService` would pull `CustomizationModule` (and its access guard, WP-01)
    into `DataModule` to share a 4-line query. `CustomDataService` already reads
    `customizationTable` directly (`custom-data.service.ts:625`), so the data module already
    reads customization metadata. Comment the reason in code.
- `CustomDataService`: `findTable` delegates to `resolvePublishedTable`. Add
  `findOne(entity, recordId, user)` = `tableOrThrow` + `assertCan(READ)` +
  `recordOrThrow(READ)` + `toPublicRecord`.
- `CustomModuleRuntimeController` `@Controller('metadata/custom-modules')`,
  `@UseGuards(JwtAuthGuard, PermissionsGuard)`: `GET /` and `GET /:moduleKey`, both
  `@Permissions('custom-records.read')` + `@RequirePermission(ENTITY_KEYS.CUSTOM_RECORDS, 'read')`.
- `DataController`: class guards `JwtAuthGuard, PermissionsGuard`. `POST` → create, `PATCH` →
  write, both `DELETE` → delete, new `GET :entity/:recordId` (`ParseUUIDPipe`) → read.
- Responses: definition `{ moduleKey, displayName, pluralDisplayName, icon, primaryNameField,
  fields: [{ logicalName, displayName, dataType, required, readOnly, maxLength, options,
  lookupTargetTableKey }], forms: [{ id, formKey, name, type, isDefault, layoutJson }],
  views: [{ id, viewKey, name, isDefault, columnsJson, filtersJson, sortingJson }],
  capabilities: { create, update, delete } }`. Record: unchanged `toPublicRecord` shape.
- Transactions and audit are unchanged: create, update and delete already audit inside `$transaction`.

## Frontend impact

- App: `apps/web`, module runtime, no bespoke screen.
- `buildCustomModuleRuntimeSpec(definition)` produces a `StandardModuleRuntimeSpec` with
  `moduleKey = custom-modules/<key>` and `routeBase = /custom-modules/<key>` (so the
  `"/{moduleKey}/new"` command template in `command-execution.service.ts:243` and `routeBase`
  agree, as `apps/web/AGENTS.md` requires), `apiPath = /api/data/<key>`, fields mapped from customization types
  (text→string, textarea→multiline-string, select→optionset, multiselect→multi-optionset,
  others 1:1), views from `columnsJson`/`filtersJson`/`sortingJson` (unknown columns dropped;
  a module with no published view gets one view of its first eight fields), `primaryNameField`
  from the definition. Published forms are mapped with the shared `mapPublishedForm` and
  replace the spec's generated forms in `runtime.metadata.forms`.
- The adapter only needs `apiPath`; `moduleKey` never equals any of the nine hardcoded adapter
  branches, so none fire (FACT: branches compare against fixed product keys,
  `standard-module-data.adapter.ts:37-190,990-1019`).
- States: route-level `loading.tsx`/`error.tsx` of `(authenticated)` apply; 403 →
  `AccessDeniedState`; 404 → `RecordNotFoundState`; empty list → data table empty message.
- No explanatory copy is added. Titles are the module's own display names.
- Responsive and accessible: inherited from the standard runtime pages; sidebar entries reuse
  `SidebarNavItem` (icon fallback `Briefcase`).

## Permission / RBAC impact

- Chosen model: **generic `custom-records` privileges** (existing entity
  `ENTITY_KEYS.CUSTOM_RECORDS`, legacy keys derived `custom-records.read|create|write|delete`).
  No new keys, no matrix edits, no seed change. Roles that already hold `custom-records:*`
  (system-admin, global-admin, system-customizer, CEO read, manager BU, HR/others per
  `rbac-matrix.ts`) receive access to every published custom module.
- Rejected: per-module keys derived at publish. They would need catalog rows and role grants
  written at publish time (runtime writes to the permission model), a second source of truth
  for keys, and edits to single-writer files. Finer control already exists per field
  (`validationJson.readPermission/writePermission`, `custom-data.service.ts:116-139,537-543`).
  A per-module audience can be expressed with Sidebar Designer rules for navigation only.
  `TODO: Confirm product/business rule.` if the owner needs per-module record access.
- Decorators: both on every custom-only handler (R5). The list `GET /data/:entity` dispatches
  between the static registry (`employees.read`) and custom tables, so no single static
  decorator is correct. It keeps `assertCan`/`assertCanRead`, which evaluate the same two
  systems (FACT, `entity-permission.resolver.ts`). Its `hasElevatedTenantRole` handling
  differs from the guard: `resolveEffectiveAccessLevel` returns TENANT for elevated roles,
  but the legacy key must still be held. Elevated roles hold it via `FULL_MATRIX`.
- Row scope: `buildScopedAccessWhere(user, 'custom-records', privilege, CUSTOM_METADATA.scope)`
  on list (READ), record read (READ), update (WRITE), delete (DELETE) —
  `custom-data.service.ts:164-172,384-395`. Create stamps owner/BU/org from the caller
  (`resolveCreateScope`, `:491-517`).
- Elevated bypass: unchanged, not extended.
- `apps/web/lib/security-keys.ts`: not edited. The sidebar uses the literal derived key
  `custom-records.read` from one constant in `custom-module-navigation.ts`, which is cosmetic.

## Tenant-isolation impact

- Snapshot read: `where: { tenantId: user.tenantId, status: 'published' }`.
- Table read: `customizationTable.findFirst({ tenantId: user.tenantId, isCustom, isActive, key })`,
  then id ∈ that tenant's snapshot.
- Records: every query ANDs `{ tenantId: user.tenantId, tableId: table.id }` with the scope where.
  The new record GET uses `findFirst` with `{ id, tenantId, tableId, isDeleted: false }`, never
  `findUnique`.
- No `tenantId` is accepted from input. There is no platform path.
- Reviewer check: grep `custom-module-runtime.service.ts` and `custom-data.service.ts` for
  `tenantId:`, where every Prisma call carries `user.tenantId`. The e2e spec creates the same
  `tableKey` in two tenants and proves B cannot list or read A's record.

## Audit / event / logging impact

Unchanged: `custom-record.create|update|delete` audits with before/after snapshots inside the
transaction. The new endpoints are reads and are not audited, which matches every other read.
Nothing new is logged. Record values are not logged.

## Integration impact

None. The desktop agent, gateway and Stripe are not involved.

## Migration / data compatibility

- A draft custom module whose records were created through `/data` before this change can no
  longer read or write them until it is published. INFERENCE: the only caller is the
  related-record subgrid on published forms, so a draft table has no reachable UI today. It
  is a deliberate tightening (ADR-0016 Agent Rules).
- The demo tenant's "QA Asset" becomes visible on deploy without any customization step.
- API-before-web: the new endpoints are unused and harmless. Web-before-API: the layout
  catches the 404 of `/metadata/custom-modules` and shows no custom entries, and custom routes
  render not-found.

## Parallel-safe tasks

- PARALLEL_SAFE — API snapshot reader + runtime service + controller + specs.
- PARALLEL_SAFE — web pure composition and spec builders + specs (against the contract above).

## Dependency-blocked tasks

- DEPENDENCY_BLOCKED — Sidebar Designer catalog and Properties ROUTE (WP-01-owned files); unblocked
  by WP-01 applying the change described in the stream report.

## Integration tasks

- INTEGRATION — layout/sidebar wiring, four routes, proxy GET, protected prefix, conformance list.
- INTEGRATION — DB-backed e2e and browser verification on a throwaway DB (orchestrator).

## Testing strategy

- `npm --workspace api run test -- data/` (with a dummy `DATABASE_URL`):
  - `published-custom-modules.spec.ts` — both snapshot shapes, malformed input, draft absence.
  - `custom-module-runtime.service.spec.ts` — published vs draft vs inactive vs other key vs
    no permission; draft columns excluded; hidden views excluded; field read security.
  - `custom-data.service.spec.ts` — unpublished table 404 on list/create/findOne; `findOne`
    where carries `tenantId` from the user plus scope; draft required column not enforced.
  - `data.controller.permissions.spec.ts` — reflector metadata on each custom-only handler
    carries both systems; `PermissionsGuard` denies a user without `custom-records.create`.
- `npm --workspace api run check-types`; `npx eslint --fix` on changed api files.
- `npm --workspace web run test -- custom-module navigation auth-config record-page-shell`:
  - `custom-module-navigation.spec.ts` — composition position, overrides apply to custom
    hrefs, no-permission hides, privileged sees, empty list leaves the fixed nav untouched.
  - `custom-module-runtime.spec.ts` — route/api paths from key, type mapping, view columns and
    filters, fallback view, form mapping and active form, second differently-shaped module.
- `npm --workspace web run check-types`; `npx eslint --fix` on changed web files.
- DB-backed: `services/api/test/custom-module-runtime.e2e-spec.ts` (orchestrator runs on a
  throwaway database): two tenants, same `tableKey`, published snapshot in A only for one table.
  Create/list/read in A; B lists nothing and reads 404; unpublished table 404; module list per tenant.
- Manual (orchestrator, demo tenant after deploy): steps in the stream report.

## Risks

1. Cross-tenant read through the new record GET — likelihood low, impact critical;
   `findFirst` with tenantId + scope, and the e2e test covers it.
2. Permission regression on `/data` for existing subgrid callers who hold matrix READ but not
   the derived legacy key — likelihood low (the key is derived from the same privilege);
   impact medium; the service already required both, so the guard adds no new requirement.
3. Draft tables used by a subgrid stop working — likelihood low, impact low; intended.
4. Snapshot shape drift (a third shape) — likelihood medium over time; fails closed (no
   modules) and has a spec for each known shape.
5. Lookup fields to system entities render without options — BUG-3492 keeps lookups
   uncreatable today; residual, reported.
6. The Sidebar Designer cannot list custom entries until WP-01 applies the described change —
   entries still show and honour any override keyed by href.

## Rollback considerations

Code-only revert of api and web. There is no migration and no data change. If web ships without
api, custom entries are absent and routes show not-found. If api ships without web, nothing
is visible, and draft-table `/data` access is refused (intended).

## Definition of Done

- [ ] ExecPlan committed before implementation.
- [ ] R1–R9 implemented; no per-module code.
- [ ] Both permission systems declared on every custom-only handler; row scope unchanged and cited.
- [ ] Tenant scoping verified in unit tests and the DB-backed e2e spec written.
- [ ] Specs above pass; api and web check-types pass; eslint --fix applied.
- [ ] Stream report `docs/tasks/TASK-0031-streams/WP-02-report.md` with root cause, fix, tests,
      REG-491..494 entry text, QA retest steps, residual risks and the WP-01 hand-off.
- [ ] No edits to WP-01/WP-03-owned files or single-writer files; no unrelated changes.
