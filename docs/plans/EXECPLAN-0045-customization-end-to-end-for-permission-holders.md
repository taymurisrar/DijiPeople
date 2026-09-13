CONTEXT_FILES_REQUIRED:
  - AGENTS.md, services/api/AGENTS.md, apps/web/AGENTS.md
  - docs/decisions/ADR-0013-customization-access-is-granted-by-permission.md (walkthrough2 branch; binding)
  - .agent/context/auth-rbac.md
  - docs/architecture/settings-and-branding.md (formatting context)

SPECIALIST_AGENTS_REQUIRED:
  - backend-api                         — guard, controller decorators, service validation
  - frontend                            — web gates, customization dialogs, Publish Center, error provider
  - security                            — authorization change; endpoint table below is the review surface
  - qa                                  — browser retest on a throwaway DB (orchestrator)
DELIBERATELY_NOT_USED:
  - database                            — no schema change, no migration
  - integration                         — no external system touched

SINGLE_WRITER_FILES:
  - none. `permissions.ts` and `rbac-matrix.ts` are NOT edited: every elevated role and the
    tenant owner already receive every `customization.*` key at login
    (`services/api/src/modules/auth/auth-access.service.ts:185-191`), so no grant change is needed.

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/divergent-duplicate-guard.md       (BUG-3374 → BUG-3491)
  - docs/qa/known-bug-patterns/ui-permission-backend-mismatch.md
  - docs/qa/known-bug-patterns/per-module-fix-behind-a-per-module-test.md
  - docs/qa/known-bug-patterns/assertion-without-a-check.md

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-420 — BUG-3374, web-only test; widened by this plan's seam test
  - REG-481 … REG-489 reserved for this work package (entries in the stream report)

TARGET_BRANCH:            develop (via orchestrator; this branch: agent/walkthrough2-customization)
TARGET_ENVIRONMENT:       LOCAL, then PRODUCTION via the orchestrator's release
DEPLOYMENT_REQUIRED:      yes (orchestrator)
DEPLOYMENT_COMPONENTS:    api, web
DEPLOYMENT_ORDER:         api -> web (web alone keeps working against the old API; see Rollback)
ROLLBACK_CLASS:           MULTI_COMPONENT_CONTRACT (code only; no data migration)
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  yes (orchestrator)
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff (orchestrator)
KNOWN_CONCURRENT_WORK:    TASK-0031 WP-02 (custom-module runtime screens), WP-03 (employee
                          actions, `command-failure-message.ts`). No shared files: this plan owns
                          `services/api/src/modules/customization/**`,
                          `apps/web/app/(authenticated)/settings/customization/**`,
                          `settings/_lib/require-settings-permission.ts`,
                          `app/components/ui/form-control.tsx`, `app/components/errors/**`.
ENVIRONMENT_DEPENDENCIES: none

# ExecPlan — Settings → Customization works end-to-end for anyone holding the customization permissions

## Objective

A tenant user who holds the `customization.*` permission keys — whatever role
carries them — can open every Customization screen, create modules and every
field type, build forms, views, choice lists, relationships and action bars,
and publish them from Publish Center, without a server error, a hidden
prerequisite, or a false validation result. The package / publisher-prefix /
layer model is unchanged.

## Business requirement

Owner decision D3 (2026-09-13, USER_CONFIRMED): fix the blockers, keep the
model; access is granted by `customization.*` permissions, not by role
(ADR-0013). Records: BUG-3491, BUG-3492, BUG-3493, BUG-3495, BUG-3496, and the
customization rows of ITEM-0183 / ITEM-0184. Binding product rule: no
explanatory helper text is added; agent-added explanatory copy on screens
touched is removed.

## Existing behavior

- **FACT** — `customization-access.guard.ts:13-36` admits only
  `GLOBAL_ADMIN`/`SYSTEM_CUSTOMIZER` role keys; `customization-access.guard.spec.ts:44-50`
  asserts a System Administrator is denied.
- **FACT** — `PermissionsGuard` → `satisfiesPermissionRequirement`
  (`common/security/permission-evaluation.ts:47`) returns `true` for any
  elevated role (`GLOBAL_ADMIN`, `SYSTEM_ADMIN`) without looking at keys, so
  the role check above was the *only* customization gate for those roles.
- **FACT** — `auth-access.service.ts:185-191`: elevated roles and the tenant
  owner are given every `FOUNDATION_PERMISSION_DEFINITIONS` key, which includes
  all `customization.*` keys (`permissions.ts:1946-2133`). System Customizer
  receives them through `BASE_ROLE_PERMISSION_KEYS['system-customizer']`
  (`permissions.ts:2201`) and `SYSTEM_ROLE_MISC_PERMISSIONS` (`rbac-matrix.ts:1052-1078`).
- **FACT** — web layout gates on `customization.read`
  (`settings/customization/layout.tsx:21`) through `hasAnySettingsPermission`,
  which also admits three roles (`require-settings-permission.ts:6-38`); every
  leaf page gates with `requireSettingsPermissions` (any-of, role bypass,
  redirect) and then calls `apiRequestJson` unguarded, so an API 403 becomes a
  server error.
- **FACT** — `settings-navigation.ts` `requiredAnyRoles` is never read outside
  that file (grep of `apps/web`), so it is inert and not a gate.
- **FACT** — `columns-management.tsx:709` sends `maxLength: null` for every
  non-length type; `customization.dto.ts:170-173` `@IsOptional` lets `null`
  through; `customization.service.ts:5058` rejects `null < 1`.
- **FACT** — drafts with no `packageId` land in `unassigned-draft-customizations`
  (`customization.service.ts:582-584`, `3994-3996`); `validatePublishDrafts`
  (`504-575`) never flags that package; `publishComponents` (`836-845`) and
  `publishPackage` (`1207-1211`) refuse it; Publish Center removes it from move
  targets (`publish-center.tsx:53-59`); `defaultComponentKeys` is every form
  and view draft (`customization.service.ts:563-568`).
- **FACT** — the walkthrough's `dd_` prefix comes from
  `getPackagePublisher` (`customization.service.ts:3852-3855`): the unassigned
  key has no `x_` prefix, so the prefix falls back to `publisherPrefix(tenantName)`.
- **FACT** — `createPackage` (`1384-1392`) ignores `dto.packageKey` and stores
  `prefix + camelize(displayName)`.
- **FACT** — `toTableResponse` hardcodes `lifecycleState: 'published'` and
  `packageName: null` for custom modules (`customization.service.ts:5332-5334`);
  `columns-management.tsx:188` hardcodes "Default Package"/"Custom Package".
- **FACT** — `useDialogBehavior` listens for Escape on `document` in the capture
  phase (`app/components/ui/dialog.tsx:216`), so it runs before any combobox's
  own Escape handler and closes the whole dialog.
- **FACT** — `publish-center.tsx:576`, `packages-list.tsx:718`,
  `package-detail-shell.tsx:1274` format dates with
  `new Intl.DateTimeFormat(undefined, …)` during render: server locale/timezone
  ≠ browser → React #418.
- **FACT** — `error-provider.tsx:58-75` forwards every window error to the modal
  and `persistClientError`.
- **FACT** — `FieldShell` renders `hint` twice (tooltip `form-control.tsx:102-121`
  and feedback line `:72`,`:133`); `SelectField`'s `id` is cloned onto its
  wrapper `div`, so `label htmlFor` names nothing and the combobox has no
  accessible name.

Must keep working: System Customizer and Global Administrator access; publish
still requires `customization.publish`; already-published components; existing
packages; the runtime published-metadata endpoint (`runtime-metadata/published`).

## Existing architecture

- API `services/api/src/modules/customization/`: `customization.controller.ts`
  (`@UseGuards(JwtAuthGuard, PermissionsGuard, CustomizationAccessGuard)`),
  `customization-access.guard.ts`, `customization.service.ts`,
  `dependency-validation.ts`, `dto/customization.dto.ts`.
- Web `apps/web/app/(authenticated)/settings/customization/`: server pages +
  client `_components/*`; shared `app/components/ui/form-control.tsx`,
  `app/components/ui/dialog.tsx` (`useDialogBehavior`),
  `app/components/notifications/use-side-toast.tsx`,
  `app/components/filters/use-formatting-context.ts`,
  `app/components/errors/error-provider.tsx`.

## Requirements

1. R1 — The customization API admits a request iff the user holds every legacy
   `@Permissions` key the handler declares (plus `PermissionsGuard`'s matrix
   check); role membership is never consulted; a handler declaring no key is refused.
2. R2 — Every write endpoint declares a write key; reads declare read keys.
3. R3 — Every customization page gates on exactly the keys its API calls require
   (all-of), renders `AccessDeniedState` in place on refusal (including an API
   403 from its own data load), never redirects, never checks a role.
4. R4 — A seam test fails when a page's gate and the API decorators disagree.
5. R5 — A field of any type saves with the real client payload; text with
   `maxLength` 0 is still rejected.
6. R6 — A draft created with no package lands in a publishable, writable Custom
   Package; validate reports every reason publish would refuse; move targets list
   every writable Custom Package.
7. R7 — Only a genuine system default form/view gets the default-component warning.
8. R8 — Action bar rows without a command, and relationships whose reference field
   is not a lookup column of the source module, are rejected (API and dialog).
9. R9 — A valid typed package key is stored exactly.
10. R10 — Escape in an open combobox inside a dialog closes only the listbox.
11. R11 — Module lifecycle and package labels come from real component state.
12. R12 — No React #418 on module detail / Publish Center; hydration errors never
    open the error modal or persist as a 500; raw minified React text is never
    shown to users.
13. R13 — ITEM-0183/0184 customization rows (hint once, combobox names, copy
    removal, labels, Create wording, toasts, navigation to new module, table
    widths, Publish Center names).

## Dependencies

ADR-0013 (accepted). No data, credential or external dependency. WP-02 owns
custom-module runtime screens; this plan does not touch them.

## Files / modules affected

API (`services/api/src/modules/customization/`):
- `customization-access.guard.ts`, `customization-access.guard.spec.ts`
- `customization.controller.ts` (decorators only)
- `customization.service.ts`, `dependency-validation.ts`
- new specs: `customization-web-gate.seam.spec.ts`,
  `column-payload.seam.spec.ts`, `customization-publish-and-metadata.spec.ts`

Web (`apps/web/`):
- `app/(authenticated)/settings/_lib/require-settings-permission.ts` (+ spec)
- `app/(authenticated)/settings/customization/layout.tsx`, every `page.tsx`
- new `app/(authenticated)/settings/customization/_lib/customization-page-permissions.json`,
  `_lib/customization-access.ts`, `_lib/column-payload.ts` (+ spec),
  `_components/customization-access-denied.tsx`
- `_components/*`: columns-management, tables-list, metadata-components-management,
  publish-center, packages-list, package-detail-shell, views-management,
  forms-management, sidebar-designer, custom-package-picker-dialog,
  table-detail-shell, form-designer-workspace, view-designer-workspace
- `app/components/ui/form-control.tsx`
- `app/components/errors/error-provider.tsx`, new
  `app/components/errors/runtime-error-classification.ts` (+ spec)

Single-writer files: none.

## Database impact

None. No schema change. The tenant's own custom package is an ordinary
`CustomizationSolution` row created on demand (same code path as `createPackage`).

## Backend impact

### Guard (R1)

`CustomizationAccessGuard` reads `REQUIRED_PERMISSIONS_KEY` for the handler and
throws `ForbiddenException({ code: 'CUSTOMIZATION_PERMISSION_REQUIRED', … })`
unless every key is in `request.user.permissionKeys`; no keys declared → refused.
`customization.publish` missing keeps its existing code
`CUSTOMIZATION_PUBLISH_PERMISSION_REQUIRED`. The elevated-role bypass in
`PermissionsGuard` is not changed and not extended; this guard applies to
elevated roles too, which is correct because they hold the keys.

### Endpoint table (R2) — legacy key / matrix privilege

Guards on the class are unchanged: `JwtAuthGuard, PermissionsGuard, CustomizationAccessGuard`.
Before-state third column is what CustomizationAccessGuard additionally required:
**role GLOBAL_ADMIN or SYSTEM_CUSTOMIZER**; after: **the legacy keys listed**.

| Method path (`/api/customization/…`) | Before | After |
|---|---|---|
| GET `` | read / read | unchanged |
| POST `publish` | publish / configure | unchanged |
| GET `lookup-options/:tableKey` | read / read | unchanged |
| GET `published`, `default-solution`, `publish-history`, `publish/drafts`, `effective` | read / read | unchanged |
| POST `layers/ensure` | publish / configure | **read / write**, plus service asserts the component type's manage key (choiceList→`customization.choice-lists.manage`, relationship→`customization.relationships.manage`, actionBar→`customization.action-bars.manage`, other types→`customization.publish`) |
| POST `components/move`, `publish/validate`, `publish/components` | publish / configure | unchanged |
| GET `packages`, `packages/import/preview`, `packages/:id`, `packages/:id/candidates`, `packages/:id/export-readiness` | read / read | unchanged |
| POST `packages` | publish / configure | **packages.manage** / configure |
| POST `packages/import/preview` | publish / configure | **import.preview** / configure |
| PATCH `packages/:id`, DELETE `packages/:id` | publish / configure | **packages.manage** / configure |
| POST `packages/:id/components`, DELETE `packages/:id/components/:cid`, DELETE `…/metadata` | publish / configure | **packages.manage** / configure |
| POST `packages/:id/validate`, `packages/:id/publish` | publish / configure | unchanged |
| GET `packages/:id/export` | export / export | unchanged |
| GET `tables`, `tables/:k`, `tables/:k/dependencies`, `tables/:k/metadata-components` | tables.read / read | unchanged |
| POST `tables` | tables.update / create | unchanged |
| PATCH `tables/:k` | tables.update / write | unchanged |
| DELETE `tables/:k` | tables.update / delete | unchanged |
| GET `tables/:k/columns`, `…/columns/:c/dependencies` | columns.read / read | unchanged |
| POST/PATCH/DELETE columns | columns.create·update·delete / create·write·delete | unchanged |
| GET `tables/:k/forms` | forms.read / read | unchanged |
| POST/PATCH/DELETE forms, POST `…/set-default` | forms.create·update·delete·update | unchanged |
| GET `tables/:k/views`, GET `views` | views.read / read | unchanged |
| POST/PATCH/DELETE views, hide/unhide/set-default | views.create·update·delete·update | unchanged |

`customization-runtime.controller.ts` (`GET /api/runtime-metadata/published`,
JwtAuthGuard only) is untouched — it is the runtime read of published metadata.

**PROPOSAL / risk accepted:** the package write key change means a *custom* role
that holds `customization.publish` but not `customization.packages.manage` loses
package CRUD. System Customizer, Global Administrator, System Administrator and
the owner hold both. ADR-0013 names the specific key as the rule.

### Service

- `validateValueRules`: `null` and `undefined` mean "no length"; `maxLength` is
  ignored for types without a length; `buildColumnData` stores `null` for them.
- `resolveLayerPackage` / `ensureCustomizationLayer` with no `packageId`:
  `getOrCreateTenantCustomPackage` — a writable Custom Package keyed
  `<publisherPrefix(tenantName)>tenantCustomizations`, display name
  `<tenant name> Customizations`, found by `solutionKey endsWith
  '_tenantCustomizations'` so a tenant rename does not duplicate it. The prefix
  equals the one the unassigned package already implied, so existing `dd_`
  names stay consistent.
- `listPackages` provisions that package when the legacy unassigned package still
  holds drafts, so Publish Center always has a move target for them.
- `validatePublishDrafts` adds a blocking issue (with `componentId`) per draft in
  the unassigned package; publish refusals are driven by validation, so the two
  cannot disagree. `defaultComponentKeys` is computed from
  `CustomizationForm/View.isDefault && isSystem`.
- `ensureCustomizationLayer` validates metadata: action bar actions each need a
  non-empty `command` (400 names the row); relationship `referenceField` must be a
  lookup column (system definition or tenant row) of the source module.
- `createPackage` stores the validated `dto.packageKey`.
- `toTableResponse` derives `lifecycleState` and `packageName` from the module's
  table component (draft if any draft layer exists).
- `listColumns` adds `lifecycleState`/`packageName` from each column's component.

Transactions: none added. Audit: the customization module does not call
`AuditService` today; this plan adds no new state-changing operation type and
does not introduce audit here (recorded as a residual risk, not silently skipped).

## Frontend impact

Bespoke settings screens already exist (not module runtime); this plan edits them.

- Gate: `requireCustomizationAccess(keys)` — all-of, permission only, no roles, no
  redirect. `customization-page-permissions.json` is the single map of page →
  required keys → API calls; pages read it by key. `CustomizationAccessDenied`
  renders `AccessDeniedState`; pages also render it when their own API load
  returns 403.
- `form-control.tsx`: hint rendered once (the feedback line; tooltip removed);
  `SelectField`/`LookupField` comboboxes get `aria-labelledby` to their label;
  an open listbox registers a `window` capture Escape handler that closes it and
  stops propagation (dialog stays open). Behaviour elsewhere unchanged.
- Dialog copy removed (ITEM-0183 rows 7-11 and similar sentences in the same
  dialogs); field-type labels human-readable; Reference target only for reference
  type; create buttons read "Create"; `useSideToast` success after create/save;
  new module → navigate to its detail page; Publish Center shows names, no UUID,
  "Change" column with plain values; module detail header uses display names;
  table min-widths reduced and duplicate columns dropped.
- Dates formatted with `useFormattingContext()` + `formatDateTime` (R12).
- `error-provider.tsx`: `classifyRuntimeError` ignores recoverable hydration errors
  (#418/#419/#422/#423/#425, "Hydration failed", "hydration mismatch") — no modal,
  no persist; other minified React errors show a plain message while the log keeps
  the original.

Loading / error / empty: unchanged components; access-denied added per page.
Responsive: table min-widths reduced; dialogs already `max-w-*` + scroll.

## Permission / RBAC impact

- No new keys; no matrix changes; no role grant changes.
- Endpoint decorators: both families on every route (asserted by
  `dual-permission-remediation.spec.ts`); changes listed in the endpoint table.
- Row-level access: customization metadata is tenant-scoped configuration, not
  owned records; no `buildScopedAccessWhere` change.
- Elevated bypass: not extended; the customization guard now applies to elevated
  roles too.
- `apps/web/lib/security-keys.ts`: not changed (pages use the JSON map).

## Tenant-isolation impact

Every query touched keeps `tenantId: currentUser.tenantId`. New queries:
tenant custom package lookup/create (`where: { tenantId, … }`), unassigned-package
lookup (`tenantId_solutionKey`), default flags for form/view drafts
(`findMany where tenantId + id in`), reference-field column lookup
(`tenantId + tableId`), component lifecycle for tables/columns (`tenantId`). No
`tenantId` is read from input. No platform path.

## Audit / event / logging impact

No new audit events (none exist in this module today — residual risk). Client
error log: hydration errors no longer persisted; nothing sensitive logged.

## Integration impact

None.

## Migration / data compatibility

- Existing drafts in the unassigned package: still listed; validate now reports
  them as blocking with the reason; the tenant package appears as a move target.
- Existing published components and packages: untouched.
- Old web against new API: pages keep working; package dialogs still send
  `packageKey` (now stored as typed — the old client pre-fills it with the
  generated key, so behaviour is the same unless the user edits it).
- New web against old API: the role gate still applies (the bug persists) but
  nothing new breaks.

## Parallel-safe tasks

- PARALLEL_SAFE — T1 API guard + decorators + specs.
- PARALLEL_SAFE — T2 column payload (web lib + API service + seam spec).
- PARALLEL_SAFE — T5 error provider classification + spec.
- PARALLEL_SAFE — T6 form-control hint/name/Escape.

## Dependency-blocked tasks

- DEPENDENCY_BLOCKED — T3 web gates + seam spec (needs T1's final decorators).
- DEPENDENCY_BLOCKED — T4 publish/package/metadata service rules, then Publish
  Center / dialogs (needs T6 for Escape in dialogs).
- DEPENDENCY_BLOCKED — T7 ITEM-0183/0184 copy and presentation (after T2-T4 edit
  the same components).

## Integration tasks

- INTEGRATION — run api/web tests, typecheck, eslint; orchestrator: DB-backed e2e
  and browser QA on a throwaway database, merge, deploy.

## Testing strategy

Commands (AGENTS.md):
- `npm --workspace api run test -- customization dual-permission wiring-invariants rbac-matrix`
  (with `DATABASE_URL=postgresql://u:p@localhost:5432/dummy_test`)
- `npm --workspace api run check-types`
- `npm --workspace web run test -- customization require-settings-permission error form-control`
- `npm --workspace web run check-types`
- `npx eslint --fix <changed files>` in each workspace, then re-run tests.

New/changed specs:
- `customization-access.guard.spec.ts` — rewritten on purpose: runs the real guard
  against the real `CustomizationController` handler metadata; a user with keys and
  no customizer role (`system-admin`, and a custom role) passes; no keys → 403;
  no declared keys → 403; publish still needs `customization.publish`. Fails
  against the old guard (system-admin with keys was refused).
- `customization-web-gate.seam.spec.ts` — reads the web JSON map, resolves each
  listed API call to its controller handler via Nest route metadata, asserts the
  page's keys ⊇ handler keys, and that the component-type write keys match the
  service map. Fails when either side drifts.
- `column-payload.seam.spec.ts` — transpiles the real web `column-payload.ts`,
  builds payloads for choice, reference and blank text, runs them through a
  `ValidationPipe` configured like `main.ts`, then `CustomizationService.createColumn`
  with a stub Prisma; asserts success, and text `maxLength: 0` → 400. Fails today.
- `customization-publish-and-metadata.spec.ts` — unit: validate flags unassigned
  drafts; non-system view gets no default warning; action bar missing command →
  400; relationship reference field missing → 400; createPackage stores typed key;
  no-packageId resolves the tenant custom package.
- web `require-settings-permission.spec.ts` — permission-only (roles no longer
  admit), all-of.
- web `column-payload.spec.ts`, `runtime-error-classification.spec.ts`.

Manual / browser (orchestrator, throwaway DB): see stream report QA steps.

## Risks

1. RBAC — a custom role holding only `customization.publish` loses package CRUD
   (likelihood low, impact medium; mitigation: ADR names the specific key; noted in
   report).
2. RBAC — a handler added later without `@Permissions` is refused by the guard
   (intended fail-closed; seam spec lists handlers).
3. Tenant package provisioning on a GET (`listPackages`) is a write-on-read
   (`hidden-write-on-read` pattern). Mitigation: idempotent upsert-by-lookup, only
   when legacy unassigned drafts exist; the module already syncs the default
   solution on reads (`syncDefaultSolution`).
4. Removing the hint tooltip changes every app screen using `hint` — the text is
   still rendered once as the line under the control, so no information is lost.
5. Escape handler on `window` capture could swallow Escape for other listeners
   while a listbox is open — scoped to open state only.

## Rollback considerations

Code only. Revert the merge commit(s). No data to undo; tenant custom packages
created in the meantime are ordinary packages and remain valid under old code
(old code would still default new drafts to the unassigned package).

## Definition of Done

- [ ] Guard and web gate permission-only; seam spec green; guard spec inverted on purpose.
- [ ] Both permission families on every route (dual-permission spec green).
- [ ] Column payload seam spec green; text maxLength 0 still 400.
- [ ] Validate and publish agree; tenant package default; move targets list writable packages.
- [ ] Action bar / relationship / package key rules enforced and tested.
- [ ] No `Intl.DateTimeFormat(undefined` in customization components; hydration classifier spec green.
- [ ] form-control hint once, combobox names, Escape scoped.
- [ ] Copy removed, labels, Create wording, toasts, navigation, table widths, Publish Center names.
- [ ] api + web tests, check-types, eslint run and reported.
- [ ] Tenant scoping verified on every new query; no unrelated changes; stream report written.
