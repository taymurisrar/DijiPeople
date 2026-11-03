# Module provisioning standard

When a custom business module is created, its system components exist before anyone can open it. Implemented in the **service layer**, not by instruction, so it holds whether the module is created by an agent, a person in the UI, or a supported API call.

| Piece | Where |
|---|---|
| Plan (what a module of each kind receives) | `services/api/src/modules/customization/module-provisioning.ts` (`MODULE_PROVISIONING_VERSION = 2`) |
| Creation | `CustomizationService.createTable` → one `$transaction` → `provisionModuleComponents` |
| Inspection (read-only; shared by provisioning, dry run, drift) | `CustomizationService.inspectModule` |
| Reconciliation of existing modules | `ModuleReconciliationService` ← `POST /customization/modules/reconcile` |
| Package import | `PackageAlmService.applyImport` → `provisionImportedModules` (create-only) |
| Record lifecycle by kind | `services/api/src/modules/data/custom-record-lifecycle.ts` |
| Static gate | `scripts/check-module-completeness.mjs` + `module-creation-entrypoints.json` (MOD-001…007) |
| Tests | `module-provisioning.spec.ts` (plan), `…behaviour.spec.ts` (fast path), **`test/module-provisioning.e2e-spec.ts` (real PostgreSQL)** |

## Module kinds (owner decision, 2026-11-03)

`CustomizationTable.moduleKind` (default `STANDARD`, so every existing module keeps its behaviour):

| Kind | Edit | Deactivate | Delete | "My Records" | Active / Inactive |
|---|---|---|---|---|---|
| `STANDARD` — user/team-owned business data | yes | yes | yes | **yes** | yes |
| `ORGANIZATION_OWNED` — owned by the organization | yes | yes | yes | no | yes |
| `CONFIGURATION` — reference/setup data | yes | yes | **never** | no | yes |
| `IMMUTABLE` — ledger/historical | **never** | **never** | **never** | no | no |

The same table drives both sides: the API **refuses** what a kind forbids (`CUSTOM_RECORD_IMMUTABLE`, `CUSTOM_RECORD_DELETE_NOT_ALLOWED`) and the module metadata reports `capabilities` (`update`, `delete`, `deactivate`) derived from it, so the UI hides exactly what the API would reject.

## What a module receives

| Component | Provisioned |
|---|---|
| Forms | `main` (default), `quickCreate`, `quickView`, `lookup` |
| Views | `all` (default), `activeRecords`, `inactiveRecords`, `myRecords`, `recent`, `quickFind`, `lookup` — the subset the kind allows |
| Command bar | the base command list, filtered by the kind, plus `record/selection.activate/deactivate` where deactivation applies |
| Record status | `CustomDataRecord.isActive` (default true); toggled by `PATCH` with `{ isActive }` (explicit field, never merged into values; audited as activate/deactivate) |
| Record owner, actors, timestamps | `ownerUserId` (defaults to the creator), `createdById`, `updatedById`, `createdAt`, `updatedAt` — returned on every record |
| Table identity, tenant ownership, package membership | `createTable` (same transaction) |
| Audit | `custom-data.service.ts` audits every record write |
| RBAC | the shared `custom-records` matrix entity |

Component keys are camelCase logical names. **Hyphenated keys break package export** (the artifact validator rejects them); a regression suite caught this and the plan spec now asserts it.

View filters use the record-level fields `isActive` and `ownerUserId` and the token `@me`, which the web runtime resolves to the signed-in user (with no user it matches nothing, never everything). The API also supports `?status=active|inactive|all` and `?owner=me` **server-side**, so paging totals stay correct.

## Guarantees (tested on real PostgreSQL)

Atomic — a failure injected by a database trigger rolls back table, forms, views and components together, and a retry then succeeds. Concurrency-safe — of four simultaneous creators of one key exactly one wins; the others get `Conflict`; no duplicate children. Idempotent — a second reconcile changes no row. Create-only — customer renames, filters and extra views survive; a legacy unfiltered `active` default keeps the default (no second default). Conflicts (a key held by a different type, two defaults) and command-bar drift are **reported, never rewritten**. Tenant-isolated — one tenant can neither see nor change another's modules, and one tenant's confirmation slug never authorizes another.

## Reconciling existing modules

`POST /customization/modules/reconcile` (permission `customization.tables.update`):

- **Dry run by default** — returns, per module, what it would create, conflicts and drift. Writes nothing.
- **Apply** needs `apply: true` **and** `confirmTenantSlug` equal to the workspace's own slug; a `PRODUCTION` workspace additionally needs `authorizationRef` (the owner approval the caller holds; recorded in the audit log — it can be stored, not verified).
- One workspace only (always the caller's), one transaction **per module**; a failure leaves that module unchanged and the run continues, so re-running resumes.
- A system view the customer deliberately deleted is re-created: the dry run lists it first, and `tableKeys` limits the run.
- **Never automatic.** Not at startup, seeding or on a schedule; `check-module-completeness` fails if reconciliation is referenced from `main.ts`, `app.module.ts`, a seed, or a timer.

Rolling out to existing tenants is therefore a deliberate act per workspace: dry run, review, apply with the confirmation. Use an isolated copy first.

## Entry points (audited)

| Path | Provisioning |
|---|---|
| `POST /customization/tables` | full plan, transactional |
| Package import | modules **created by the import** get missing defaults, create-only; what the package carried is untouched; modules that already existed are not modified (use reconcile) |
| System modules (`seed-config`, `publishTenantDefaults`) | not part of this plan; verified by `verify-seed-config` |
| e2e/test direct Prisma writes | a test shortcut, not a supported path |
| Direct database writes | not a supported creation path; `reconcile` and the gate are the recovery tools |

## Deliberately not provisioned

- **Associated / related-record views and subgrids.** The web runtime has no subgrid for custom modules; a view that claims to relate records and does not is worse than none. Relationship *lookup columns* and selectors already work and are untouched by provisioning.
- **Per-module permission rows.** All custom records share the `custom-records` entity; separate permissioning is a product decision.
- **Default data columns (e.g. a primary-name column).** Adding columns changes every existing module's published shape; not done without an owner decision.

## Known limitation

Views are filtered **in the browser on the page of records that was loaded** (existing runtime behaviour, for all views). `?status`/`?owner` exist on the API but the list page does not yet re-fetch when the active view changes, so on a module larger than one page, "Active" and "My Records" show matches from the loaded page only. The default view ("All") is unaffected. Fix: pass the active view's server-side filters in the page loader — tracked as follow-up F-1.
