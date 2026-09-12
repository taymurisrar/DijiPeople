---
ID: BUG-3494
aliases: [BUG-3494]
Title: A published custom module has no sidebar entry and no list, form or record screen
Status: OPEN
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
RegressionId: 
RelatedBacklogItem:
RelatedDecision: docs/decisions/ADR-0016-published-custom-modules-render-in-the-tenant-runtime.md
RelatedImplementation:
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

## Resolution

## QA Retest

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
