# Module provisioning standard

When a custom business module is created, its system components exist before anyone can open it. Implemented in the **service layer**, not by instruction.

- Plan: `services/api/src/modules/customization/module-provisioning.ts` (`MODULE_PROVISIONING_VERSION = 1`)
- Workflow: `CustomizationService.createTable` → one `$transaction` → `provisionModuleComponents`
- Repair/back-fill: `CustomizationService.reconcileModuleComponents(user, tableKey, packageId?)`
- Gate: `scripts/check-module-completeness.mjs` + `module-creation-entrypoints.json` (MOD-001…003)
- Behaviour tests: `module-provisioning.spec.ts`, `module-provisioning.behaviour.spec.ts` (MOD-003/004)

## What a module receives

| Component | Provisioned |
|---|---|
| Forms | Main (default), Quick Create, Quick View, Lookup |
| Views | All (default), Recent (modified desc), Quick Find, Lookup |
| Command bar | `DEFAULT_MODULE_ACTION_COMMANDS` action bar component |
| Table identity, tenant ownership, package membership | `createTable` (same transaction) |
| Record timestamps | runtime `SYSTEM_FIELDS` (`createdAt`, `updatedAt`) |
| Record audit | `custom-data.service.ts` audits every record write |
| RBAC | the shared `custom-records` matrix entity (per role access level) |

## Guarantees (tested)

Atomic — a failure rolls back table, forms, views and components together, and a retry then succeeds. Idempotent — re-running creates nothing. Customisation-safe — only creates; never rewrites or renames; a legacy `active` default counts as `all` so there is never a second default. Tenant-isolated — reconcile of another tenant's module is Not Found.

## Deliberately NOT provisioned (and why)

- **Active / Inactive / My Records views.** A custom module has no status column, and ownership lives on the record row (`ownerUserId`), not as a column key. The web runtime keeps only known column keys, so such a filter would be silently dropped and the view would show everything under a false name. Adding them needs a schema/metadata decision (status + owner system columns) — an architecture decision for the owner, tracked as R-3.
- **Associated/Related view and subgrids** — need relationship metadata that custom modules do not yet declare.
- **Per-module permissions and audit configuration** — all custom records share one RBAC entity; separate permissioning is a product decision (R-3).
- **Import/export templates** — generated from published columns at runtime; with no default columns there is nothing to template yet.

## Entry points (audited 2026-11-03)

`POST /customization/tables` → plan applied. **Package import** (`package-alm.service.ts`) carries the source tenant's own components and does not inject defaults — overwriting an author's design would be wrong; call `reconcileModuleComponents` afterwards for packages that omit them (limitation L-2). System modules come from `seed-config` / `publishTenantDefaults` and are verified by `verify-seed-config`. The e2e suite creates tables directly via Prisma, bypassing the workflow; that is a test shortcut, not a supported path. Direct database writes are not a supported creation path: `reconcileModuleComponents` and the completeness gate are the recovery tools.
