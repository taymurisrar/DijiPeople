# TASK-0031 — WP-01 stream report: Customization works end to end for permission holders

Stream report of [[TASK-0031]].

- Branch: `agent/walkthrough2-customization` (from `origin/develop` 88f33c6e)
- ExecPlan: `docs/plans/EXECPLAN-0045-customization-end-to-end-for-permission-holders.md`
- Binding: ADR-0013 (customization access is granted by permission), owner decision D3 (keep the package / prefix / layer model)
- Reserved regression ids used: REG-481 … REG-487 (REG-488, REG-489 unused)

This file is the hand-off for the orchestrator. Record files were not edited
(they are not on `develop` yet); everything the records need is below.

---

## BUG-3491 — Customization pages crash for a user who holds customization permissions but no customizer role

**Status proposed:** FIXED (browser retest pending)

### Root cause

- `services/api/src/modules/customization/customization-access.guard.ts:13-36`
  (before) admitted only `GLOBAL_ADMIN` / `SYSTEM_CUSTOMIZER` role keys and threw
  `CUSTOMIZATION_ACCESS_ROLE_REQUIRED` for everyone else.
- `apps/web/app/(authenticated)/settings/_lib/require-settings-permission.ts:95-104`
  (before) admitted on `customization.read` *or* any of three administrator roles
  (`hasAnySettingsPermission`), and every leaf page gated with
  `requireSettingsPermissions` (any-of, role bypass, redirect) and then called
  `apiRequestJson` with no handling of a 403.
- Why the role check was load-bearing: `common/security/permission-evaluation.ts:47`
  returns `true` for any elevated role (`GLOBAL_ADMIN`, `SYSTEM_ADMIN`) without
  reading a single key, so for those roles `CustomizationAccessGuard` was the only
  customization gate.
- `settings-navigation.ts` `requiredAnyRoles` is not read anywhere in `apps/web`
  (inert, not a gate) — left unchanged, outside this package's ownership.

### Fix

- **API guard** (`customization-access.guard.ts`): no role check. Requires every
  `@Permissions` key the handler declares, for elevated roles too; a handler that
  declares none is refused (fail closed). `customization.publish` missing keeps the
  code `CUSTOMIZATION_PUBLISH_PERMISSION_REQUIRED`; otherwise
  `CUSTOMIZATION_PERMISSION_REQUIRED`.
- No administrator is locked out: `services/api/src/modules/auth/auth-access.service.ts:185-191`
  gives elevated roles and the tenant owner every `FOUNDATION_PERMISSION_DEFINITIONS`
  key (all `customization.*` keys included). No grant, matrix or single-writer file
  was changed.
- **Controller decorators** (`customization.controller.ts`), both families kept on
  every route:
  - `POST packages`, `PATCH/DELETE packages/:id`, `POST packages/:id/components`,
    `DELETE packages/:id/components/:componentId`, `DELETE …/metadata`:
    `customization.publish` → `customization.packages.manage` (matrix unchanged: configure).
  - `POST packages/import/preview`: `customization.publish` → `customization.import.preview`.
  - `POST layers/ensure`: `customization.publish`/configure → `customization.read`/write;
    the service asserts the component type's own key before writing
    (`CUSTOMIZATION_COMPONENT_WRITE_KEYS`: choiceList → `customization.choice-lists.manage`,
    relationship → `customization.relationships.manage`, actionBar →
    `customization.action-bars.manage`, other types → `customization.publish`).
  - Every other route unchanged (full before/after table in EXECPLAN-0045).
- **Web gate**: `hasCustomizationPermissions` / `requireCustomizationAccess` — all
  of the keys, no roles, no redirect. One map,
  `apps/web/app/(authenticated)/settings/customization/_lib/customization-page-permissions.json`,
  lists each page's required keys and the API routes it loads; the layout and every
  page gate through `requireCustomizationPage(<page>)` and render
  `CustomizationAccessDenied` in place, also when their own API load returns 403.
  Fields/Forms/Views tab routes share one loader (`_components/module-tab-page.tsx`)
  gated on the module detail page's full key set.
- Tenant scoping unchanged; `hasElevatedTenantRole` not extended.

### Tests added / changed

- `services/api/src/modules/customization/customization-access.guard.spec.ts` —
  rewritten on purpose (the old "does not give an ordinary System Administrator
  customization access" assertion is inverted). Runs the real guard against real
  `CustomizationController` metadata.
- `services/api/src/modules/customization/customization-web-gate.seam.spec.ts` —
  reads the web JSON map; for every page asserts its keys cover the keys its API
  routes declare; runs the real guard for a `system-admin` holding exactly the
  page's keys on every route; asserts every route declares a key; asserts the
  component write keys equal the service's.
- `apps/web/app/(authenticated)/settings/_lib/require-settings-permission.spec.ts` —
  permission-only, all-of; roles alone no longer admit.

### Regression entry — REG-481

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `customization`, `apps/web` settings |
| **Bug record** | BUG-3491 |
| **Root cause** | The web Customization section admitted by permission (after BUG-3374) while `CustomizationAccessGuard` admitted only the Global Administrator and System Customizer roles. `PermissionsGuard` skips all key checks for elevated roles, so the role check was the API's only customization gate, and a System Administrator holding every key reached each page and then got 403 from its first API call — a server error page. |
| **Regression test** | `services/api/src/modules/customization/customization-web-gate.seam.spec.ts`, `services/api/src/modules/customization/customization-access.guard.spec.ts`, `apps/web/app/(authenticated)/settings/_lib/require-settings-permission.spec.ts` |
| **Scenario** | A `system-admin` or custom-role user holding exactly a page's keys passes the real guard on every API route that page loads; a user without the keys is refused whatever their role; a route with no declared key is refused; the web page map covers every key its routes declare. |
| **Proven to fail without the fix** | Mutation: guard admits by role again → guard spec and seam spec fail (see Mutation results). |
| **Note** | One rule, one map: the web pages and the seam test read the same JSON, so a key change on either side fails CI instead of crashing a screen. |
| **Fixed** | 2026-09-13 |

### QA retest (browser, throwaway DB)

1. As a user with role `system-admin` and all `customization.*` keys but **no**
   System Customizer role, open `/settings/customization`, `/modules`, a module
   detail `/tables/<key>` (every tab), `/packages`, a package, `/publish-center`,
   both designers. Expect data, no server error.
2. As a user whose only role is a custom role granted `customization.read` +
   `customization.tables.read` (no columns/forms/views read): `/modules` loads;
   `/tables/<key>` shows the in-place Access denied state, URL unchanged.
3. As a user with no `customization.*` key: `/settings/customization/*` shows
   Access denied in place; `GET /api/customization/tables` → 403
   `CUSTOMIZATION_PERMISSION_REQUIRED`.
4. Publish still requires `customization.publish`; create a package still requires
   `customization.packages.manage`.
5. After ship: remove the temporary System Customizer role from the demo owner and
   repeat step 1.

### Residual risks

- A custom role holding `customization.publish` but not
  `customization.packages.manage` loses package create/edit/delete (ADR-0013 names
  the specific key). System roles are unaffected.
- `settings-navigation.ts` still lists `requiredAnyRoles` for Customization items;
  inert today, outside WP-01 ownership — worth deleting so no one wires it up.
- DB-backed e2e for `GET /api/customization/tables` as a `system-admin` user was not
  written (no local database used); the seam test covers the guard with real
  controller metadata but not the full Nest pipeline.

---

## BUG-3492 — Every custom field type without a length is rejected

**Status proposed:** FIXED

### Root cause

- Client: `apps/web/app/(authenticated)/settings/customization/_components/columns-management.tsx:709`
  (before) sent `maxLength: supportsMaxLength(type) ? form.maxLength : null`, and a
  blank input mapped to `null` (`:554`).
- DTO: `services/api/src/modules/customization/dto/customization.dto.ts:170-173`
  `@IsOptional()` lets `null` through.
- Service: `services/api/src/modules/customization/customization.service.ts:5058`
  (before) `dto.maxLength !== undefined && dto.maxLength < 1` — `null < 1` is true.

### Fix

- Client payload built by one import-free module,
  `apps/web/app/(authenticated)/settings/customization/_lib/column-payload.ts`,
  which omits `maxLength` when the type has none or it is blank (and never sends
  `null` for optional fields).
- Service `validateValueRules`: `null` and `undefined` both mean "no length"; the
  length rule applies only to `text`, `textarea`, `email`, `phone`, `url`;
  `buildColumnData` stores `null` for other types. `maxLength: 0` on text is still
  400 (`@Min(1)`). DTO type is `number | null`.
- Dialog: Maximum length shown only for length types; errors on the field.

### Tests added

- `services/api/src/modules/customization/column-payload.seam.spec.ts` — transpiles
  the real web `column-payload.ts`, sends choice, reference (Employees), blank text,
  number, datetime and boolean payloads through a `ValidationPipe` configured like
  `main.ts` and `CustomizationService.createColumn`; text length 0 rejected; a
  legacy `maxLength: null` accepted.
- `apps/web/app/(authenticated)/settings/customization/_lib/column-payload.spec.ts`.

### Regression entry — REG-482

| | |
|---|---|
| **Bug class** | `seam` (client payload vs server validator) |
| **Module** | `customization`, `apps/web` customization |
| **Bug record** | BUG-3492 |
| **Root cause** | The Add field dialog sent `maxLength: null` for every type without a length; `@IsOptional` passed it; `validateValueRules` compared `null < 1` and refused choice, reference, number, date and boolean fields. |
| **Regression test** | `services/api/src/modules/customization/column-payload.seam.spec.ts`, `apps/web/app/(authenticated)/settings/customization/_lib/column-payload.spec.ts` |
| **Scenario** | The real client payload for each field type, through the real DTO pipe and `createColumn`, succeeds; text with length 0 fails; a stale client sending `null` succeeds. |
| **Proven to fail without the fix** | Mutations B (server null handling) and B2 (client sends `null` + server rejects it) fail the seam spec; W4 fails the web spec. |
| **Note** | The seam spec reads the client's own source, so a later change to the dialog's payload is tested against the server rather than a copy of it. |
| **Fixed** | 2026-09-13 |

### QA retest

1. Module → Fields → Add field: create Choice (two options), Reference → Employees,
   Number, Date and time, Yes/No, and Text with a blank maximum length. Each → 201,
   appears in the list with a human-readable type.
2. Text with maximum length `0` → error shown on the Maximum length field.

### Residual risks

- Edit of an existing column still sends `maxLength` only for length types; an old
  non-length column with a stored length keeps it until edited (harmless).

---

## BUG-3493 — Publishing dead-ends because new drafts land in a package that cannot be published

**Status proposed:** FIXED

### Root cause

- `customization.service.ts:582-584` and `:3994-3996` (before): no `packageId` →
  `getOrCreateUnassignedDraftPackage`.
- `validatePublishDrafts` (`:504-575`) never flagged that package; `publishComponents`
  (`:836-845`) and `publishPackage` (`:1207-1211`) refused it with their own copy of
  the rule.
- `publish-center.tsx:53-59` filtered it (and, with no other package, everything)
  out of the move targets.
- `customization.service.ts:563-568` passed every form and view draft as
  `defaultComponentKeys`.

### Fix (decision recorded in EXECPLAN-0045, model kept)

- New drafts without a package land in the tenant's own writable Custom Package,
  `getOrCreateTenantCustomPackage`: key `<publisherPrefix(tenantName)>_tenantCustomizations`
  (same prefix the unassigned package already implied, e.g. `dd_`), display name
  `<tenant name> Customizations`, found by key suffix so a tenant rename does not
  duplicate it. Ordinary package: listed, movable into, publishable, exportable.
- `listPackages` provisions it when the legacy unassigned package still holds drafts,
  so Publish Center always has a move target for them.
- `validatePublishDrafts` adds a blocking issue per draft in the legacy package
  ("… is in Unassigned Draft Customizations. Move it to a Custom Package, then
  publish."); the separate refusals in `publishComponents` and `publishPackage` were
  removed — publish runs validation, so validate and publish cannot disagree.
- Default-component warning only for forms/views with `isDefault && isSystem`.
- Publish Center: move targets = every writable, non-default, non-managed package
  except the legacy one; validation issues listed with their messages; names without
  UUIDs; "Change" column (New / Changed / Removed / Included).
- The unassigned package is never created any more; export of it stays refused.

### Tests added

- `services/api/src/modules/customization/customization-publish-and-metadata.spec.ts`
  (validation flags legacy drafts; `publishComponents` refuses the same set; a draft
  in a real package passes; no default warning for an administrator's view; warning
  kept for a system default view; tenant package created with the tenant prefix and
  scoped by `tenantId`; a draft with no package lands in it).

### Regression entry — REG-483

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `customization` |
| **Bug record** | BUG-3493 |
| **Root cause** | The default destination for every new draft was a package that publish refused and validation passed; the rule lived only in the publish paths, and Publish Center hid the only way out. |
| **Regression test** | `services/api/src/modules/customization/customization-publish-and-metadata.spec.ts` |
| **Scenario** | Validation reports a legacy-package draft as blocking and publish refuses exactly that set; a draft created without a package lands in the tenant's writable Custom Package; a non-default view gets no default-component warning. |
| **Proven to fail without the fix** | Mutations C (validation ignores the legacy package) and D (every form/view is "default") fail the spec. |
| **Note** | The rule exists once, in validation. Do not re-add a publish-side copy. |
| **Fixed** | 2026-09-13 |

### QA retest

1. Fresh tenant (no Custom Package): create a module, a field, a view, a choice list,
   leaving package choices blank. Publish Center lists them in "<Tenant> Customizations".
   Select all → Validate → "Ready to publish" → Publish → success; runtime metadata
   snapshot version increments.
2. Demo tenant with legacy drafts in "Unassigned Draft Customizations": Validate
   shows one blocking issue per such draft; Move to package lists
   "<Tenant> Customizations" and "QA Walkthrough Package"; move → Validate → Publish.
3. Validation of an administrator-created view shows no "default component" warning.

### Residual risks

- `listPackages` writes on read (only when legacy drafts exist; idempotent) —
  `hidden-write-on-read` pattern, same as the existing `syncDefaultSolution`.
- The auto-generated module form/view/action bar still appear as drafts the
  administrator did not create by hand; they are part of the module and must
  publish with it (not changed).
- Prefix mismatch between a component's logical name and its package (walkthrough
  C20) is not validated — out of scope; moving legacy `dd_` drafts into another
  publisher's package still works.

---

## BUG-3495 — Customization editors accept invalid metadata and silently rewrite input

**Status proposed:** FIXED (items listed below); prefix-mismatch rule NOT_DONE (out of WP-01 scope)

### Root cause (established)

- Package key: `customization.service.ts:1384-1392` (before) stored
  `prefix + camelize(displayName)`, never `dto.packageKey`.
- Action bar: `metadata-components-management.tsx:1307-1308` (before) silently
  dropped rows without a command on save; the API (`ensureCustomizationLayer`)
  validated no metadata.
- Relationship: reference field was a free `TextField`
  (`metadata-components-management.tsx:890-894`) and the API never checked it.
- `dd__` hint: `metadata-components-management.tsx:494` rendered
  `${prefix}_` where `packagePrefix()` already ends in `_`.
- Escape: `apps/web/app/components/ui/dialog.tsx:216` listens on `document` in the
  capture phase, so it runs before a combobox's own handler and closes the dialog;
  `SearchableSelect` had no Escape handling at all.
- Lifecycle: `customization.service.ts:5334` (before) hardcoded
  `lifecycleState: 'published'` for every module; `columns-management.tsx:188`
  hardcoded "Default Package"/"Custom Package" and listColumns returned no lifecycle.

### Fix

- API `validateLayerMetadata`: action bar rows must have a non-empty command
  (400 "Action N has no command…"); relationship `referenceField` must be a lookup
  column of the source module (system definition or active tenant column,
  tenant-scoped query); deactivation (`isActive: false`) is exempt.
- `createPackage` stores the validated `dto.packageKey` (DTO pattern + existing 409).
- Relationship dialog: reference field is a select of the module's reference fields;
  labels "Many-to-many" and plain cascade wording (no "metadata-ready").
- Action bar dialog: rows are validated by position; nothing silently dropped.
- Prefix hint removed (ITEM-0183).
- `form-control.tsx`: `useListboxEscape` — an open `SelectField`/`LookupField` (and
  the action bar's `SearchableSelect`) handles Escape on `window` in the capture
  phase, closes itself and stops the event; with everything closed, Escape reaches
  the dialog as before.
- Module lifecycle/package from its table component; each field's lifecycle/package
  from its column components; Fields tab and module list show real package names.

### Tests added

- `services/api/src/modules/customization/customization-publish-and-metadata.spec.ts`
  (action bar missing command → 400 naming the row; missing reference field → 400;
  real reference field accepted into the tenant package; legacy deactivation allowed;
  missing type write key → 403; typed package key stored).
- `apps/web/app/components/ui/listbox-escape.spec.ts` (the Escape decision; window-
  vs document-capture ordering; both comboboxes wired and named; hint not rendered
  as a tooltip).

### Regression entries

**REG-484**

| | |
|---|---|
| **Bug class** | `silent-degradation` |
| **Module** | `customization` |
| **Bug record** | BUG-3495 |
| **Root cause** | `layers/ensure` stored action bars with command-less rows and relationships over non-existent reference fields; `createPackage` replaced the typed key with a derived one. |
| **Regression test** | `services/api/src/modules/customization/customization-publish-and-metadata.spec.ts` |
| **Scenario** | Command-less action row → 400 naming the row; reference field that is not a lookup column → 400; real one accepted; deactivating a legacy component still allowed; typed package key stored exactly. |
| **Proven to fail without the fix** | Mutations E, F, G fail the spec. |
| **Note** | Server-side, so no client can bypass it. |
| **Fixed** | 2026-09-13 |

**REG-485**

| | |
|---|---|
| **Bug class** | `structural-guard-lost-in-rewrite` (event ordering) |
| **Module** | `apps/web` shared form controls |
| **Bug record** | BUG-3495 |
| **Root cause** | `useDialogBehavior` handles Escape on `document` in the capture phase, so pressing Escape to close a dropdown closed the whole dialog and discarded input. |
| **Regression test** | `apps/web/app/components/ui/listbox-escape.spec.ts` |
| **Scenario** | An open listbox closes on Escape and stops propagation; its listener is on `window` capture (runs before the dialog's `document` capture); both comboboxes use it. |
| **Proven to fail without the fix** | Mutation W2 (listener moved to `document`) fails the spec. |
| **Note** | Source-reading because web jest has no jsdom; comments stripped and CRLF normalised before matching. |
| **Fixed** | 2026-09-13 |

### QA retest

1. Action Bars → Add action bar → add a row, leave "Choose a command" → Create →
   "Action N needs a command…"; API with the same payload → 400.
2. Relationships → Add relationship → Reference field offers only the module's
   reference fields; API with `referenceField: "dd_assignedEmployee"` (non-existent) → 400.
3. Packages → New package, key `qw_walkthrough` → stored key `qw_walkthrough`.
4. In Add field / Add relationship / Action bar dialogs, open any dropdown, press
   Escape → dropdown closes, dialog and typed input remain; Escape again closes dialog.
5. Module list: a module whose components are all Draft reads "Draft"; after publish
   "Published"; Package column shows the owning package's name.

### Residual risks

- A component's prefix vs its package publisher prefix is still not validated
  (walkthrough C20); needs a product decision (reject vs rename on move).
- "Registered command" is enforced as non-empty on the server; the web catalog check
  (unknown command warning) remains client-side only — the API has no command registry.

---

## BUG-3496 — Hydration mismatch opens a blocking raw React error modal and logs a 500

**Status proposed:** FIXED (source confirmed in code; needs browser confirmation)

### Root cause

- Mismatch source: `publish-center.tsx:576`, `packages-list.tsx:718`,
  `package-detail-shell.tsx:1274` (before) formatted dates during render with
  `new Intl.DateTimeFormat(undefined, …)` — server locale/timezone during SSR,
  browser's after hydration (the documented pattern in
  `app/components/filters/use-formatting-context.ts`). The module detail page shows
  the metadata tables whose Modified column went through the same kind of
  render-time formatting (`tables-list.tsx:557` used a fixed `"en"` locale but the
  runtime default timezone).
- Interceptor: `apps/web/app/components/errors/error-provider.tsx:58-75` (before)
  sent every window error to the modal and `persistClientError` as 500.

### Fix

- All customization date rendering uses `useFormattingContext()` +
  `formatDate`/`formatDateTime` from `lib/formatting-context.ts` (publish center,
  packages list, package detail, modules list). No
  `Intl.DateTimeFormat(undefined` remains under `settings/customization`.
- `apps/web/app/components/errors/runtime-error-classification.ts`
  (`classifyRuntimeError`): React hydration errors (#418/#419/#422/#423/#425 and the
  development messages) → ignore (no modal, not persisted); other minified React
  errors → shown and logged with a plain message instead of React's text;
  ResizeObserver noise and aborts ignored as before. `error-provider.tsx` routes
  window `error` / `unhandledrejection` through it.

### Tests added

- `apps/web/app/components/errors/runtime-error-classification.spec.ts`.

### Regression entry — REG-486

| | |
|---|---|
| **Bug class** | `silent-degradation` (misclassified recoverable error) |
| **Module** | `apps/web` errors, `customization` |
| **Bug record** | BUG-3496 |
| **Root cause** | Render-time dates formatted with the environment's locale differed between SSR and the browser (React #418); the global handler treated the recoverable hydration error as fatal, showed raw minified text in a blocking modal and logged a 500 on every load. |
| **Regression test** | `apps/web/app/components/errors/runtime-error-classification.spec.ts` |
| **Scenario** | Hydration errors are ignored; an ordinary runtime error is still reported; a non-hydration minified React error is reported with a plain message. |
| **Proven to fail without the fix** | Mutation W1 fails the spec. |
| **Note** | The source fix is the explicit formatting context; the classifier only stops a future mismatch from becoming a modal and a false 500. |
| **Fixed** | 2026-09-13 |

### QA retest

1. Load `/settings/customization/tables/<key>` and `/settings/customization/publish-center`
   with the console open: no React #418, no error modal, no POST to
   `/api/error-logs/client`.
2. Compare the server HTML (`page.request.get()`) and hydrated DOM dates on the
   packages list and publish center: identical.
3. Force a runtime `TypeError` from the console: modal still opens and is logged.

### Residual risks

- The mismatch source on the module detail page was identified by code reading, not
  by a development-build reproduction; if #418 persists there in the browser, the
  classifier keeps it silent and the remaining source must be found with a dev build.

---

## ITEM-0183 / ITEM-0184 — customization rows

**Status proposed:** DONE for the customization rows listed; employee-record rows are WP-03.

- `apps/web/app/components/ui/form-control.tsx`: `FieldShell` renders a hint once
  (the line under the control); the "i" tooltip is removed. All apps keep the hint
  text. `SelectField` and `LookupField` comboboxes get `aria-labelledby` pointing at
  their visible label.
- Removed explanatory copy: Create module subtitle and "Use camelCase…" and
  "Inactive modules…" hints; Add field subtitle, system-field notices, logical-name
  hint, Fields section description; choice list / relationship / action bar dialog
  paragraph, prefix hint, section descriptions, placement description, "Drag to
  reorder…" line; Create view subtitle, system-view note, camelCase hint and the
  Employee-column JSON examples; Forms dialog subtitle and section description;
  Sidebar Designer page and section descriptions; package picker's "Unassigned Draft
  Customizations" paragraphs; package dialog subtitle; every Customization page's
  SettingsShell description; Module Properties description and misleading "Route".
- Field-type labels human-readable (Text, Date and time, Yes/No, Reference, Choice,
  Multiline text…), also in the Fields list.
- Reference target shown only for Reference fields; Maximum length only for length types.
- Create dialogs say Create / Creating…; edit dialogs Save.
- Success toasts (`useSideToast`) after create/save/delete in module, field, view,
  form, choice list, relationship, action bar dialogs and both designers.
- New module: logical name derived from the display name and shown read-only; after
  create the user is taken to the new module.
- Module detail and tab headers use the display name.
- Tables: redundant columns removed (Route, Source duplicate, UUID lines), minimum
  widths reduced (modules 980→860px, fields 1060→760px, components 1040→820px,
  publish center 1180→900px).
- Publish Center: names without UUIDs; "Change" column with plain values; package
  detail "Layer action" → "Change".

### Regression entry — REG-487

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` (duplicated rendering) |
| **Module** | `apps/web` shared form controls |
| **Bug record** | ITEM-0183 |
| **Root cause** | `FieldShell` rendered `hint` both as a tooltip beside the label and as the feedback line, so every hint appeared twice; `SelectField`'s generated id landed on a wrapper `div`, leaving the combobox unnamed. |
| **Regression test** | `apps/web/app/components/ui/listbox-escape.spec.ts` ("renders a hint once", "names both comboboxes") |
| **Scenario** | No `${label} help` tooltip button exists; both comboboxes carry `aria-labelledby={labelId}`. |
| **Proven to fail without the fix** | Restoring the tooltip or dropping `aria-labelledby` fails the named assertions (source-reading). |
| **Note** | No explanatory text was added anywhere as a remedy. |
| **Fixed** | 2026-09-13 |

### QA retest

1. Add field dialog: no hint appears twice; screen reader announces "Field type" and
   "Reference target" comboboxes by name.
2. At 1440px: Modules, Fields, Publish Center tables show every column without clipping.
3. Create module "QA Asset" → lands on its detail page with a success toast; header
   reads "QA Asset".
4. Form designer / view designer Save → success toast.

### Not done / residual

- Form designer drag-to-add (C13) not changed.
- "Page headers show system names" (QaAsset / Main): the SettingsShell titles now use
  display names; the exact place the walkthrough saw "QaAsset" was not reproducible
  from code — verify in the browser.
- Widgets tab create (C9) and custom-module runtime (C10/C21) are WP-02 / out of scope.

---

## Commands run (final state, commit 0c52ba76)

| Command | Result |
|---|---|
| `npm --workspace api run test -- modules/customization dual-permission wiring-invariants rbac-matrix` (with dummy `DATABASE_URL`) | 16 suites, 143 tests passed |
| `npm --workspace web run test` (full suite) | 97 suites, 1869 tests passed |
| `npm --workspace web run check-types` | passed |
| `npm --workspace api run check-types` | only pre-existing failure: `src/common/storage/providers/r2-object-storage.provider.ts` cannot find `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` (modules absent from the junctioned `node_modules`; file untouched) |
| `npx eslint --fix` on every changed file (api, web) | 0 errors; warnings only: unsafe-`any` in spec helpers, one pre-existing `jsx-a11y/no-autofocus` |

Not run: DB-backed e2e (`test:e2e`), browser verification — orchestrator, throwaway DB.

## Mutation results

Each fix reverted in the working tree, the named specs run, the file restored byte
for byte (scripts kept in the session scratchpad; tree verified clean afterwards).

| Mutation | Specs | Result |
|---|---|---|
| A guard admits by role again (BUG-3491) | guard spec, web-gate seam | caught — 11 failed |
| B server treats `null` maxLength as < 1 | column-payload seam | caught — 1 failed |
| B2 client sends `null` again and server rejects it (the original seam bug) | column-payload seam | caught — 7 failed |
| C validation ignores the unassigned package (BUG-3493) | publish-and-metadata | caught — 2 failed |
| D every form/view is a "default component" | publish-and-metadata | caught — 1 failed |
| E createPackage rewrites the typed key | publish-and-metadata | caught — 1 failed |
| F action row without a command accepted | publish-and-metadata | caught — 1 failed |
| G missing reference field accepted | publish-and-metadata | caught — 1 failed |
| H component type write key not checked | publish-and-metadata | caught — 1 failed |
| W1 hydration errors not ignored (BUG-3496) | runtime-error-classification | caught — 6 failed |
| W2 listbox Escape on `document` (dialog wins) | listbox-escape | caught — 1 failed |
| W3 web gate back to role bypass / any key | require-settings-permission | caught — 5 failed |
| W4 client sends maxLength for every type | column-payload (web) | caught — 3 failed |
| W6 SelectField combobox loses its accessible name | listbox-escape | caught — 1 failed |

14/14 caught.
