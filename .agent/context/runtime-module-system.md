# Runtime Module System

> **Last verified:** 2026-08-21
> **Verified against commit:** 08b8661 (platform runtime section re-derived)
> **Key source files:** apps/web/lib/runtime/modules/standard-module-runtime.ts, apps/web/lib/runtime/modules/standard-module-specs.ts, apps/web/lib/runtime/modules/standard-module-data.adapter.ts, apps/web/lib/runtime/modules/standard-module-route-helpers.ts, apps/web/lib/runtime/module-data-adapter.types.ts, apps/web/lib/runtime/command-execution.service.ts, apps/web/lib/runtime/command-runtime.resolver.ts, apps/web/app/components/runtime/standard-module-list-page.tsx, apps/web/app/components/runtime/standard-module-record-page.tsx, apps/web/app/components/runtime/module-list-page.tsx, apps/web/app/components/runtime/module-record-page.tsx, apps/web/app/components/runtime/module-runtime-command-handler.tsx, apps/admin/lib/runtime/platform-module-registry.ts, apps/admin/lib/runtime/http-module-runtime-adapter.ts, apps/admin/app/_components/crm/data-table.tsx, services/api/src/modules/platform-runtime/platform-runtime.controller.ts, scripts/generate-platform-runtime-schema.mjs, packages/config/platform-runtime-schema.test.js
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

There are **two independent runtimes**. They share vocabulary (module, view,
form, command, adapter) and share nothing else — no code, no types, no registry.

| | Tenant runtime (`apps/web`) | Platform runtime (`apps/admin`) |
|---|---|---|
| Module source of truth | TS spec objects in `lib/runtime/modules/*-specs.ts` | TS definitions in `lib/runtime/platform-module-registry.ts` |
| Metadata built | in-process from the spec, per request | in-process from the definition, validated against generated Prisma schema |
| Data path | domain REST endpoints via `app/api/**` proxies | one generic controller `/api/platform-runtime/:moduleKey` |
| Table | `ModuleDataTable` (`app/components/runtime/module-data-table.tsx`) | `ProDataTable` (`app/_components/crm/data-table.tsx`) |

### Tenant runtime — the real path

A spec object (`StandardModuleRuntimeSpec`,
`apps/web/lib/runtime/modules/standard-module-runtime.ts:96-147`) is the single
declaration for a module: entity logical name, route base, fields, views, form
fields/sections, commands, widgets, related tabs, API paths, adapter
capabilities and permission keys.

`buildStandardModuleRuntimeContext(...)`
(`standard-module-runtime.ts:149-187`) turns a spec + a `RuntimePrincipal` into
a `ModuleRuntimeContext` (`apps/web/lib/runtime/module-runtime.types.ts:41-50`):
`{ tenant, security, module, metadata, pageKind, recordId, cacheKeys }`. It
calls `buildStandardModuleConfig` (`:240`), `buildStandardModuleMetadataBundle`
(`:211`) which fans out to `buildStandardEntity` (`:258`),
`buildStandardFields` (`:324`), `buildStandardForm` (`:440`),
`buildStandardView` (`:723`) and `buildStandardCommands` (`:754`).

**Nothing is cached and nothing is registered.** The bundle is rebuilt on every
server render.

#### List page render path (example: `/leaves`)

1. `apps/web/app/(authenticated)/leaves/page.tsx:27` — server component checks
   business-unit scope first, renders `AccessDeniedState` on failure (`:29-38`).
2. `:40-48` `Promise.all([searchParams, getSessionUser(), getCurrentEmployee(),
   apiRequestJson("/tenant-settings/resolved")])`.
3. `:66-73` the spec is **narrowed per-user** (views filtered when the user
   cannot see team leave) — specs are plain objects, so this spreading pattern
   is the sanctioned way to vary a module by principal.
4. `:74-84` `buildStandardModuleRuntimeContext({ pageKind: "list", principal:
   buildStandardRuntimePrincipal(sessionUser), spec })`.
5. `:99` data is fetched from the domain endpoint the page chooses
   (`/leave-requests/team` vs `/leave-requests/mine`, `:95-98`) — **not** by the
   runtime.
6. `:124` `<StandardModuleListPage records runtime activeView formatting … />`.

`StandardModuleListPage` (`apps/web/app/components/runtime/standard-module-list-page.tsx:20`)
is a client component. It owns selection + active view state (`:59-73`), applies
view filters client-side (`applyRuntimeViewFilters`, `:143-162`), does optional
client pagination (`:78-99`), resolves the adapter
(`dataAdapter ?? createStandardModuleDataAdapter(spec)`, `:100-104`) and renders
`ModuleListPage` with a `ModuleDataTable` in `tableSlot` (`:125-137`).

`ModuleListPage` (`module-list-page.tsx:18`) is where the chrome lives:
`TenantRuntimeStyleProvider` → `ModuleRuntimeProvider` →
`ModuleRuntimeCommandHandler` → `ModuleRefreshOverlay` + `ModuleListShell`
(`:159-194`). Commands for the surface come from
`resolveCommandsForSurface(runtime.metadata.commands, "list", { principal,
record, selectedRecordIds })` then `groupCommands` (`:110-125`). Active view is
mirrored into the `?viewId=` query param (`:80-109`, `:141-157`).

#### Record page render path (example: `/leaves/[id]`)

1. `apps/web/app/(authenticated)/leaves/[id]/page.tsx:20-27` — resolve params +
   session, fetch the record from the domain endpoint.
2. `:28-33` `buildPublishedStandardRouteRuntime({ pageKind: "detail", recordId,
   sessionUser, spec })`.
3. `:34-36` `resolveStandardActiveForm(runtime.metadata.forms, formId)`.
4. `:41` `<StandardModuleRecordPage activeForm mode="read" record recordId
   runtime spec />` → `ModuleRecordPage`
   (`standard-module-record-page.tsx:49-64`), after deriving lookup display
   values from the record's nested relations (`:67-89`).

`buildPublishedStandardRouteRuntime`
(`standard-module-route-helpers.ts:49-70`) is the **only tenant-side metadata
layering that actually runs**: it fetches tenant-published forms via
`getTableForms(spec.metadataTableKey ?? spec.moduleKey)`
(`apps/web/lib/customization-forms.ts:113`, which GETs
`/runtime-metadata/published`), keeps only forms carrying explicit widget
placement (`hasExplicitWidgetPlacement`, `:91-97`), maps the designer layout
JSON into `FormMetadata` (`mapPublishedForm`, `:124-209`) and replaces the
matching spec-built form (`mergePublishedWidgetForms`, `:99-122`). Forms with
no `components` key are ignored, so a tenant form designer edit only reaches the
renderer if it has widget placements.

#### Command execution

`ModuleRuntimeCommandHandler`
(`apps/web/app/components/runtime/module-runtime-command-handler.tsx:204-215`)
calls `executeRuntimeCommand(request, { commandHandlers:
buildAdapterCommandHandlers({…}) , … })`.

`executeRuntimeCommand`
(`apps/web/lib/runtime/command-execution.service.ts:16-80`) resolves the command
(`:21`), gates it with `validateCommandExecutable` (`:31-46`, checks metadata
state, record, principal, selection), then picks a handler in this precedence
order (`:48-52`):

```
adapters.commandHandlers[command.key]
  ?? adapters.handlers[command.handlerKey]
  ?? getCommandKeyHandler(command.key)     // module-level registry
  ?? getCommandHandler(command.handlerKey) // handler-level registry
```

If none matches it falls back to `executionMode`: `navigation` (`:143-184`,
with `inferNavigationConfig` deriving `/…/new`, `/…/{recordId}/edit`,
`back`, `refresh` from the command key suffix, `:237-258`), `api` (`:186-235`),
or `noop` (`:66-72`). Results are `success | failure | navigation |
refreshRequired` (`:110-136`); `invalidateCacheKeys` on a handler result is what
triggers `refreshRequired`.

Module-specific handlers are declared **inside the data adapter**, keyed by
`spec.moduleKey`: see `standard-module-data.adapter.ts:33-68` (`leave.approve`,
`leave.reject`), `:69-86` (timesheets overriding `system.new`/`system.save`),
`:87-…` (`attendance.checkIn` / `attendance.checkOut`).

#### Data adapter

`ModuleDataAdapter` (`apps/web/lib/runtime/module-data-adapter.types.ts:81-150`)
is the contract: `list`, `getById`, `create`, `update`, `softDelete`,
`assignOwner`, `changeStatus`, `exportRecord`, `exportList`, the four
related-record methods, plus optional `getOwnerOptions`, `getLookupOptions`,
`getTimelineEntries`, `getWidgetData`, `commandHandlers`.

`createStandardModuleDataAdapter(spec)`
(`apps/web/lib/runtime/modules/standard-module-data.adapter.ts:23`) is the
generic implementation. Base path is `spec.apiPath ?? "/api" + spec.routeBase`
(`:26`). All calls go through `requestJson` (`:610-652`), a browser `fetch`
against the Next route handlers with `x-dijipeople-error-handling: inline`
(`:615`) and error normalisation onto `error.data` (`:636-646`). It also does
substantial payload sanitisation before mutations
(`sanitizeStandardMutationValues`, `:802`; `sanitizeStandardFieldValue`, `:991`).

`employees` is the one module with a hand-written adapter and metadata adapter
(`apps/web/lib/runtime/modules/employee-data.adapter.ts` 870 lines,
`employee-metadata.adapter.ts` 2698 lines,
`employee.module.ts:23-34` for the `ModuleConfig`). It is injected by
`EmployeeRuntimeListWrapper`
(`apps/web/app/(authenticated)/employees/_components/employee-runtime-list-wrapper.tsx:8`)
into the same `StandardModuleListPage`.

#### Modules currently declared

`standard-module-specs.ts`: `customers` (`:213`), `projects` (`:432`),
`leaves` (`:1077`), `attendance` (`:1277`), `timesheets` (`:1608`),
`recruitmentApplications` (`:1684`), `recruitmentCandidates` (`:1776`),
`recruitmentTalentPool` (`:2210`), `recruitmentJobs` (`:2287`),
`onboarding` (`:2587`), `approvals` (`:2851`).

`payroll-foundation-runtime-specs.ts`: `payroll-cycles` (`:24`),
`payroll-calendars` (`:269`), `payroll-periods` (`:364`),
`employee-compensation` (`:455`), `payroll-runs` (`:552`), `payslips` (`:762`),
`loans` (`:834`), `benefit-assignments` (`:950`),
`employee-bank-accounts` (`:1069`), `banks` (`:1275`),
`employer-bank-accounts` (`:1319`), `payroll-exceptions` (`:1396`).

Plus `employees` via `employee.module.ts`. 67 files under `apps/web/app` import
`StandardModuleListPage`/`StandardModuleRecordPage`; there are 230 `page.tsx`
files in `apps/web/app` total.

### Platform runtime (`apps/admin`)

`apps/admin/lib/runtime/platform-module-registry.ts` (3,719 lines) declares
every platform module inline via a `define(...)` helper (`:3209`), with views,
forms, columns, actions, statuses and role gates
(`ALL_PLATFORM_ROLES`, `:20-35`).

**It self-validates at module load and throws.**
`platform-module-registry.ts:3150-3183`: every definition is passed through
`validateRuntimeDefinition` from `@repo/config`, then six modules
(`leads`, `customers`, `customer-onboarding`, `tenants`, `partners`,
`contracts`, `:3153-3160`) additionally require that every readable non-relation
schema field appears on some record form. Any failure throws at import time, so
the admin app will not boot.

`validateRuntimeDefinition` / `getRuntimeSchema` / `resolveRuntimeField` read
`packages/config/platform-runtime-schema.generated.json` (4.5 MB), produced by
`scripts/generate-platform-runtime-schema.mjs` by regex-parsing
`services/api/prisma/schema.prisma` (`:33-47`). Per field it derives
`readable/creatable/editable/filterable/sortable/searchable/exportable`,
`systemManaged` (`:78-82`), `sensitive` (`:59-60` pattern covers
password/secret/token/session/privateKey/apiKey/signature/…) and a
`defaultControl` (`:153-164`). 17 modules are mapped to Prisma models at
`:13-31`; `contracts.contentHtml` is a hand-added relation projection
(`:134-141`).

- Regenerate: `npm run generate:runtime-schema`
- Validate: `npm run test:runtime-schema` →
  `packages/config/platform-runtime-schema.test.js` (asserts 17 modules, that
  `PlatformUser.passwordHash` is non-readable/non-exportable, and that
  validation rejects missing/unsortable fields).

Client data access is `createHttpModuleRuntimeAdapter(moduleKey)`
(`apps/admin/lib/runtime/http-module-runtime-adapter.ts:12`), hitting
`/api/platform-runtime/{moduleKey}` (`:16`) with `RuntimeApiError` for
normalised failures (`:167-177`). Views and form definitions are answered from
the local registry, not the network (`:42-49`, `:105-110`).

Server side: `PlatformRuntimeController`
(`services/api/src/modules/platform-runtime/platform-runtime.controller.ts:20-21`)
is `@UseGuards(JwtAuthGuard)` on `platform-runtime` with routes for export
(`:24`), collection/record actions (`:38`, `:46`), timeline (`:55`, `:62`),
business process (`:70`, `:77`), related (`:85`), validate (`:94`) and
list/create/get/update/delete (`:101`-`:130`).

Admin page components: `apps/admin/app/_components/runtime/` —
`runtime-module-page.tsx` (server: auth + user module preference →
`RuntimeModuleList`), `runtime-record-route.tsx` (server auth wrapper →
`RuntimeRecordPage`), `runtime-module-list.tsx`, `runtime-record-page.tsx`,
`runtime-form.tsx`, `module-action-bar.tsx`, `record-status-group.tsx`,
`record-command-bar.tsx`, `runtime-view-selector.tsx`.
33 of 82 admin `page.tsx` files go through `RuntimeModulePage`/`RuntimeRecordRoute`.
Line counts were removed here rather than restated: they were wrong within a
week of being written and nothing validates them, which is the `doc-code-drift`
pattern applied to this document itself.

### The record command bar is a default, not a per-module decision

`define()` builds each module's command bar from a `capabilities` map —
`{ create, update, delete }` — and merges the module's own declared actions over
it, keyed on `(key, scope)`. Consequences worth knowing before changing a
module:

- **Back and Refresh are unconditional** on every record page except the
  dashboard. `record-new` and `record-refresh` are separate keys from the
  list-scope `new` and `refresh`, because the two do different things.
- **`capabilities` restates `PlatformRuntimeService`'s `create` / `update` /
  `remove` switch statements**, and
  `apps/admin/lib/runtime/platform-module-capabilities.spec.ts` re-derives all
  three from that source and fails on drift. Do not edit the map to make a
  button appear; add the API branch.
- The standard commands are sorted into one fixed order — Back, New, Edit,
  Save, Save and close, Refresh, Delete — so a button does not move between
  modules. Module-specific actions follow in declared order.
- Five detail pages are bespoke rather than runtime-rendered — contract
  templates, signature requests, invoices, partner inquiries, partner
  onboarding. Four take their actions from the registry; all five use
  `runStandardRecordCommand` (`lib/runtime/standard-record-commands.ts`) for
  Back / New / Refresh, so a registry default reaching them is implemented
  rather than merely rendered.

### The record header status group

`RecordStatusGroup` draws Owner, Status and Sub-status at the top right of every
record, the D365 arrangement. The slots come from `recordHeader` on the module
definition, which `define()` derives from the generated Prisma manifest — a slot
exists only when the model carries the field, and labels and options come from
the record form where it declares them.

**A slot is read-only unless it names a governed write route.** `assign` and
`change-status` are the only two, and only the modules
`PlatformRuntimeService.bulkAssign` and `.changeStatus` implement get them
(assign: leads, partners, customers, support-cases; change-status: leads,
partners, support-cases). Everything else displays and explains why it cannot be
changed there. A header dropdown that PATCHed a lifecycle column directly would
route around whatever the owning service does on a transition.

## Key abstractions

- **`StandardModuleRuntimeSpec`** — the declaration. One object = one module.
- **`ModuleRuntimeContext`** — tenant + principal + module config + metadata
  bundle, rebuilt per request, passed down as a prop.
- **`ModuleDataAdapter`** — the only thing that talks to the network from the
  client runtime.
- **`CommandDefinition` + `executeRuntimeCommand`** — every button on a runtime
  page is a command with a `placement`, `scope`, `permission` and
  `executionMode`.
- **`ModuleRuntimeProvider` / `useModuleRuntime`**
  (`module-runtime-provider.tsx:29`, `:66`) — context for descendants.
- **`PlatformModuleDefinition` + generated Prisma manifest** — the admin
  equivalent, with a compile/boot-time consistency gate.

## Known exceptions

- **`module-registry.ts`, `metadata-registry.ts`, `command-registry.ts`,
  `module-runtime.resolver.ts` and `metadata-layer-resolver.ts` are unused
  scaffolding.** Nothing anywhere calls `registerModule`,
  `registerEntityMetadata`, `registerFormMetadata`, `registerViewMetadata`,
  `registerCommand`, `registerCommandHandler`, `registerCommandKeyHandler`,
  `resolveModuleRuntimeContext` or `resolveMetadataLayers`. Their own comments
  say so (`module-registry.ts:21-22`, `metadata-registry.ts:53-54`,
  `command-registry.ts:50-51`). `getEntityMetadata` *is* called
  (`module-data-table.tsx:424`, `standard-module-record-page.tsx:120`) but
  always returns `null` and falls back to `"name"`. Do not "wire up" these
  registries as a side effect of another task.
- **`employees`** bypasses the generic adapter with `employee-data.adapter.ts` /
  `employee-metadata.adapter.ts` (3.5k lines combined). It is the exception, not
  the template.
- **Per-user spec narrowing** — `leaves/page.tsx:66-73` spreads the spec to drop
  views. Legitimate, but it means the runtime context is not identical across
  users; never assume `spec === runtime.module`.
- **Client-side view filtering** — `applyRuntimeViewFilters`
  (`standard-module-list-page.tsx:143`) supports only `eq`, `neq`, `in`. Any
  richer filter must be pushed into the API query the page makes.
- **`ModuleListShell` filtering is cosmetic**: list pages fetch their own data
  server-side; the runtime does not re-query on view change unless the page
  reads `?viewId=` and refetches.
- **Web runtime never calls a Nest controller directly** — it calls
  `/api/**` route handlers in the Next app. Admin's runtime adapter also calls
  `/api/platform-runtime/**` in the Next app, which proxies to Nest.

## Anti-patterns to avoid

1. **Building a bespoke CRUD page next to the runtime.** This is the primary
   anti-pattern in this repository. A hand-rolled list + table + form + action
   bar for a domain that could be a spec creates a second source of truth for
   columns, permissions and commands, and it silently stops receiving runtime
   fixes. If the runtime cannot express the requirement, say so explicitly in
   the plan and name the missing capability.
2. **Adding a third registry.** Do not create a new module/metadata/command map
   because the existing ones look unused. Extend
   `standard-module-specs.ts` / `payroll-foundation-runtime-specs.ts` /
   `platform-module-registry.ts`.
3. **Hand-editing `packages/config/platform-runtime-schema.generated.json`.**
   It is generated from `schema.prisma`. Edit the schema and rerun
   `npm run generate:runtime-schema`.
4. **`fetch` from a runtime component.** Network access belongs in the data
   adapter (`requestJson`, `standard-module-data.adapter.ts:610`) or in the
   server component that renders the runtime page.
5. **Treating command permission gating as security.**
   `filterCommandsByPermission`
   (`apps/web/lib/runtime/command-runtime.resolver.ts:75`) and the admin role
   gates hide buttons. Enforcement is the API's job.
6. **Copying `ProDataTable` into `apps/web` or `ModuleDataTable` into
   `apps/admin`.** They are deliberately separate kits.
7. **Registering a module key that does not match its `routeBase`/API path.**
   The adapter derives `"/api" + spec.routeBase` when `apiPath` is absent
   (`standard-module-data.adapter.ts:26`), and command handlers are selected by
   `spec.moduleKey` string equality (`:33`, `:69`, `:87`).

## TARGET (required going forward)

Registering a new tenant module, end to end:

1. Add a `StandardModuleRuntimeSpec` to
   `apps/web/lib/runtime/modules/standard-module-specs.ts` (or
   `payroll-foundation-runtime-specs.ts` for payroll). Set `moduleKey`,
   `entityLogicalName`, `collectionName`, `routeBase`, `primaryNameField`,
   `fields`, `views`, `formFields`/`formSections`, `permissions`, and
   `apiPath` if it differs from `"/api" + routeBase`.
2. Confirm the API endpoints the adapter will call already exist under
   `services/api/src/modules/<domain>/`, with `@Permissions` +
   `@RequirePermission` and tenant scoping.
3. Add the Next route-handler proxies under `apps/web/app/api/<route>/` if not
   present.
4. Create `apps/web/app/(authenticated)/<route>/page.tsx`: fetch session +
   records, call `buildStandardModuleRuntimeContext` (list) and render
   `StandardModuleListPage`.
5. Create `apps/web/app/(authenticated)/<route>/[id]/page.tsx` and `new/page.tsx`
   using `buildPublishedStandardRouteRuntime` +
   `resolveStandardActiveForm` + `StandardModuleRecordPage`.
6. Add module-specific commands to `spec.commands` and their handlers to the
   `commandHandlers` block in `standard-module-data.adapter.ts` keyed on
   `spec.moduleKey`. Only write a bespoke adapter if the generic one genuinely
   cannot express the calls.
7. Add navigation + permission keys in `apps/web/lib/security-keys.ts` /
   `lib/permissions.ts` for UI gating.
8. Extend `apps/web/lib/runtime/modules/standard-module-views.spec.ts` for the
   new views.

Registering a new platform module:

1. Add the Prisma model → module key mapping in
   `scripts/generate-platform-runtime-schema.mjs:13-31`, run
   `npm run generate:runtime-schema`, and run `npm run test:runtime-schema`
   (update the module-count assertion at
   `packages/config/platform-runtime-schema.test.js:13`).
2. Add the definition via `define(...)` in
   `apps/admin/lib/runtime/platform-module-registry.ts` — views, forms,
   columns, actions, statuses, role gates.
3. Support the module key in
   `services/api/src/modules/platform-runtime/platform-runtime.service.ts`.
4. Add `page.tsx` files under `apps/admin/app/(internal)/…` rendering
   `RuntimeModulePage` / `RuntimeRecordRoute`.

## What the specialist agent MUST verify before changing this

- Re-read the spec you are editing end to end. Specs are 100-400 lines each and
  fields cross-reference views, forms and commands by `logicalName`; a rename
  in one place silently drops a column.
- Confirm whether the module has a bespoke adapter (`employees`) or uses
  `createStandardModuleDataAdapter`. Grep for `spec.moduleKey === "<key>"` in
  `standard-module-data.adapter.ts` before assuming generic behaviour.
- Confirm the API endpoint shape the adapter expects
  (`apiPath`/`createApiPath`/`updateApiPath`, `lookupApiPaths`,
  `timelineApiPath`) actually exists in the Nest module, and that the Next
  `app/api/**` proxy exists.
- If you touch `platform-module-registry.ts`, run
  `npm --workspace admin run check-types` **and** boot/import the module — the
  validation at `:3150-3183` throws at import time, not at type-check time.
- If you touch `schema.prisma` fields on any of the 17 mapped models, rerun
  `npm run generate:runtime-schema` and `npm run test:runtime-schema`, then
  re-check the six schema-coverage modules
  (`platform-module-registry.ts:3153-3160`) still have full form coverage.
- Run `npm --workspace web run test` (covers
  `modules/standard-module-views.spec.ts`, `command-catalog.spec.ts`,
  `visibility.resolver.spec.ts`) and `npm --workspace web run check-types`.
- Verify tenant isolation is still the API's job. Nothing in either runtime
  filters by tenant; a runtime change must never become the place a tenant
  decision is made.
