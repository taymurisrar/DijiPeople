# TASK-0031 — WP-02 stream report: published custom modules in the tenant runtime

- Branch: `agent/walkthrough2-custom-runtime` (base `origin/develop` 88f33c6e)
- ExecPlan: `docs/plans/EXECPLAN-0046-published-custom-modules-tenant-runtime.md`
- Binding decision: ADR-0016
- Reserved regression ids: REG-490 … REG-494. **REG-490 is already used on develop**
  (`docs/qa/regressions/index.md`, ITEM-0168 retry control), so this stream uses
  REG-491 … REG-494 only.

## BUG-3494 — A published custom module has no sidebar entry and no list, form or record screen

Status from this stream: **PARTIAL**. The runtime, sidebar, data gate and
permissions are done and tested. Two WP-01-owned changes and the published action
bar are still open; see below.

### Root cause

1. No consumer of published custom-module metadata existed in the tenant product.
   - The sidebar was the code list `dashboardNavItems`
     (`apps/web/app/(authenticated)/_components/navigation.ts:28-161`), and
     `applyDashboardNavOverrides` (`:205-246`) can only change entries in that list.
   - No route under `apps/web/app/(authenticated)/` rendered custom-table records.
2. Found while fixing: the data API had no published-state gate.
   `CustomDataService.findTable` (`services/api/src/modules/data/custom-data.service.ts:624-639`
   at 88f33c6e) accepted any active custom table. A draft module's records could be
   listed, created, edited and deleted through `/data` before anyone published it.
3. Found while fixing: the endpoint was authorized only inside the service.
   `DataController` (`data.controller.ts:20` at 88f33c6e) ran `JwtAuthGuard` only,
   with no `@Permissions`/`@RequirePermission`. There was also no
   `GET /data/:entity/:recordId` for a record screen.

### Fix summary

API (`services/api/src/modules/data/`):
- `published-custom-modules.ts` reads the latest published snapshot in both
  production shapes and fails closed:
  - the Publish Center shape: `effectiveMetadata.modules/fields/forms/views`;
  - the legacy `publish()` shape: `tables/columns/forms/views`.
- `custom-module-runtime.service.ts` defines "runtime-available": a live table that
  is `isCustom && isActive`, belongs to the caller's tenant, and appears in that
  tenant's latest published snapshot. Columns are narrowed to published ones.
  - `GET /metadata/custom-modules` returns the sidebar list.
  - `GET /metadata/custom-modules/:moduleKey` returns the definition: fields after
    field read security, active forms, non-hidden views, and capabilities.
  - Both declare `custom-records.read` in both permission systems, behind
    `PermissionsGuard` (`custom-module-runtime.controller.ts`).
- `CustomDataService.findTable` now delegates to that definition, so every record
  path returns 404 for a draft or deactivated module. New `findOne` reads with
  `findFirst({ id, tenantId: user.tenantId, tableId, isDeleted: false })`, ANDed
  with the `custom-records` READ row scope.
- `DataController` changes:
  - New `GET :entity/:recordId` (`ParseUUIDPipe`).
  - `PermissionsGuard` plus both decorators on every custom-only handler: record
    GET (read), POST (create), PATCH (write), both DELETEs (delete).
  - The dispatching list `GET /data/:entity` is unchanged and stays on the
    reviewed service-authorized list in `wiring-invariants.spec.ts`. It serves
    both `employees` and custom tables, and each branch asserts both systems in
    `EntityPermissionResolver`.
- Permission model: the existing `custom-records` entity. Its legacy keys are
  derived from matrix privileges in `auth-access.service.ts:206-213`. No
  single-writer file was edited, no key was added, and seeds are unchanged.

Web (`apps/web`):
- `lib/runtime/custom-modules/custom-module-navigation.ts` handles the sidebar:
  - It builds entries (`/custom-modules/<key>`, label = plural display name,
    `requiredAnyPermissions: ["custom-records.read"]`).
  - It composes them into the catalog before Settings. `navigation.ts` applies
    overrides to that composed catalog (`resolveDashboardNavCatalog`), so Sidebar
    Designer hide, order, rename and audience rules keyed by href apply.
  - `layout.tsx` fetches the list only for holders of the read key, avoiding a
    403 error-log row on every page for everyone else. It passes the list through
    `dashboard-sidebar.tsx`.
- `lib/runtime/custom-modules/custom-module-runtime.ts` turns the definition into a
  `StandardModuleRuntimeSpec`:
  - `routeBase /custom-modules/<key>`, `moduleKey custom-modules/<key>`,
    `apiPath /api/data/<key>`.
  - It maps field types and builds list views from `columnsJson`/`filtersJson`/
    `sortingJson`, dropping unknown columns. A module with no view gets one of its
    first fields.
  - Published forms go through the now-exported `mapPublishedForm`. Placements of
    columns the definition does not carry are dropped.
- Routes under `app/(authenticated)/custom-modules/[moduleKey]/`: `page.tsx` (list),
  `new/page.tsx`, `[recordId]/page.tsx`, `[recordId]/edit/page.tsx`.
  - Pages use `StandardModuleListPage` / `StandardModuleRecordPage`.
  - A 403 renders `AccessDeniedState`; a 404 renders `RecordNotFoundState`
    (`custom-modules/_components/custom-module-unavailable.tsx`). No new copy was
    added.
  - Route shape: `tableKey` is unique per tenant and immutable, so one stable URL
    serves every module. The prefix cannot collide with a product route.
- `app/api/data/[entityLogicalName]/[recordId]/route.ts` gains GET, forward-only.
- `lib/auth-config.ts` adds `/custom-modules` to `PROTECTED_ROUTE_PREFIXES`
  (ITEM-0111 spec).
- `record-page-shell.conformance.spec.ts` changes:
  - The record route is listed as conforming.
  - The list route is a justified exception, because its dynamic segment is the
    module key.

### Tests added / extended

API unit (`npm --workspace api run test`):
- `services/api/src/modules/data/published-custom-modules.spec.ts` — both shapes,
  inactive forms and hidden views dropped, fail-closed inputs.
- `services/api/src/modules/data/custom-module-runtime.service.spec.ts` — published vs
  draft vs inactive vs never-published, tenant-scoped snapshot and table queries,
  permission denial in each system, field security, hidden views.
- `services/api/src/modules/data/custom-data.service.spec.ts` (extended) — list,
  create, read-one, update and delete of a non-runtime-available module return 404
  and touch no record. `findOne` where-shape (tenant + table + scope), out-of-scope
  404, permission checked before read.
- `services/api/src/modules/data/data.controller.permissions.spec.ts` — the real
  decorator metadata, and the real `PermissionsGuard` denying legacy-only and
  matrix-only callers on every custom-only handler; reader cannot create.

Web unit (`npm --workspace web run test`):
- `apps/web/lib/runtime/custom-modules/custom-module-navigation.spec.ts` — entry
  building, position before Settings, no product-href shadowing, visible with
  read, hidden without, privileged sees, API-omitted (draft/inactive) absent,
  designer hide, rename+order and audience rule applied to the custom href.
- `apps/web/lib/runtime/custom-modules/custom-module-runtime.spec.ts` — route
  metadata resolution for QA Asset: paths, writable fields equal the published
  column keys (the payload shape `validateValues` receives), type mapping, view
  columns, filters and sort, fallback view, form mapping and active form, generated
  form fallback, record title. A second, differently shaped module needs zero code
  changes.

DB-backed (orchestrator, throwaway DB):
- `services/api/test/custom-module-runtime.e2e-spec.ts` — two tenants with the same
  `tableKey`. Covers: list per tenant (draft excluded); create, list and read in A;
  B lists nothing and reads 404; B update/delete 404 with A's row unchanged; SELF
  reader sees nothing of another user's record; unpublished module 404; no
  privileges 403; deactivation removes A's module and leaves B's.
  Run: `DATABASE_URL=… npm --workspace api run test:e2e -- custom-module-runtime`.

Proven to fail without the fix: the new cases in `custom-data.service.spec.ts` were
run against the pre-fix `custom-data.service.ts` (mutation check). The
unpublished-module cases fail there because the old `findTable` returns the draft
table. The runtime and navigation specs cover code that did not exist.

### Regression entries

### REG-491 — A draft custom module's records were readable and writable through `/data`

| | |
|---|---|
| **Bug class** | `read-filter-without-a-write-check` |
| **Module** | `services/api/src/modules/data` |
| **Bug record** | BUG-3494 |
| **Root cause** | `CustomDataService.findTable` accepted any `isCustom && isActive` table and never consulted the publish snapshot, so `GET/POST/PATCH/DELETE /data/<draftTableKey>` worked for a module no one had published. Hiding drafts from navigation alone would have been a read filter over a working write path. |
| **Regression test** | `services/api/src/modules/data/custom-data.service.spec.ts` ("a module that is not runtime-available"), `services/api/src/modules/data/custom-module-runtime.service.spec.ts`, `services/api/test/custom-module-runtime.e2e-spec.ts` |
| **QA scenario** | (orchestrator to allocate) |
| **Scenario** | Create a custom module with a field and do not publish it. `GET /api/data/<key>` and `POST /api/data/<key>` return 404 and `GET /api/metadata/custom-modules` does not list it. Publish it: both succeed and it is listed. Deactivate it: 404 again and it leaves the list. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-custom-runtime` |
| **Active** | yes |

### REG-492 — A published custom module had no sidebar entry and no list, form or record screen

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `apps/web`, `services/api/src/modules/data` |
| **Bug record** | BUG-3494 |
| **Root cause** | The sidebar was a fixed code list the Sidebar Designer could only override, and no tenant route rendered custom-table records, so publishing had no end-user outcome. |
| **Regression test** | `apps/web/lib/runtime/custom-modules/custom-module-navigation.spec.ts`, `apps/web/lib/runtime/custom-modules/custom-module-runtime.spec.ts` |
| **QA scenario** | (orchestrator to allocate) |
| **Scenario** | On a tenant with a published module, a user holding `custom-records.read` sees its entry before Settings. Clicking it opens `/custom-modules/<key>` with the published view's columns. New opens the published form, saves, and the record appears in the list and opens at `/custom-modules/<key>/<id>`. A Sidebar Designer hide or rename keyed by `/custom-modules/<key>` applies. A second module works with no code change. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-custom-runtime` |
| **Active** | yes |

### REG-493 — Custom-record endpoints were authorized only inside the service

| | |
|---|---|
| **Bug class** | `service-authorization-hidden` |
| **Module** | `services/api/src/modules/data` |
| **Bug record** | BUG-3494 |
| **Root cause** | `DataController` ran `JwtAuthGuard` only. Its custom-only handlers declared neither `@Permissions` nor `@RequirePermission`, so the guard-level two-system check never ran on the endpoints the new screens call. |
| **Regression test** | `services/api/src/modules/data/data.controller.permissions.spec.ts`, `services/api/src/common/constants/wiring-invariants.spec.ts` |
| **QA scenario** | (orchestrator to allocate) |
| **Scenario** | A user with `custom-records:READ` only receives 403 on `POST`, `PATCH` and `DELETE /api/data/<key>` and succeeds on `GET /api/data/<key>/<id>`. A user with neither receives 403 on `GET /api/metadata/custom-modules` and sees no custom entries. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-custom-runtime` |
| **Active** | yes |

### REG-494 — Custom-module records must stay inside their tenant even under an identical module key

| | |
|---|---|
| **Bug class** | `tenant-filter-missing` |
| **Module** | `services/api/src/modules/data` |
| **Bug record** | BUG-3494 |
| **Root cause** | Preventive guard for the new record read path. Module keys are unique per tenant, not globally, so a lookup by key or by record id alone would cross tenants. Every query now carries `user.tenantId` and the table id resolved within that tenant. |
| **Regression test** | `services/api/test/custom-module-runtime.e2e-spec.ts` |
| **QA scenario** | (orchestrator to allocate) |
| **Scenario** | Two tenants each publish module `e2eAsset`. A record created in A is listed and readable in A. In B the list is empty and `GET /data/e2eAsset/<A-id>` is 404. B's PATCH and DELETE of that id are 404 and the row is unchanged. |
| **Fixed** | 2026-09-13, branch `agent/walkthrough2-custom-runtime` |
| **Active** | yes |

### QA retest steps (browser, demo tenant, after deploy)

1. Sign in as the workspace owner at `https://dijipeople-demo.ws.dijipeople.com`.
   The sidebar shows **QA Assets** (the plural display name) immediately above
   Settings.
2. Click it. `/custom-modules/qaAsset` renders the standard list with view selector
   "Active QA Assets" / "QA All Assets" and a Serial Number column. The table shows
   its empty message when there are no records.
3. New → `/custom-modules/qaAsset/new` shows the published Main form with Serial
   Number. Save. The browser calls `POST /api/data/qaAsset` → 201. The record opens
   or appears in the list.
4. Open the record → `/custom-modules/qaAsset/<id>` renders the record shell. Edit →
   change Serial Number → Save → `PATCH` 200.
5. Open `/custom-modules/doesNotExist` and `/custom-modules/qaAsset/not-a-uuid`. Both
   show the not-found state, not the error modal. No `SYSTEM_UNEXPECTED_ERROR` row is
   written.
6. As a user without `custom-records.read` (e.g. an employee role without it), there
   is no entry, and `/custom-modules/qaAsset` shows access denied.
7. In Settings → Customization, deactivate the module or publish without it. The
   entry disappears after reload, and the routes show not-found.
8. At 400px and 820px the list and record pages reflow like other runtime modules.

### Hand-off to WP-01 (files this stream must not edit)

1. `apps/web/app/(authenticated)/settings/customization/_components/sidebar-designer.tsx:9,38,42,48`
   and `settings/customization/sidebar/page.tsx`. The designer lists
   `dashboardNavItems`, so custom modules cannot yet be ordered or hidden from the
   designer UI. Overrides keyed by `/custom-modules/<key>` already work.
   - Change: import `resolveDashboardNavCatalog` from `_components/navigation` and
     use `resolveDashboardNavCatalog(customModules)` wherever `dashboardNavItems`
     is used.
   - In `sidebar/page.tsx`, fetch `apiRequestJson<{ items }>("/metadata/custom-modules")`
     (catch → `[]`) and pass `items` to the designer.
   - Type: `CustomModuleSummary` from `@/lib/runtime/custom-modules/custom-module-navigation`.
2. `apps/web/app/(authenticated)/settings/customization/_components/table-detail-shell.tsx:331-334`
   still shows ROUTE as `/settings/customization/tables/${table.tableKey}`.
   - Change: for custom tables use `customModuleHref(table.tableKey)` from
     `@/lib/runtime/custom-modules/custom-module-navigation`, which gives
     `/custom-modules/<key>`.

### Residual risks and open items

- **Published action bar not consumed.** BUG-3494's expected behaviour says the
  action bar defines the commands. Custom-module screens use the standard runtime
  command set (New, Edit, Delete, Refresh, Back, Save), gated by capabilities. The
  published `dd_qaRecordBar` is ignored. Follow-up needed.
- **View filters are applied to the loaded page only.** `StandardModuleListPage`
  filters records client-side, and `/data/<key>` does not filter or search. Page
  totals ignore view filters.
- **Lookup fields to system entities** get a target but no options source. Lookup
  creation is blocked by BUG-3492 today.
- **Legacy `publish()` snapshot shape** lists every table present at publish time,
  including ones never published through a package. Only the Publish Center shape
  excludes drafts. INFERENCE: the Publish Center is the path in use.
- **Draft tables used by a related-record subgrid** now return 404. This is intended
  by ADR-0016, but it is a behaviour change.
- The list `GET /data/:entity` stays service-authorized, with decorators impossible
  on a dispatcher. It is documented in the controller and on the reviewed list.
- Sidebar icon is the generic fallback (`Briefcase`); `CustomizationTable.icon` is
  not mapped.
- DB-backed e2e and browser checks have not been run by this stream.
