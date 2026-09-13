---
ID: BUG-3494
aliases: [BUG-3494]
Title: A published custom module has no sidebar entry and no list, form or record screen
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: USER_REPORT
DetectedDate: 2026-09-13
DetectedInSha: df0f84f1
AffectedModules: [apps/web, customization, data]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: REG-492
RelatedBacklogItem: [ITEM-0187, ITEM-0188, ITEM-0189, ITEM-0190, ITEM-0191, ITEM-0195]
RelatedDecision: docs/decisions/ADR-0016-published-custom-modules-render-in-the-tenant-runtime.md
RelatedImplementation: [docs/plans/EXECPLAN-0046-published-custom-modules-tenant-runtime.md, services/api/src/modules/data/custom-module-runtime.service.ts, services/api/src/modules/data/custom-module-runtime.controller.ts, services/api/src/modules/data/published-custom-modules.ts, services/api/src/modules/data/custom-data.service.ts, services/api/src/modules/data/data.controller.ts, apps/web/lib/runtime/custom-modules/custom-module-runtime.ts, apps/web/lib/runtime/custom-modules/custom-module-navigation.ts, apps/web/app/(authenticated)/custom-modules/[moduleKey]/page.tsx, apps/web/app/(authenticated)/settings/customization/_components/sidebar-designer.tsx]
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
ResolvedAt:
---

# BUG-3494 — A published custom module has no sidebar entry and no list, form or record screen

## Summary

A tenant administrator can build a custom module in Customization and publish
it: fields, a form, a view, a choice list, a relationship and an action bar.
After a successful publish the module appears nowhere in the product. There is
no sidebar entry and no screen where anyone can list, create or open its
records. The module's only "route" is its own settings page. Custom modules
have no end-user outcome.

## Expected Behavior

Owner decision, 2026-09-13 (ADR-0016): a published custom module gets a sidebar
entry and standard list, form and record screens driven by its published
metadata. Its view defines the list, its form defines create and edit, and its
action bar defines the commands. This is part of the P1 Customization blocker
fix.

## Actual Behavior

After publishing 9 components for module `qaAsset`:

- The tenant main navigation is unchanged, with the same 10 links as before.
- Sidebar Designer still shows "13 entries", and none of them is QA Asset.
- The module's Properties tab shows ROUTE as
  `/settings/customization/tables/qaAsset`, which is the Customization settings
  page, not a runtime screen.
- No URL in the tenant product lists, creates or opens QA Asset records.

## Reproduction

1. Sign in to `https://dijipeople-demo.ws.dijipeople.com` as the workspace
   owner.
2. Create a custom module with at least one field, a form and a view, then
   publish the drafts. Use the package workaround in [[BUG-3493]]. The
   response is 201 with 9 components published and `snapshotVersion` 1.
3. Reload the product and inspect the main sidebar. There is no entry for the
   module.
4. Open `/settings/customization/sidebar`. The module is not among the
   entries.
5. Open the module's Properties tab and read ROUTE.

Reproduced on the live demo tenant at `df0f84f1`. The published module
`qaAsset` is still on that tenant as test data.

## Evidence

- `apps/web/app/(authenticated)/_components/navigation.ts:30-155` defines the
  main sidebar as a static, code-defined list of product entries.
- `apps/web/app/(authenticated)/settings/customization/sidebar/page.tsx:22-24`
  describes the designer as reordering, renaming and hiding entries that "stay
  product-defined". It reads only overrides from `/navigation/sidebar`.
- `apps/web/app/(authenticated)/settings/customization/_components/table-detail-shell.tsx:331-334`
  renders the ROUTE property as `/settings/customization/tables/${table.tableKey}`.
- The API can already store and serve records for custom tables:
  - `services/api/src/modules/data/custom-data.service.ts` maps them to the
    `customDataRecord` Prisma model (line 47) and reads and creates them
    (lines 186-229).
  - `services/api/src/modules/data/data.controller.ts` exposes
    `GET/POST/PATCH/DELETE /data/:entityLogicalName`.
  - `apps/web/app/api/data/[entityLogicalName]/route.ts` proxies those
    requests.
- No page under `apps/web/app/(authenticated)/` renders a list, form or record
  screen for an arbitrary custom table. The web runtime uses the generic data
  API only for related-record subgrids (`apps/web/lib/runtime/related-record-api.ts`).

## Root Cause

The tenant runtime has no consumer for published custom-module metadata. Main
navigation is a fixed, code-defined list, and the Sidebar Designer can only
override entries in that list, not add them. The web runtime's list, form and
record pages are registered per product module, and no generic surface resolves
a custom table's published view, form and action bar into screens.

The storage and data API for custom records exist. The presentation layer that
the owner decided a published module must have does not.

## Impact

Every custom module a tenant builds is invisible to its users, and
Customization's module-building capability delivers nothing a business user can
use. This is a primary journey blocked for the Customization feature as sold.
Reachable in production.

## Affected Areas

- Web: main navigation and Sidebar Designer; `lib/runtime` module registry and
  standard runtime pages; the Customization module Properties route.
- API: `navigation` (sidebar entries), `data` (custom record CRUD through
  `/data`), and `customization` (the published metadata snapshot).
- Permissions: runtime access to custom-module records, which must go through
  the existing permission and matrix model.

## Proposed Resolution

This needs an ExecPlan under `PLANS.md`, because it crosses modules and
permissions. It should use the metadata-driven runtime that already exists, not
a new one:

- Resolve published custom tables into sidebar entries that the Sidebar
  Designer can order, rename, hide and audience-gate.
- Render them with the standard runtime list, form and record pages, fed by the
  published view, form and action bar, through the existing `/data` API.
- Define how record-level permissions apply to custom modules, tenant-scoped
  from `request.user`.
- Change the Properties ROUTE to the runtime URL.

## Acceptance Criteria

- After publishing a custom module with a form and a view, a user with access
  sees a sidebar entry for it without any further configuration.
- Clicking the entry opens a list rendered from the published view's columns.
- Create opens the published form, saves through `/data`, and the new record
  appears in the list and opens in a record screen.
- The module appears in Sidebar Designer and can be reordered, renamed and
  hidden.
- A user without the module's read permission sees neither the entry nor the
  records (API returns 403).
- Records are tenant-scoped: another tenant cannot list or open them.
- Properties ROUTE shows the runtime URL.

## Regression Coverage

QA scenarios QA-RUNTIME-045 and QA-RUNTIME-046.

- REG-492 (the defect filed here): `apps/web/lib/runtime/custom-modules/custom-module-navigation.spec.ts`,
  `apps/web/lib/runtime/custom-modules/custom-module-runtime.spec.ts`.
- REG-491 (found while fixing: draft records reachable through `/data`):
  `services/api/src/modules/data/custom-data.service.spec.ts`,
  `services/api/src/modules/data/custom-module-runtime.service.spec.ts`,
  `services/api/src/modules/data/published-custom-modules.spec.ts`.
- REG-493 (found while fixing: service-only authorization):
  `services/api/src/modules/data/data.controller.permissions.spec.ts`,
  `services/api/src/common/constants/wiring-invariants.spec.ts`.
- REG-494 (tenant isolation under an identical module key):
  `services/api/test/custom-module-runtime.e2e-spec.ts`, which covers both
  requirements below on a database and has not yet been run against one.

As filed, the record required:

- A DB-backed e2e test that publishes a minimal custom module and asserts it
  appears in the resolved sidebar and that a record can be created and listed
  through the runtime path.
- A tenant-isolation e2e test on the same records.

Both must fail today because no sidebar entry or runtime surface exists. A REG
entry follows once written.

## Dependencies

- ADR-0016, recording the owner decision.
- An ExecPlan.
- [[BUG-3491]], [[BUG-3492]] and [[BUG-3493]]: without them a custom module
  cannot be reached, given a lookup or choice field, or published.

## Related Items

- [[BUG-3493]]: publish must succeed first.
- [[BUG-3492]]: fields a useful custom module needs.
- [[BUG-3491]]: access to Customization.
- [[BUG-3495]]: metadata quality of what gets published.
- [[ITEM-0184]]: Customization usability defects.

Follow-ups filed from the fix (TASK-0031 WP-02 residuals and Architect
decisions):

- [[ITEM-0187]]: list views filter only the loaded page; `/data/<key>` has no
  filtering or search.
- [[ITEM-0188]]: published action bars are not consumed by custom-module screens.
- [[ITEM-0189]]: lookup fields targeting system entities have no options source.
- [[ITEM-0190]]: the sidebar entry ignores the module's icon.
- [[ITEM-0191]]: product decision on per-module access keys versus the shared
  `custom-records` privilege.
- [[ITEM-0195]]: the legacy `publish()` snapshot shape can expose a
  never-published module.

## Resolution

Fixed in TASK-0031 WP-02 (commit c213b6ae on `agent/walkthrough2-custom-runtime`,
merged into `agent/walkthrough2-integration`; plan EXECPLAN-0046), applying
ADR-0016, with the Sidebar Designer hand-off applied at integration in 4d249b40.

**API** (`services/api/src/modules/data/`):

- `published-custom-modules.ts` reads the latest published snapshot in both
  production shapes (Publish Center and legacy `publish()`) and fails closed.
- `custom-module-runtime.service.ts` defines runtime-available: a live
  `isCustom && isActive` table of the caller's tenant that appears in that
  tenant's latest published snapshot, with columns narrowed to published ones.
  `GET /metadata/custom-modules` returns the sidebar list and
  `GET /metadata/custom-modules/:moduleKey` the definition (fields after field
  read security, active forms, non-hidden views, capabilities); both declare
  `custom-records` read in both permission systems.
- `CustomDataService.findTable` delegates to that definition, so every record
  path returns 404 for a draft or deactivated module (found while fixing: before
  this, a draft module's records were listed, created, edited and deleted through
  `/data`). New `findOne` reads with `{ id, tenantId: user.tenantId, tableId,
  isDeleted: false }` ANDed with the `custom-records` READ row scope.
- `DataController` gains `GET :entity/:recordId`, and `PermissionsGuard` plus
  both decorators on every custom-only handler (found while fixing: they ran
  `JwtAuthGuard` only). The dispatching list route stays service-authorized on
  the reviewed list in `wiring-invariants.spec.ts`.
- Permission model: the existing `custom-records` entity. No key added, no
  single-writer file edited, seeds unchanged (Architect decision; ITEM-0191 asks
  the owner about per-module keys).

**Web** (`apps/web`):

- `lib/runtime/custom-modules/custom-module-navigation.ts` builds entries at
  `/custom-modules/<key>` (plural display name, `custom-records.read`) and
  composes them before Settings; Sidebar Designer overrides keyed by href apply.
  The layout fetches the list only for holders of the read key.
- `lib/runtime/custom-modules/custom-module-runtime.ts` turns the definition
  into a standard runtime spec: routes, API path, field types, list views from
  the published view, published forms, a fallback view and form.
- Routes under `app/(authenticated)/custom-modules/[moduleKey]/` (list, new,
  record, edit) use `StandardModuleListPage` and `StandardModuleRecordPage`; 403
  renders access denied and 404 not found. `/custom-modules` is a protected
  route prefix.
- Integration commit 4d249b40: the Sidebar Designer lists published custom
  modules (`resolveDashboardNavCatalog`), so they can be ordered, renamed and
  hidden there. The second hand-off (Module Properties ROUTE) is moot: WP-01
  removed that entry.

Found at integration, fix pending as a commit on
`agent/walkthrough2-integration` (no SHA recorded yet): `CustomDataService.create`
did not let a published custom module create a record without a parent record,
so New on a module's own screen could not save. The fix lets create proceed
without a parent and adds two unit cases to
`services/api/src/modules/data/custom-data.service.spec.ts`, listed under
REG-492. Integration commits 23044aed (notifications and data integration seams,
lint cap) and 89bc55a6 (component index regenerated) also sit on that branch.

Accepted residual behaviour change: a draft table used by a related-record
subgrid now returns 404, as ADR-0016 intends. Custom-module screens use the
standard command set; the published action bar is ITEM-0188.

Stream validation: the new API and web specs listed under Regression Coverage
pass; the unpublished-module cases were run against the pre-fix
`custom-data.service.ts` and fail there. Combined integration run at 9183d737
(WP-02, WP-03, WP-06): api 337 suites / 6759 tests and web 106 suites / 1962
tests passed; both typechecks clean.

## QA Retest

**PASS.** Browser-verified in the local QA run
(`docs/qa/runs/2026-09-13-task-0031-demo-walkthrough-2-local-browser-qa-e253306.md`,
scenarios S3, S4, S5) on a throwaway database: S4 failed before commit
22511c32 and passed after (empty published form), and S5 confirmed a record
created via the published form. On production after release PR #80 (merge
commit e253306a, deployed 2026-09-13): "QA Assets" appears in the main menu,
and `/custom-modules/qaAsset/new` renders the published Serial Number field.
Also verified: the integration seams fixed at 2a8f811a (create without a
parent), cff72bbe (SELF scope owner column) and 22511c32 (empty published
form). CI runs 34732185363, 34732682935 and 34732697734 passed on f865ac5e
(the merged tree). Scenarios QA-RUNTIME-045 (screens) and QA-RUNTIME-046
(publish gate, permissions, tenant isolation; includes the first run of
`services/api/test/custom-module-runtime.e2e-spec.ts`):

1. The workspace owner sees "QA Assets" immediately above Settings.
2. `/custom-modules/qaAsset` renders the list with the published views and the
   Serial Number column.
3. New → the published form → Save → `POST /api/data/qaAsset` 201; the record
   appears.
4. Open the record → Edit → Save → `PATCH` 200.
5. `/custom-modules/doesNotExist` and `/custom-modules/qaAsset/not-a-uuid` show
   not-found, with no error modal and no `SYSTEM_UNEXPECTED_ERROR` row.
6. A user without `custom-records.read` sees no entry and gets access denied.
7. Deactivating the module removes the entry and the routes show not-found.
8. At 400px and 820px the pages reflow like other runtime modules.
9. The Sidebar Designer lists the module; rename and hide apply.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — fixed in TASK-0031 WP-02, with the Sidebar Designer listing added at integration (4d249b40); unit-tested; browser verification pending. Remaining gaps filed as ITEM-0187…ITEM-0191 and ITEM-0195.
- 2026-09-13 — QA retest: PASS — local browser QA run and production verification at e253306a.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0187]], [[ITEM-0188]], [[ITEM-0189]], [[ITEM-0190]], [[ITEM-0191]], [[ITEM-0195]]
- Modules — [[tenant-application]]
- Implementation — [[EXECPLAN-0046-published-custom-modules-tenant-runtime]]
- Regression — REG-492 (see the regression register)

<!-- GRAPH:END -->
