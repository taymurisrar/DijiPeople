# DijiPeople Module Runtime Overhaul

## Settings and Branding Architecture

The canonical Tenant Settings ownership model, information architecture, User
versus Employee boundary, work-configuration records, and Attendance schedule
resolution precedence are defined in
[`settings-and-branding.md`](./settings-and-branding.md). Generic runtime
settings pages must consume that contract and use shared form controls,
lookups, commands, DataTable, and Data Transfer behavior. Module runtime must
not introduce parallel Shift, Work Schedule, Work Calendar, Holiday, User, or
Employee concepts.

The authoritative settings taxonomy, settings-route audit, pre-auth load order,
global provider contract, CSS tokens, title/favicon rules, branding editor
behavior, and formatting rules are documented in
`docs/architecture/settings-and-branding.md`. Runtime modules must consume those
providers and shared formatters rather than fetching or hardcoding tenant
settings.

### Root Branding, Error Logs, And View Resilience

Branding has one root state owner: `TenantSettingsProvider`. Server rendering
loads public tenant branding, resolves it through `resolveTenantBranding`, and
uses that result for initial CSS variables, route title, and favicon metadata.
Authenticated resolved settings merge into the same provider; they do not
create a second branding provider or a competing title/favicon effect.

The fallback order is tenant `appTitle`, tenant brand/company/display name,
then `DijiPeople`. Route titles use `<Current Page> | <Tenant App Title>`.
`applyTenantBranding` is the only client DOM applier and owns root CSS
variables, font, density, theme, title, and the single managed favicon link.
Relative asset URLs are resolved against the current origin. Branding save,
reset, route navigation, and authenticated settings refresh all update this
same state.

Client branding head mutations are upsert-only and must not compete with the
Next.js head manager. The tenant favicon uses the stable
`link#tenant-favicon[data-dijipeople-branding="true"]` tag. The client may
create that tag when missing or update its `href` and `type`; it must never
remove, replace, or detach favicon, metadata, font, or title nodes owned by
Next.js or another subsystem. Title updates only assign `document.title`.
Branding effects compare applied title, favicon, font, and CSS variable values
before writing so route transitions and provider rerenders do not churn the
head.

Client errors receive a stable `client_` reference, browser route and user
agent context, JavaScript stack, cause data, and React component stack when the
caller provides it. `ErrorProvider` immediately posts that payload to
`POST /error-logs/client`; the backend sanitizes and upserts it under the same
reference. Downloads use `GET /error-logs/:reference/download` for both
`web_` and `client_` references. If persistence or lookup fails, the browser
generates the text file locally from the captured payload. Download access is
not role-gated. Client stacks are included; server stacks remain subject to
the configured server disclosure policy.

The shared View Selector constrains trigger and menu widths, scrolls long
lists, line-clamps descriptions, keeps counts in a fixed column, and keeps the
Manage Views row outside the scrolling area. Unknown optional view IDs fall
back to the default/first visible view, repair the URL, and remove matching
stale browser-storage entries instead of raising an application-level
`DATABASE_RECORD_NOT_FOUND` error.

## DijiPeople Product Terminology Standard

New runtime documentation and reusable component names must use DijiPeople terms: Module, Record, Field, Reference, Choice List, Form, View, Action Bar, Action, Action Group, Relationship, Related Module, Related List, Rule, Automation, Guided Process, Timeline, Change History, and Package. Legacy internal terms such as entity, subgrid, ribbon, business process flow, solution, and audit can remain temporarily where renaming would create risky churn, but they are deprecated for new product-facing work.

## Generic Module Runtime Page Contract

A reusable Module page receives a `moduleKey`, resolves published Module metadata, then renders only metadata-driven regions. Page code must not hardcode Module-specific Fields, Views, Forms, routes, permissions, Actions, or related data. Runtime pages use adapters and Action handlers; they never call Module APIs directly.

## Module List Page Contract

`ModuleListPage` is the generic list surface and contains only View Selector, Action Bar, and Data Table. View metadata drives columns, filters, sorting, search behavior, default View fallback, and list export shape. The public URL uses `?viewId=<GUID>` only; logical View keys are not exposed. Missing or unknown `viewId` falls back to the default View.

## Module Record Page Contract

`ModuleRecordPage` is the generic Record surface and contains Record title/Form Selector, Action Bar with Actions, Action Groups, Status Group, and Form Renderer. It supports `mode="create"`, `mode="read"`, and `mode="edit"` for `/<module-route>/new`, `/<module-route>/:recordId`, and `/<module-route>/:recordId/edit`. Back appears on Record pages only.

## Form/Page Layout Metadata Contract

Forms have at least one tab. Form, Tab, Section, Field, and component metadata support 1 to 4 column layouts. Desktop defaults to 2 columns; mobile collapses to 1 column. Section and component spans must not exceed parent columns. Timeline, Related List, notes, long text, and custom widgets can span full width. This metadata must remain compatible with future drag/drop Form Designer operations.

## View Metadata Contract

Views contain stable identity, display name, Module reference, columns, filters, sorting, page size, permission, default flag, system/custom flags, published state, and visibility scope. Views reference Fields by id where practical and by locked logical key for package portability, never by display name.

## Action Bar and Action Group Contract

The Action Bar renders Actions and Action Groups from command metadata. System Actions include New, Edit, Delete, Refresh, Assign, Share, Import, Export, Export Template, Back, Save, and Save & Close. Data Transfer groups Import, Export, and Export Template. Import can remain disabled until validation/import pipelines exist. Delete means soft delete only; hard delete/purge is not exposed on normal Module pages.

## Status Group Contract

The Status Group appears in the generic Record Header summary/popover and contains Owner, Status, and Sub Status. Owner is a mandatory Reference. Status is a mandatory Choice List. Sub Status is a mandatory dependent Choice List. They are read-only in read mode and editable only in edit mode. UI changes must not save immediately; they persist only through Save or Save & Close.

### DijiPeople Record Header Pattern

The generic Record page now separates Actions from Record identity and lifecycle summary:

- `ModuleCommandBar` owns Actions only and must not render lifecycle fields.
- `ModuleRecordHeader` owns the Record title, Form Selector, and compact lifecycle summary.
- `ModuleRecordStatusSummary` renders the compact Owner/Status/Sub Status trigger.
- `ModuleRecordStatusPopover` renders the floating lifecycle details panel anchored to the summary trigger.

The status popover is a floating panel, not an Action Bar expansion. It closes on outside click and Escape, and fields inside it use shared `form-control` components so locked and editable states match the rest of the runtime forms.

System lifecycle fields are distinct from module business fields:

- System Owner: the metadata `ownerField`, such as Employee `ownerUserId`.
- System Status: the metadata `statusField`, such as Employee `status`.
- System Sub Status: the metadata `subStatusField`, such as Employee `subStatus`.
- Employee `employmentStatus` is a business field and remains a normal Employee form field. Runtime Status Group logic must never map system Status to `employmentStatus`.

Owner, Status, and Sub Status are editable only when `mode === "edit"` and the current principal has an allowed normalized role: Global Administrator, System Administrator, HR, or HR Manager. Read mode and disallowed edit mode use locked shared form-control visuals. Create mode defaults Owner in draft state when the metadata owner field and current user are available, but the lifecycle popover remains governed by the same editability contract.

Owner assignment has two generic paths:

- Assign Action: `Action Bar -> ModuleRuntimeCommandHandler -> ModuleDataAdapter.assignOwner -> module backend -> database -> refresh`.
- Status Popover owner change: `Owner Picker -> draft record owner field -> Save/Save & Close -> ModuleDataAdapter.update -> module backend/assign-owner backend -> database -> refresh`.

Status and Sub Status changes update draft state only. Sub Status options are filtered by selected Status, invalid Sub Status values reset when Status changes, and persistence occurs only through Save or Save & Close.

Generated and locked fields are governed by shared renderer rules. A field is editable only when the form mode allows editing, the field is normal, field security allows write, the form field is not read-only, and the metadata field is not `autoGenerated` or `lockedByDefault` unless customization explicitly unlocks it. Employee Code is therefore locked in create, read, and edit through metadata only.

Development diagnostics may log header summary state, popover state, role normalization, command payloads, assign requests/responses, save payloads, and backend responses/errors. These diagnostics must be guarded by `process.env.NODE_ENV === "development"`.

## Related List and Inline Create/Edit/Delete Contract

Related Lists are rendered from Relationship and Related List metadata using the shared Data Table and Action Bar patterns. They support New related Record, Edit selected related Record, Delete selected related Record, Refresh, row open, selection, dynamic columns, and empty states. Inline create opens Quick Create and auto-binds the parent Reference.

## Quick Create Form Contract

Quick Create opens in a right-side viewport panel, does not navigate away, uses the same Form Renderer, uses Quick Create Form metadata, supports Save and Save & Close, and accepts parent Record binding when launched from a Related List. Form types are Main Form, Minimal Form, and Quick Create Form.

## Default Module Creation Metadata Package

Every new custom/system Module creates a default Package with mandatory Fields: id, tenantId, organizationId where applicable, ownerId Reference, name/primaryName, status Choice List, subStatus dependent Choice List, createdAt, createdById, updatedAt, updatedById, deletedAt, deletedById, isDeleted, and rowVersion/version. Optional Field: autoNumber. Default status choices are Active, Inactive, Draft, and Archived; default dependent sub-status choices are Open, In Progress, Completed, Inactive, Suspended, Draft, Pending Review, Archived, and Retired. Default Views are All, Active, Inactive, My, and Recently Created. Default Form is Main Form with General tab, Summary section, and Timeline section.

## Field Identity and Locking Rules

Every configurable object supports `id` as UUID/GUID internal identity, `key`/`schemaName`/`logicalName` as locked technical identity, and `displayName` as a renameable label. `schemaName` and `logicalName` are locked after creation. Forms, Views, Actions, tabs, sections, and Fields must not use `displayName` as identity.

## Route Rules

Public Module routes use clean plural slugs generated from locked plural Module logical names/entity set names. Examples: `/employees`, `/leave-requests`, and `/timesheets`. GUIDs are not used in public Module routes. Runtime resolves `routeSlug -> Module metadata -> Module id`. Route slugs are immutable after creation.

## Shared Component Reuse Rule

Runtime work must reuse or enhance shared components/helpers under `apps/web/app/components`, `apps/web/lib/runtime`, `apps/web/lib`, and existing shared UI/helper folders. New reusable UI belongs under shared runtime component locations, not Module folders. Employee-specific runtime files should contain only metadata/config, data adapters, value adapters where needed, command bridges, and thin route wrappers.

## Employee Cleanup/Transition Plan

Employee runtime remains behind `NEXT_PUBLIC_ENABLE_EMPLOYEE_RUNTIME`. Flag off keeps old Employee behavior. Flag on uses generic `ModuleListPage` and `ModuleRecordPage`. Do not delete old Employee files until runtime save, delete, assign, status, lookup editing, related data, import/export, validation, and field-level security parity is approved. Old Employee UI is replaceable after each old tab/body has a shared runtime slot or adapter.

## Future Form Designer Compatibility Rules

The Form Designer must edit the same metadata consumed by runtime pages. It must preserve stable ids, locked technical keys, display-name overrides, 1-4 column spans, no-wrap tab overflow, visibleWhen metadata, component types, form types, and parent binding for Quick Create. Designer changes affect draft metadata until publish.

Phase 1 creates the foundation for a reusable, metadata-driven, solution-aware, command-driven runtime. This phase is intentionally non-invasive: existing module pages keep their current behavior, and no module is migrated yet.

## Goals

- Make future module pages thin wrappers over reusable runtime pages.
- Resolve tenant, security, metadata, commands, solutions, UI composition, business logic, and data behavior through explicit contracts.
- Route all future user actions through the command runtime.
- Keep delete behavior soft by default, with hard delete restricted to purge and maintenance flows.
- Resolve tenant theme, branding, and fonts globally from the tenant slug.
- Prevent reusable runtime components from hardcoding entity logical names, field names, permissions, routes, forms, or views.

## Runtime Layers

### Tenant Runtime Layer

The tenant runtime resolves the active tenant from the tenant slug before any metadata, command, security, or data operation runs. It owns tenant identity, localization defaults, branding, font configuration, feature flags, and cache partition keys.

Responsibilities:

- Resolve tenant slug to a stable tenant id and runtime config.
- Load tenant branding and fonts globally before rendering reusable module pages.
- Provide locale, timezone, date format, currency, and text direction defaults.
- Provide tenant-scoped cache keys for metadata, commands, security rules, branding, and solution layers.
- Ensure no runtime component derives tenant context from route strings after the context has been resolved.

### Security & Access Layer

The security runtime evaluates role permissions, field-level security, data access scopes, and command visibility. It is the single authorization surface for reusable runtime pages and command handlers.

Responsibilities:

- Evaluate permissions before rendering list, detail, create, edit, and command surfaces.
- Support Global Admin, System Admin, System Customizer, manager, owner, team, business-unit, tenant, and self scopes.
- Apply field-level security to read, create, update, export, import, and command payloads.
- Keep command visibility separate from command execution authorization. Hidden buttons are not security.
- Validate soft delete, restore, and purge permissions independently.
- Keep audit visibility permissions separate from timeline/comment visibility.

### Metadata Runtime Layer

The metadata runtime describes entities, fields, forms, views, commands, relationships, validation rules, dependency edges, lifecycle state, and solution layering. Runtime pages consume metadata instead of hardcoded entity-specific UI logic.

Responsibilities:

- Load effective published metadata for the active tenant and solution layer stack.
- Keep draft metadata editable without affecting published runtime behavior.
- Version forms, views, commands, and field definitions.
- Validate dependencies before publish, import, export, delete, or uninstall.
- Provide metadata cache keys and invalidation hints.
- Never hardcode logical entity names, field names, routes, permissions, forms, or views in reusable components.

### Command Runtime Layer

The command runtime is the only future action entry point. Buttons, menu items, row actions, bulk actions, status transitions, exports, imports, and destructive operations all become command definitions with typed handlers.

Responsibilities:

- Resolve system commands and module commands for the current page, entity, selection, record, form, and permission context.
- Evaluate placement, visibility, enabled state, confirmation needs, and execution mode.
- Execute handlers through a single command pipeline with authorization, validation, audit, transaction, and cache invalidation hooks.
- Make delete a soft delete command by default.
- Restrict hard delete to explicit purge or maintenance commands.
- Support detail page right-side status groups for owner, status, and sub-status changes.

### Solution Layer

The solution runtime packages metadata and configuration into importable/exportable components. It supports managed and unmanaged layering so DijiPeople can ship base modules while tenants or partners customize safely.

Responsibilities:

- Represent solution manifests, dependencies, publishers, versions, and component lists.
- Support export readiness checks before packaging metadata.
- Support import validation before changing tenant runtime metadata.
- Merge managed and unmanaged layers into an effective runtime definition.
- Preserve managed component ownership and prevent unsupported edits.
- Validate dependency removal, uninstall impact, and layer conflicts.

### UI Component Layer

The UI runtime will provide reusable list, detail, create, edit, lookup, command bar, status group, timeline, and audit components. These components consume runtime contracts only.

Responsibilities:

- Render metadata-driven list, detail, create, and edit pages.
- Render command bars from command definitions.
- Render right-side detail status group controls for owner lookup, status optionset, and sub-status optionset.
- Render fields according to field metadata, form metadata, visibility rules, and field-level security.
- Never hardcode entity logical names, field names, permissions, routes, forms, or views.

### Business Logic Layer

Business logic remains behind command handlers, domain services, validators, workflows, and import/export processors. UI components do not call module-specific services directly.

Responsibilities:

- Implement command handlers and domain services.
- Validate state transitions, required fields, referential integrity, and business invariants.
- Use transactions for multi-step changes.
- Emit audit records and timeline events through separate channels.
- Return typed command outcomes that reusable pages can render.

### Data Layer

The data layer persists tenant data, metadata, solution layers, security configuration, audit events, timeline records, and cache invalidation markers.

Responsibilities:

- Enforce tenant boundaries and data access scopes.
- Implement soft delete by default with deleted metadata fields and restore support.
- Restrict hard delete to maintenance and purge operations with elevated permissions.
- Store draft and published metadata separately enough to guarantee published runtime stability.
- Preserve audit integrity even when timeline content is edited or hidden.

## Metadata-Driven Pages

Future list pages are generated from `ViewMetadata`. Columns, sorting, filters, row commands, bulk commands, empty states, and exports are resolved from metadata and security context. A list page wrapper should only identify the module or view key and pass the active runtime context.

Future detail pages are generated from `FormMetadata`, `EntityMetadata`, and command definitions. The command bar owns all primary actions. Detail pages must support a right-side status group containing:

- Owner lookup.
- Status optionset.
- Sub-status optionset.

Future create and edit pages are generated from form metadata and field metadata. Required fields, defaults, readonly state, lookup targets, field-level security, and validation messages come from metadata and business validation, not page-specific code.

## Solution Import/Export Readiness

Every metadata component should be exportable once it has stable identity, publisher ownership, dependency declarations, lifecycle state, version, and validation status. Export readiness requires:

- No unresolved dependencies.
- No draft-only components unless explicitly exporting an unmanaged draft package.
- No missing publisher or solution ownership.
- No invalid references to fields, forms, views, commands, relationships, roles, fonts, or branding keys.
- No environment-specific data embedded in reusable metadata.

Import readiness requires:

- Manifest schema compatibility.
- Publisher and solution identity validation.
- Dependency availability or included dependency components.
- Managed/unmanaged layering conflict detection.
- Permission to import solutions and apply customizations.
- Dry-run validation before applying changes.

## Managed and Unmanaged Solution Layering

Managed layers are owned by a publisher and are protected from direct tenant edits unless the component explicitly allows customization. Unmanaged layers contain tenant or implementation-specific customizations and sit above managed base layers.

Layering rules:

- Effective metadata is resolved from base managed layers plus unmanaged overrides.
- Managed components cannot be deleted by tenant customization. They can only be hidden, extended, or overridden when allowed.
- Unmanaged customizations must track the managed component they override.
- Import must detect collisions, missing base components, and version incompatibilities.
- Uninstall must validate dependencies and preserve tenant data unless a purge operation is explicitly requested.

## Draft and Published Metadata Lifecycle

Metadata has a lifecycle state:

- `draft`: editable and not used by normal runtime pages.
- `published`: active runtime definition.
- `deprecated`: still usable but scheduled for replacement.
- `retired`: unavailable for new runtime use, retained for historical compatibility.

Publish rules:

- Publish validates dependencies, permissions, field security, command handlers, views, forms, optionsets, and solution layer constraints.
- Published metadata receives a version and cache invalidation marker.
- Draft changes must not alter active runtime behavior until publish.
- Rollback should target previously published versions where possible.

## Form, View, and Command Versioning

Forms, views, and commands are versioned independently because UI shape and action behavior may change at different cadences.

Versioning expectations:

- Published versions are immutable from the runtime perspective.
- Draft versions can be edited and validated.
- Commands store handler keys, execution mode, placements, visibility rules, and dependency references.
- Runtime pages request the effective published version unless explicitly running a preview experience.

## Dependency Validation

Dependency validation runs before publish, import, export, delete, uninstall, and purge.

Required checks:

- Forms reference existing fields, sections, tabs, relationships, commands, and optionsets.
- Views reference existing fields, sort columns, filters, row commands, and bulk commands.
- Commands reference existing handlers, permissions, entity metadata, form/view placements, and fields used in visibility rules.
- Status group fields point to valid owner, status, and sub-status metadata.
- Branding and font references exist for the tenant or solution.
- Security rules reference valid roles, permissions, fields, and scopes.

## Command Bar-Only Action Model

All future actions must be represented as commands. Page-specific buttons should disappear as modules migrate.

Command surfaces:

- Global command bar.
- Module command bar.
- List command bar.
- Row action menu.
- Bulk action menu.
- Detail command bar.
- Detail status group.
- Form footer or save area, represented as commands.

System commands are reusable platform commands such as create, save, save and close, refresh, export, import, soft delete, restore, purge, assign owner, activate, deactivate, publish, and cancel. Module commands are module-specific actions such as approve, reject, submit, close, finalize, post, lock, unlock, or recalculate.

## Delete, Restore, and Purge

Delete means soft delete by default. Soft delete should preserve data, audit history, timeline visibility rules, and relationship integrity. Restore is a separate command with explicit permission.

Hard delete is purge. Purge is restricted to maintenance and elevated administrative scenarios. It must require explicit purge permissions, dependency validation, audit logging, and ideally an operational confirmation trail.

## Owner, Status, and Sub-Status

Owner is a lookup field that should resolve through metadata, security scopes, and lookup filters. Status and sub-status are optionsets that should resolve from metadata and support valid transition rules.

The detail page command bar status group must eventually render on the right side and support:

- Owner lookup command.
- Status optionset command.
- Sub-status optionset command.

These controls are commands, not direct field mutations.

## Tenant Branding and Fonts

Tenant branding and fonts resolve globally from the tenant slug through the tenant runtime. Reusable components consume branding tokens and font stacks from `TenantRuntimeConfig`; they must not read tenant branding by hardcoded route, entity, or page logic.

Branding/font permissions must cover:

- Viewing branding configuration.
- Updating branding configuration.
- Publishing branding changes.
- Exporting/importing branding metadata through solutions.

## Security Expectations

### Global Admin

Global Admin is the highest cross-tenant or platform-level administrative role. It is expected to manage platform setup, tenants, global settings, elevated maintenance operations, and emergency recovery. Global Admin can be allowed to purge only through explicit purge permissions and operational safeguards.

Expected permission families:

- Tenant and environment administration.
- System settings and security administration.
- Solution import/export and managed package operations.
- Branding and font administration.
- Soft delete, restore, and restricted purge.
- Field security administration.
- Audit access.

### System Admin

System Admin is the highest tenant-level administrative role. It is expected to manage tenant users, roles, configuration, module settings, and operational data within tenant boundaries. It should not implicitly receive platform-wide access.

Expected permission families:

- Tenant user and role administration.
- Tenant settings.
- Module data read/create/update/soft delete/restore.
- Solution import/export where allowed.
- Branding and font administration where allowed.
- Audit access within tenant scope.
- Field security administration within tenant scope.

### System Customizer

System Customizer configures metadata and customizations but should not automatically receive unrestricted business data access.

Expected permission families:

- Customization read/create/update/delete for draft metadata.
- Publish customization.
- Form, view, field, command, and optionset configuration.
- Solution export and unmanaged import where allowed.
- Dependency validation and preview.
- Limited read access needed to validate metadata.

### RBAC Verification TODO

Later phases must verify code and seed data for:

- Missing permissions.
- Inconsistent permission names such as `update`, `write`, and `manage`.
- Customization permissions.
- Solution permissions.
- Branding and font permissions.
- Soft delete, restore, and purge permissions.
- Field security permissions.
- Command execution permissions versus command visibility rules.
- Data access scope permissions.
- Audit access permissions versus timeline access permissions.

## Field-Level Security

Field-level security controls read, create, update, export, import, and command payload access per field. Runtime forms and views must hide, mask, disable, or omit fields based on explicit security rules.

Rules:

- Field visibility is not enough to protect data. APIs and command handlers must enforce field security.
- Export/import must apply field security unless an elevated administrative export mode is explicitly used.
- Audit logs should preserve secured field changes with appropriate masking for users without access.

## Data Access Scopes

Permission scopes define which records a principal can access:

- `global`: platform-wide where applicable.
- `tenant`: all records in the tenant.
- `business-unit`: records in an organizational unit.
- `team`: records owned by or shared with a team.
- `owned`: records owned by the user.
- `self`: records representing the user.
- `none`: no access.

Scopes apply to reads, writes, commands, exports, imports, soft delete, restore, purge, audit, and timeline operations.

## Audit vs Timeline

Audit and timeline are separate concepts.

Audit is immutable or append-only security and compliance history. It records who changed what, when, from where, and through which command or system process.

Timeline is user-facing activity history such as notes, comments, emails, workflow events, status updates, and attachments. Timeline entries may be hidden, edited, or filtered according to product rules, but they must not replace audit.

## Caching and Invalidation

Runtime caches are tenant-scoped and solution-layer aware.

Cache rules:

- Published metadata is cacheable by tenant, solution layer version, entity, form, view, command, and locale where relevant.
- Draft metadata should use separate preview cache keys.
- Tenant branding and fonts are cacheable by tenant slug and branding version.
- Security decisions may be cached only with role, permission, field security, user, and tenant version keys.
- Publishing metadata invalidates affected entity, form, view, command, lookup, and dependency caches.
- Importing a solution invalidates all affected solution layer and metadata caches.
- Role or field security changes invalidate authorization caches.
- Branding/font publish invalidates tenant branding caches and any server-rendered shell that consumes them.

## Phase 1 Deliverables

Phase 1 adds only documentation, runtime type contracts, and placeholder registries. It does not migrate modules, change UI behavior, or replace existing pages.

Future phases will plug reusable runtime pages, command handlers, metadata loaders, solution import/export processors, and authorization adapters into the contracts introduced here.

## Phase 2 Implementation

Phase 2 adds the first pure runtime resolver utilities on top of the Phase 1 contracts. These utilities are intentionally dependency-light and do not call APIs or the database. Existing module pages remain unchanged.

Added resolver files:

- `tenant-runtime.resolver.ts`: resolves `TenantRuntimeConfig` from tenant slug, tenant settings, and branding input. It normalizes tenant id, slug, locale, timezone, date format, time format, branding, body font, heading font, colors, logo, favicon, density, border radius, text direction, feature flags, and tenant cache partition key.
- `metadata-runtime.resolver.ts`: resolves entities, published forms, default forms, published views, default views, fields, and validation reports for missing form fields or view columns.
- `command-runtime.resolver.ts`: resolves system commands, module commands, merged command lists, surface filtering for list/detail/create/edit/subgrid, permission filtering, visibility filtering, command grouping, and detail status group configuration.
- `security-runtime.resolver.ts`: checks permission possession, any/all permission sets, permission requirements, data access scope, field read/write/mask access, and safe field visibility/editability metadata.
- `module-runtime.resolver.ts`: composes tenant, security, module config, entity metadata, published forms, published views, commands, solutions, page kind, record id, and cache keys into a `ModuleRuntimeContext`.
- `rbac-verification.ts`: generates report-only RBAC verification output for permission catalog, role definitions, and expected role matrices.

### Intended Use

Future module wrappers should resolve tenant runtime first, then security runtime, then metadata and command runtime. A migrated page should only identify the module key, requested form/view key, page kind, and record context; reusable runtime pages will consume the resulting `ModuleRuntimeContext`.

Expected Phase 3 flow:

1. Resolve tenant config from slug and tenant settings.
2. Resolve authenticated principal, permission keys, field security rules, and data access rules.
3. Resolve module context from registered module, entity, form, view, command, and solution metadata.
4. Resolve commands for the current surface and group them into primary, secondary, overflow, destructive, and status group buckets.
5. Render reusable runtime list/detail/create/edit pages from metadata and command groups.

### Command Runtime Notes

Owner, status, and sub-status are resolved as status group configuration and remain command-driven internally. Even if later rendered as dropdowns or lookups, changes must route through command handlers rather than direct page mutations.

Delete remains a soft delete command by default. Purge/hard delete must remain an explicit destructive command with elevated permissions and maintenance safeguards.

### RBAC Verification Report Behavior

The RBAC verifier accepts:

- A canonical list of permission keys.
- Role definitions with assigned permission keys.
- An expected role permission matrix.

It returns:

- Missing permissions expected by the matrix but absent from the catalog.
- Unknown permissions assigned to roles but absent from the catalog.
- Duplicate permission keys in the catalog.
- Naming consistency warnings for `update` versus `write`, `read` versus `view`, `manage` versus `admin`, `delete` versus `remove`, and `purge` versus `hardDelete`.
- Per-role coverage for expected, actual, missing, and extra permissions.

The verifier is report-only in Phase 2. It does not mutate seed files, roles, permissions, or tenant configuration.

### Phase 3 Remaining Work

Phase 3 should add runtime page prototypes and adapter boundaries without migrating production modules prematurely. Remaining work includes:

- Tenant-aware metadata loading from durable storage.
- Solution-aware metadata layering and import/export validation.
- Runtime command handler registration and execution pipeline.
- Reusable list/detail/create/edit page components.
- Detail command bar status group UI.
- Field security enforcement in APIs and command handlers.
- Cache invalidation hooks for metadata publish, solution import, security changes, and branding publish.
- Report-driven RBAC cleanup for seed data and permission naming.

## Phase 3 Implementation

Phase 3 adds reusable runtime UI components under `apps/web/app/components/runtime`. These components are intentionally inert until future module migration work wires them into routes. They do not fetch data, call APIs, execute commands, or replace existing Employees, Leaves, Attendance, Timesheet, Projects, or Customers pages.

Added runtime UI components:

- `ModuleRuntimeProvider`: client-safe context provider and hook for a resolved `ModuleRuntimeContext`, active form, active view, record data, security context, tenant config, metadata, and command definitions.
- `ModulePageLayout`: generic page frame for runtime list/detail/create/edit surfaces with title, subtitle, breadcrumbs, command bar slot, header slot, loading state, error state, and access denied state.
- `ModuleCommandBar`: metadata-driven command renderer for primary, secondary, overflow, destructive, and status group command buckets.
- `ModuleCommandBarStatusGroup`: right-aligned detail command bar group for owner, status, and sub-status controls.
- `ModuleViewSelector`: view selector that accepts `ViewMetadata[]`, active view key, and an `onViewChange` callback.
- `ModuleFormSelector`: form selector that accepts `FormMetadata[]`, active form key, and an `onFormChange` callback.
- `ModuleRecordHeader`: metadata-driven record heading that uses entity display metadata and record data.
- `ModuleListShell`: reusable list shell composed from page layout, command bar, view selector, and a table slot.
- `ModuleDetailShell`: reusable detail shell composed from page layout, record header, command bar with optional status group, form selector, form slot, and optional tabs/subgrid slot.
- `ModuleEmptyState` and `ModuleAccessDeniedState`: reusable runtime states.
- `buildTenantRuntimeCssVariables`: preparation utility for mapping tenant runtime branding into CSS variables for body font, heading font, primary color, secondary color, border radius, and density.

### Provider Usage

The provider accepts an already resolved runtime context. It does not resolve tenant, metadata, commands, permissions, or records by itself. Future migrated pages should resolve runtime state outside the provider, then pass it into the runtime component tree.

The provider exposes:

- Entity logical name.
- Module key.
- Record id.
- Tenant runtime config.
- Metadata bundle.
- Security context.
- Active form and active view.
- Optional record data.
- Command definitions.

### Command Bar Behavior

The command bar is a dumb UI surface. It accepts command definitions or pre-grouped command buckets and emits `onCommand(commandKey, context)` events only. It does not call APIs, import domain services, mutate records, or hardcode module behavior.

Supported command buckets:

- `primary`.
- `secondary`.
- `overflow`.
- `destructive`.
- `statusGroup`.

System commands such as new, edit, save, save and close, approve, reject, share, assign, export, import, delete, remove, refresh, activate, deactivate, restore, and back can render when supplied by the command resolver. Module-specific command keys such as `attendance.checkIn`, `attendance.checkOut`, `leave.cancel`, or `project.close` can also render because the UI treats command keys as metadata.

### Status Group Behavior

The status group renders only when enabled by status group config. It hides unconfigured fields, shows missing metadata placeholders, respects disabled/loading state, and emits command-like events:

- `record.assignOwner`.
- `record.changeStatus`.
- `record.changeSubStatus`.

Owner, status, and sub-status changes remain command-driven events. Later phases may render richer lookup or optionset controls, but the UI must continue to route changes through command execution rather than direct page mutation.

### Why No Module Migration Yet

No production module is migrated in Phase 3 because the runtime still lacks durable metadata loading, command execution, API-level field security enforcement, solution layering, and cache invalidation. Introducing reusable shells first keeps the UI contract visible without changing live behavior.

### Phase 4 Next Steps

Phase 4 should add adapter boundaries and a non-production prototype route or internal sandbox before any real module migration. Recommended next work:

- Build command execution adapter with authorization, validation, audit, transaction, and invalidation hooks.
- Add metadata loader adapters that can source effective published metadata from registry, API, or database.
- Add runtime form and list renderers that consume field-level security output.
- Add richer owner lookup and status optionset controls to the status group.
- Add prototype-only route or story-like harness for one fake module.
- Keep real module migration gated until runtime behavior, RBAC verification, and command execution are validated.

## Phase 4 Implementation

Phase 4 adds command execution infrastructure, opt-in tenant runtime style wiring, and a non-routed Employee runtime example. It still does not migrate Employees, Leaves, Attendance, Timesheet, Projects, Customers, or any other live module page.

### Command Execution Infrastructure

New command execution files live under `apps/web/lib/runtime`:

- `command-execution.types.ts`: command execution requests, results, navigation adapter, API adapter, API command config, navigation command config, and execution options.
- `command-execution.resolver.ts`: command lookup, execution availability validation, endpoint template expansion, navigation href resolution, API request resolution, and standard soft-delete command definitions.
- `command-execution.service.ts`: command execution orchestration with permission/visibility revalidation, injected handler execution, navigation adapter support, API adapter support, noop handling, and failure results for unregistered handlers.

The execution service accepts:

- `commandKey`.
- `ModuleRuntimeContext`.
- Optional payload.
- Optional record data.
- Optional selected record ids.
- Optional injected handlers, navigation adapter, and API adapter.

The execution service revalidates command permission and visibility before executing anything. UI components remain event-only and do not call this service directly unless a future adapter explicitly wires them together.

Supported execution outcomes:

- `success`.
- `failure`.
- `cancelled`.
- `navigation`.
- `refreshRequired`.

Supported execution modes:

- `client`.
- `server`.
- `navigation`.
- `api`.
- `noop`.

Server and client business behavior should still be injected as handlers. Runtime files must not import module services or hardcode module-specific business logic.

### Handler Registry

The command registry now supports handler registration by both handler key and command key. This allows system commands and module-specific commands to be injected without coupling reusable UI components to business modules.

Examples of command keys that can be registered later:

- `system.new`.
- `system.edit`.
- `system.delete`.
- `system.assign`.
- `system.changeStatus`.
- `record.assignOwner`.
- `record.changeStatus`.
- `record.changeSubStatus`.
- `attendance.checkIn`.

### Navigation Command Model

Navigation commands are framework-safe. The runtime does not import Next.js router APIs. Instead, it accepts an injected navigation adapter with optional `back`, `navigate`, and `refresh` functions.

Reusable navigation behavior supports:

- Back.
- New.
- Edit.
- Open record.
- Refresh.

Default template examples include `/{moduleKey}/new`, `/{moduleKey}/{recordId}/edit`, and `/{moduleKey}/{recordId}`. Future route adapters can override these templates without changing runtime UI components.

### API Command Model

API-style commands are configured through an injected API adapter and per-command API config. Endpoint templates support:

- `{entityLogicalName}`.
- `{recordId}`.
- `{moduleKey}`.
- `{tenantId}`.

API command config supports method, endpoint template, payload, confirmation requirement, success message, and error message. Phase 4 does not wire destructive APIs to production endpoints.

### Soft Delete Command Model

Standard command definitions now document:

- `system.delete`: soft delete only.
- `system.restore`: restore a soft-deleted record.
- `system.purge`: hard delete.

Delete remains soft delete by default. Purge is hard delete and is restricted to future maintenance or deleted-records areas. Purge should not be registered on normal module detail pages.

### Tenant Branding Provider

`TenantRuntimeStyleProvider` was added under `apps/web/app/components/runtime`. It accepts `TenantRuntimeConfig`, injects runtime CSS variables, and renders children. It does not fetch tenant settings and is not globally wired yet.

Supported variables:

- Body font.
- Heading font.
- Primary color.
- Secondary color.
- Border radius.
- Density.

Future wiring example:

1. Authenticated layout resolves tenant slug.
2. Layout loads tenant settings through an approved tenant settings adapter.
3. Layout calls `resolveTenantRuntimeConfig`.
4. Layout wraps runtime-aware surfaces with `TenantRuntimeStyleProvider`.

This is intentionally deferred to avoid changing current app behavior.

### Employee Prototype and Migration Plan

A non-routed example component was added at `apps/web/app/components/runtime/examples/employee-runtime-example.tsx`. It demonstrates:

- Employee-like module config.
- Employee-like entity metadata sample.
- Sample forms and views.
- Sample commands.
- Detail command bar status group.
- Form selector.
- View selector.
- List and detail shell composition.

The example uses sample metadata only. It does not fetch real data, import unstable module code, register routes, or affect production UI.

Employee migration should wait until:

- Command execution adapters are validated.
- Runtime metadata loading is backed by durable published metadata.
- Field security is enforced outside the UI.
- Runtime list/form renderers are complete.
- RBAC verification gaps are addressed.
- A prototype route or internal sandbox proves the shell behavior safely.

### RBAC Verification Example

`rbac-verification.ts` now includes a report-only runtime admin example matrix and helper for Global Admin, System Admin, and System Customizer coverage. It checks expected customization, solution, branding/font, delete/restore/purge, and field-security permission families without modifying seed files.

### Phase 5 Readiness Criteria

Phase 5 should not migrate a real module until these are true:

- Command handlers can run through a server-ready authorization and validation pipeline.
- API and navigation adapters are wired in a controlled non-production surface.
- Metadata can be loaded by tenant, entity, solution layer, lifecycle state, and version.
- Tenant branding provider can be enabled behind a safe integration point.
- RBAC report output has been reviewed against seed data.
- Soft delete and purge permissions are explicit and separately validated.
- The Employee example has been converted into a safe prototype route or story-like harness, not a production replacement.

## Phase 5 Implementation

Phase 5 introduces a reversible Employees runtime bridge behind `NEXT_PUBLIC_ENABLE_EMPLOYEE_RUNTIME`. The default remains `false`, so current Employees behavior is unchanged unless the flag is explicitly enabled.

### Feature Flag

The Employees runtime bridge is controlled by:

- `NEXT_PUBLIC_ENABLE_EMPLOYEE_RUNTIME=true`

Flag behavior:

- `false` or unset: existing Employees list and detail pages render through their current implementation.
- `true`: Employees list and detail pages render through runtime shell wrappers that slot existing safe content where possible.

The flag is read through `runtimeFeatureFlags.enableEmployeeRuntime`. It defaults to off.

### Employee Runtime Config

Employee runtime module configuration lives under `apps/web/lib/runtime/modules`:

- `employee.module.ts`: module key, entity logical name, route base, permissions, standard commands, and detail status group config.
- `employee-metadata.adapter.ts`: bridge from existing customization forms/views into runtime contracts with fallback metadata.

Configured runtime identifiers:

- Module key: `employees`.
- Entity logical name: `employee`.
- Route base: `/employees`.
- Default form: `employee.main`.
- Default view: `employee.all`.

The config remains metadata-friendly and avoids hardcoding runtime UI behavior. Commands are declared as metadata and are filtered by the runtime resolvers.

### Employee Metadata Adapter

The adapter maps existing customization concepts into Phase 1 contracts:

- Entity metadata.
- Field metadata.
- Form metadata with stable logical names and source ids.
- View metadata with stable logical names and source ids.
- Owner field: `ownerUserId`.
- Status field: `employmentStatus`.
- Sub-status: omitted until the Employee domain has a stable field for it.

When customization forms/views are unavailable, fallback metadata is used so the runtime bridge can still render safely behind the flag.

### List Wrapper Status

`EmployeeRuntimeListWrapper` composes:

- `ModuleListPage`.
- `ModuleDataTable`.
- Employee row/value adaptation.
- Employee lookup display adaptation.

The flag-on list path no longer uses the Employee-specific table component. The flag-off path still uses the legacy table until parity is approved.

### Detail Wrapper Status

`EmployeeRuntimeDetailWrapper` composes:

- `ModuleRecordPage`.
- Existing slotted children only when used as a temporary compatibility shim.

The current full Employee profile detail UI is not removed. The runtime detail wrapper is enabled only by flag and uses a safe metadata bridge rather than rewriting the entire profile surface.

### Command Handling Limitations

Employee runtime command events are handled by shared `ModuleRuntimeCommandHandler` in the flag-on path. The old Employee command handler file remains present but is no longer imported by the generic runtime wrappers.

Safe supported commands:

- Back.
- New.
- Edit.
- Refresh.

Prepared but non-destructive/noop commands:

- `system.delete`: soft-delete intent only; no real delete API is called.
- `record.assignOwner`: prepared owner assignment only.
- `record.changeStatus`: prepared status change only.

No hard delete or purge command is registered on Employee module pages. Purge remains future maintenance-only.

### Tenant Runtime Style Provider

The Employee runtime bridge can locally pass resolved tenant runtime config into `TenantRuntimeStyleProvider` when the flag is enabled. Branding is still not globally wired, so flag-off behavior and the authenticated app shell remain unchanged.

### Phase 6 Remaining Work

Phase 6 focused on a deeper Employees migration only after the bridge was validated:

- Replace the table slot with a runtime metadata-driven table. Completed for the flag-on path with `ModuleDataTable`.
- Replace the metadata form bridge with a runtime form renderer that enforces field security.
- Add server-backed command handlers for safe create/edit/navigation flows.
- Confirm soft-delete backend semantics before enabling delete.
- Add owner/status mutation handlers only after backend APIs and audit behavior are confirmed.
- Add stable tenant slug resolution instead of the Phase 5 local `current` bridge value.
- Verify Employee permissions through the RBAC report before widening the feature flag.

## Phase 6 Implementation

Phase 6 hardens the Employees runtime bridge while keeping it behind `NEXT_PUBLIC_ENABLE_EMPLOYEE_RUNTIME`. The runtime remains opt-in and reversible; the existing Employees list, detail, edit, and new implementations remain the default when the flag is unset or `false`.

### Flag-Off Validation

The Employees pages keep the current render path when the flag is off. Runtime wrappers are dynamically imported only inside the flag-on branch, so the wrapper components are not loaded for default Employees traffic. Existing route URLs, list table behavior, detail/new/edit page behavior, and visual structure remain unchanged by default.

### Runtime List Hardening

The flagged Employees list path now uses:

- `ModuleListPage`.
- `ModuleDataTable`.
- Metadata-driven `ModuleViewSelector`.
- Runtime Action Bar and command grouping/filtering.

The table is generated from selected View metadata and shared Field metadata. The runtime view selector writes `?viewId=<GUID>` and removes legacy `view` keys. Unknown view ids fall back to the default runtime View.

### Runtime Form Hardening

The flagged Employees detail, edit, and new paths now use the same reusable runtime form wrapper:

- `TenantRuntimeStyleProvider`.
- `ModuleRuntimeProvider`.
- `ModuleDetailShell`.
- `ModuleRecordHeader`.
- `ModuleCommandBar`.
- `ModuleCommandBarStatusGroup`.
- `ModuleFormSelector`.
- `RuntimeMetadataFormRenderer`.

The same Employee `FormMetadata` contract drives detail, edit, and new modes. Detail mode renders the fields read-only. Edit and new modes render editable metadata fields, but persistence is still blocked behind no-op command handlers until backend save semantics, validation, and field-level security are confirmed.

Owner and status controls are metadata-driven from Employee entity metadata. Sub-status remains hidden because Employee metadata does not declare a stable sub-status field yet. The status group is rendered disabled in Phase 6 because owner/status mutation endpoints and audit behavior have not been confirmed.

### Employee System Forms

The Employee runtime now always contributes two system forms:

- `employee.main.full`: the full Employee profile form.
- `employee.main.minimal`: the essential Employee profile form.

The full system form covers the current Employee create/edit/detail field surface:

- Basic Information: employee code, first name, middle name, last name, preferred name, full name.
- Employment Information: employment status, employee type, work mode, contract type, hire date, confirmation date, probation end date, termination date, notice period days, tax identifier.
- Organization / Reporting: department, designation, employee level, work location, official joining location, reporting manager, owner.
- Contact Information: work email, personal email, phone, alternate phone.
- Address Information: address lines, country, state/province, city, postal code.
- Personal Information: date of birth, gender, marital status, nationality country, nationality, blood group.
- Documents / Identification: CNIC / national ID.
- Emergency Contact: emergency contact name, relation type, relation text, phone, alternate phone.
- System Information: linked user, provision access flag, invitation flag, initial roles metadata.

The minimal system form includes employee code, full name, work email, employment status, reporting manager, and hire date. Form selection uses stable keys in `?form=employee.main.full` or `?form=employee.main.minimal`; unknown form keys fall back to `employee.main.full`.

### Safe Commands Only

Active Employee runtime commands are mode-specific:

Detail mode:

- `system.back`.
- `system.new`.
- `system.edit`.
- `system.refresh`.
- `system.delete` as a no-op prepared soft-delete command only.

Edit mode:

- `system.back`.
- `system.save`.
- `system.saveAndClose`.
- `system.refresh`.

New mode:

- `system.back`.
- `system.save`.
- `system.saveAndClose`.

Prepared but inactive commands are documented separately:

- `record.assignOwner`.
- `record.changeStatus`.
- `record.changeSubStatus` when a future sub-status field exists.

Save commands are present only in the runtime command bar and currently run as no-ops. Delete remains soft-delete intent only and does not call an API. No purge or hard delete command is exposed.

### Runtime Diagnostics

Employee runtime diagnostics were added as development-only warnings and as a reusable helper. The diagnostics check:

- Missing entity metadata.
- Missing default form.
- Missing default view.
- Form fields not found on entity metadata.
- View columns not found on entity metadata.
- Missing owner/status/sub-status fields referenced by the status group.
- Commands missing permission declarations.

Diagnostics do not block production rendering and do not mutate runtime behavior.

### Metadata Adapter Hardening

The Employee metadata adapter now explicitly maps stable field logical names, display labels, field types, optionsets, lookup targets, owner field, status field, default form, default view, form id/key, and view id/key. Display names are never used as keys.

The adapter ensures the full and minimal Employee system forms exist even when customization metadata is incomplete, while preserving UUID/source ids when published customization forms or views are available. It also exposes clean data mapping helpers for record-to-form values, empty new-record defaults, and form-values-to-update payload preparation.

### Readiness Before Default

Before making Employees runtime the default, the following must be true:

- Runtime list table replaces the existing table slot without losing filtering, sorting, pagination, row links, or selection behavior.
- Runtime detail form renderer supports the full Employee profile experience including validated lookup option sources and submit-time validation.
- Field-level security is enforced by APIs and command handlers, not only UI visibility.
- Save and save-and-close backend command handlers are confirmed for create and update.
- Soft-delete backend support is confirmed before enabling delete.
- Owner/status backend endpoints, audit logging, and validation are confirmed before enabling mutations.
- Diagnostics are clean for published Employee forms/views in a seeded tenant.
- RBAC report confirms Employee runtime permissions are present and consistently named.

## Employee Runtime Local Validation Fixes

Local flag-on validation found three bridge issues:

- `system.back` used browser history and could send the user to an unsafe previous route.
- Employee detail could fall through to an empty placeholder when no customization form was published, even though fallback runtime form metadata existed.
- Owner/status controls could show missing metadata copy to end users when mutation endpoints were intentionally disabled.

Fixes applied:

- Employee runtime Back now routes explicitly to `/employees` from detail pages.
- The Employees list runtime wrapper excludes `system.back`; no Back command is shown on the list bridge.
- Runtime navigation is constrained to `/employees` paths for Employee commands and never calls sign-out, logout, auth, tenant switching, or router history for Back.
- Employee runtime form/view keys now use stable `employees.*` logical names, including `employees.main` and `employees.all`.
- Unknown `?view=` and `?form=` keys fall back to runtime defaults.
- The Employee metadata adapter includes a broader explicit field map for current Employee detail fields, optionsets, lookup targets, owner field, status field, fallback default form, and fallback default view.
- Employee detail now renders `RuntimeMetadataFormRenderer` when a published customization form is available, otherwise it renders a runtime `FormMetadata` preview from the fallback bridge.
- Owner/status controls remain disabled until backend endpoints are confirmed, but no longer show broken “metadata missing” text to end users.

Remaining known limitations:

- Runtime Employee detail is still a bridge, not the full profile replacement.
- Owner and status mutations are still disabled/noop until backend endpoints, validation, and audit behavior are confirmed.
- Delete remains inactive because soft-delete backend support has not been confirmed.
- The flag-on list now uses shared `ModuleDataTable`; server-side metadata query execution remains future work.
- Tenant slug resolution still uses the local bridge value until authenticated layout-level tenant runtime wiring is completed.

## Employee Runtime Phase 6 Correction

The local flag-on bridge was tightened again so the runtime path is no longer a minimal demo form. The Employee runtime now uses one metadata form engine across detail, edit, and new routes:

- `/employees/[id]` renders runtime detail mode.
- `/employees/[id]/edit` renders runtime edit mode.
- `/employees/new` renders runtime create mode.

The same `FormMetadata` drives all three modes. Detail mode is read-only. Edit and new modes unlock editable metadata fields, but save and save-and-close are no-op command-bar commands until backend command handlers, validation, audit behavior, and field-level security are confirmed.

The Employee runtime always contributes two system forms:

- `employee.main.full`: the full Employee form, covering current create/edit/detail fields across Basic Information, Employment Information, Organization / Reporting, Contact Information, Address Information, Personal Information, Documents / Identification, Emergency Contact, and System Information.
- `employee.main.minimal`: the essential Employee form with employee code, full name, work email, employment status, reporting manager, and hire date.

Form selection uses stable keys such as `?form=employee.main.full` and `?form=employee.main.minimal`. View selection uses stable runtime view logical names such as `?view=employees.all`. Unknown form/view keys fall back to runtime defaults.

The metadata adapter now exposes record-to-form values, empty new-record defaults, and form-values-to-update-payload helpers. Lookup fields render safely, but full metadata-driven lookup pickers and persistence remain future work.

Remaining backend blockers:

- Create/update save handlers.
- Save-and-close redirect semantics after successful persistence.
- Soft-delete endpoint confirmation before activating delete beyond no-op.
- Owner/status/sub-status mutation endpoints, validation, and audit logging.
- Field-level security enforcement in command handlers and APIs.

## Shared Component Reuse Rule

All runtime modules must use shared UI components from `apps/web/app/components` before adding module-specific UI. This is mandatory for command bars, data tables, lookup controls, option sets/selects, tabs, form fields, badges/status indicators, dialogs/modals, import/export controls, and bulk action controls.

Module-specific files should contain configuration, metadata adapters, command handlers, route-safe navigation, and thin wrappers only. If a reusable component is missing, create or enhance a shared component under `apps/web/app/components` rather than adding a one-off component under a module folder.

Runtime metadata must preserve old UX parity before old code is deleted. Forms, views, commands, tabs, lookups, option sets, and status groups must match the previous module behavior unless a backend blocker is documented. No reusable runtime component may hardcode entity names, field names, permissions, routes, forms, or views.

## Employee Runtime Finalization Checklist

Completed behind `NEXT_PUBLIC_ENABLE_EMPLOYEE_RUNTIME`:

- Runtime list command metadata includes New, Refresh, Import, Export, Export Template, bulk Delete, and bulk Assign.
- Runtime detail command metadata includes Back, New, Edit, Refresh, Delete, Share, and the status-group commands.
- Runtime edit/new command metadata includes command-bar-only Save and Save & Close.
- Employee system views include `employees.all`, `employees.active`, `employees.probation`, `employees.notice`, and `employees.terminated`, plus published customization views when available.
- Status group uses record-level `Owner`, `Status`, and `Sub Status` metadata. The status label is `Status`; employment status remains an Employee form field.
- Lookup rendering uses shared lookup/form controls and display values where available instead of showing raw GUIDs.
- Detail, edit, and new use the same `RuntimeMetadataFormRenderer` and Employee `FormMetadata`; only mode changes.
- Full and minimal Employee system forms are available through stable keys.

Known blockers before deleting old Employee UI:

- Runtime tab body content still needs to be moved into shared runtime slots. The runtime detail path shows the previous tab chrome and keeps legacy tab content available in the flag-off path until each tab body is migrated.
- Save and Save & Close remain no-op until create/update command handlers are wired to validated backend endpoints.
- Delete and bulk delete remain no-op until soft-delete backend behavior, audit logging, and restore semantics are confirmed.
- Owner/status/sub-status mutation controls remain disabled until backend command handlers are confirmed.
- Metadata-driven lookup editing still needs complete lookup option providers for every lookup field in every tenant state.

Old Employee files still used:

- `apps/web/app/(authenticated)/employees/_components/employees-table.tsx` remains slotted into the runtime list shell.
- Employee profile subcomponents for documents, education, history, previous employment, compensation, reporting, access, and agent tabs remain used by the legacy detail route and are pending shared runtime slot migration.
- `apps/web/app/(authenticated)/employees/_components/employee-form.tsx` remains the flag-off create/edit form until runtime save parity is approved.

Old Employee files replaceable after parity approval:

- Employee-specific command bar behavior can be retired after runtime command handlers cover import/export/delete/assign/share/save.
- Legacy Employee form shell can be retired after runtime create/update persistence, validation, and lookup editing are complete.
- Legacy detail page tab rendering can be retired after each tab body has a shared runtime slot.

## Runtime Command And Related Metadata Finalization

### System Command Button Matrix

Default runtime command availability:

| Mode   | Commands                                                            |
| ------ | ------------------------------------------------------------------- |
| List   | New, Refresh, Delete/Bulk Delete, Assign/Bulk Assign, Data Transfer |
| Detail | Back, New, Edit, Delete, Refresh, Assign, Share, Data Transfer      |
| Edit   | Back, Save, Save & Close, Refresh                                   |
| New    | Back, Save, Save & Close                                            |

Every command is resolved through metadata and command runtime. UI components emit command keys only; they do not call module APIs directly. Delete and bulk delete remain soft-delete intent only. Hard delete and purge are not exposed on normal module pages.

### Command Button Group Model

Runtime commands support optional `groupKey` and `groupLabel` metadata. Shared command bars render commands with the same `groupKey` as a dropdown/button group. This keeps actions like import/export grouped consistently across modules without per-module button code.

### Data Transfer Group Behavior

The default Data Transfer group contains:

- Import.
- Export.
- Export Template.

List export is expected to export records from the active filtered view and visible columns. Detail export is expected to export the current record. When a backend handler is not confirmed, commands stay prepared/no-op or disabled with TODO notes rather than broken buttons.

### Refresh Loader And Dimming

Runtime refresh goes through `system.refresh`. The shared runtime shell can show `ModuleRefreshOverlay`, which lightly dims the page and displays a loading state while the current route refreshes. Refresh must not use browser history, logout routes, tenant switching, or auth redirects.

### Assign And Share Rules

Assign routes through `record.assignOwner` and must use reusable lookup UI. It is available only when the principal has the required permission and role policy, such as Global Admin, System Admin, or HR. If the backend mutation is not confirmed, the command remains prepared/no-op.

Share routes through `record.share` and is reusable for all modules. Share links must not bypass RBAC; the target route still enforces normal read permissions.

### Vertical Status Group Behavior

`ModuleCommandBarStatusGroup` renders a vertical right-aligned group in the detail command bar:

- Owner lookup.
- Status optionset.
- Sub Status optionset.

The labels are record-level labels: `Owner`, `Status`, and `Sub Status`. Employee `Employment Status` remains a normal form field and is not used as the record command-bar status. UI changes do not execute owner/status commands immediately; they are staged in the form state and persist only through Save or Save & Close once backend handlers are connected.

### D365-Style Filtered View Model

Runtime `ViewMetadata` supports:

- Stable view key/id.
- Display name.
- Entity logical name.
- Columns.
- Filters.
- Sorting.
- Visibility/permission.
- Default view flag.
- System/custom flags.
- Published state.

Employee runtime system views currently include all, active, probation, notice, and terminated views. Runtime list rendering applies view columns, sorting, and temporary client-side filters when server-side view filtering is not yet available. Future phases should move this filtering into the entity query API while preserving the same metadata contract.

### Related Table Metadata Model

Runtime metadata now includes reusable relationship/tab contracts:

- `RelationshipMetadata`.
- `RelatedTabMetadata`.
- `RelatedSubgridMetadata`.
- `RelatedFieldMetadata`.

These support one-to-many tabs/subgrids, many-to-one lookup display fields, relationship metadata, and related table fields on forms or tabs. Employee relationship metadata covers previous employment, leave history, attendance, timesheets, history, documents, education, compensation, and custom-slot tabs such as overview/personal/employment/agent.

### Employee Runtime Completion State

Completed behind the feature flag:

- Runtime command bar has grouped Data Transfer commands.
- Runtime refresh shows a light overlay.
- Employee views drive runtime table columns and temporary client-side row filtering.
- Owner/status/sub-status are record-level metadata fields in the vertical status group.
- Employee detail tabs render real existing tab content through shared runtime tab chrome.
- Related table metadata exists for Employee tabs and future subgrid migration.

Remaining blockers before old Employee files can be removed:

- Save, save-and-close, delete, assign, status, and share command handlers need confirmed backend implementations.
- Import/export commands need reusable import/export dialog flows and confirmed backend handlers for all modules.
- Server-side filtered views need entity query support for runtime view filters/sorting.
- Related tab bodies should eventually be decomposed into reusable runtime subgrid/timeline slots instead of Employee legacy components.

## Employee Runtime List Command And View Fixes

Local flag-on validation found list bridge issues around view state, command grouping, and view column parity. The runtime list bridge now follows these rules:

- Runtime view selection must not expose stable logical keys such as `employees.all`, `employees.active`, or `employees.probation` in the URL.
- Employee view selection is held in local runtime component state. The list route remains `/employees` when the user changes views.
- If future persistence is required, use a non-semantic view id such as `viewId=<uuid>` rather than the runtime logical key.
- Data Transfer commands render only as one grouped command surface named `Data Transfer`.
- Import, Export, and Export Template must not also render as standalone command bar buttons.
- Selection actions such as Assign and Delete/Bulk Delete render as direct visible buttons with icons and labels unless a command has multiple child actions.
- Delete remains a prepared soft-delete intent only. Hard delete and purge stay out of module pages.

Employee runtime system views now define the relevant list columns explicitly:

| View                   | Columns                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| All Employees          | Employee, Code, Status, Reporting Manager, Hire Date, Contact                   |
| Active Employees       | Employee, Code, Status, Department, Designation, Hire Date, Reporting Manager   |
| Employees on Probation | Employee, Code, Status, Hire Date, Probation End Date, Reporting Manager        |
| Employees on Notice    | Employee, Code, Status, Notice Period Days, Termination Date, Reporting Manager |
| Terminated Employees   | Employee, Code, Status, Termination Date, Department, Designation               |

The shared `ModuleDataTable` now accepts these runtime view columns, preserves metadata column order, renders primary-name links, renders Choice List labels, and renders lookup display values for lookup-backed columns such as Department, Designation, and Reporting Manager. Runtime view filters are still applied client-side in the thin Employee value adapter; the next backend phase should move view filters, sorting, and paging into server-side metadata query execution without changing the view metadata contract.

## Employee Runtime Final UX Decisions

The Employee runtime path is the reference pattern for future module migrations, while the old Employee files remain in place until the runtime implementation has backend parity.

Confirmed UX rules:

- Nothing in the runtime Employee page chrome is sticky. Page header, command bar, form selector, tab strip, and status group scroll normally.
- The detail page order is: page title/header, command bar with status group, record summary/header card, form selector, form tab strip, active tab content.
- Form tabs are part of `FormMetadata`, not a page-level afterthought. `FormTabMetadata` supports field tabs and related tabs.
- Related tables render as form tabs through reusable subgrid metadata and `ModuleRelatedSubgrid`.
- Employee-specific runtime files should stay thin: config, metadata/data adapters, command bridge, and wrappers only. Shared UI belongs under `apps/web/app/components`.

Employee full form tabs:

- Summary.
- Personal Info.
- Employment Info.
- Organization / Reporting.
- Contact & Address.
- Payroll / Compensation.
- Previous Employment.
- Documents / Identification.
- Emergency Contact.
- System Information.
- Leave History.
- Attendance.
- Timesheets.
- Employee History.
- Documents.
- Education.
- Agent.

Owner, Status, and Sub Status remain in the right-side command bar status group:

- Detail mode: read-only.
- Edit mode: editable.
- New mode: Owner defaults to current user where the owner Field is present; status controls stay governed by the same reusable status group rules.
- The status label is `Status`; `Employment Status` remains a normal Employee field inside the Employment Info tab.

Command rules:

- Detail mode shows Back, New, Edit, Refresh, Share, Record Export, and prepared soft-delete Delete. Import, Export Template, and Data Transfer are not shown on detail.
- Edit mode shows Back, Save, Save & Close, and Refresh.
- New mode shows Back, Save, and Save & Close.
- List mode shows New, Refresh, selection Assign, selection Delete/Bulk Delete, and a single Data Transfer group containing Import, Export, and Export Template.
- All commands emit through command runtime. Delete remains soft-delete intent only; hard delete and purge are not exposed.

View rules:

- Runtime list view URLs use `?viewId=<GUID>` only.
- Runtime URLs must not expose logical view keys such as `employees.all`.
- Missing or unknown `viewId` falls back to the default view.
- The flagged runtime path can use UUID-style system view ids until published view records supply durable ids.
- Flag-off legacy Employees pages keep their existing `?view=` behavior until they are fully migrated.

Related table transition:

- Related tab metadata now carries relationship key/id, parent entity, related entity, relationship type, lookup field, display field, columns, filters, and sorting-ready slots.
- Tabs with no wired API render a clean shared empty subgrid state with no fake data.
- Remaining backend work is to connect each related tab to metadata query execution and audited command handlers before old Employee tab components are removed.

## Generic Runtime Validation Audit

Validation date: 2026-06-02.

### What Passed

- Shared runtime structure exists and is exported: `ModuleListPage`, `ModuleRecordPage`, `ModuleRuntimeCommandHandler`, `ModuleQuickCreatePanel`, `ModuleDataAdapter`, `RuntimeMetadataFormRenderer`, `ModuleRelatedSubgrid`, `ModuleCommandBar`, `ModuleCommandBarStatusGroup`, and `ModuleViewSelector`.
- Employee flag-on list route delegates to `EmployeeRuntimeListWrapper`, which now delegates page chrome to generic `ModuleListPage` and table rendering to generic `ModuleDataTable`.
- Employee flag-on new/detail/edit routes delegate to `EmployeeRuntimeFormWrapper`, which now delegates page chrome and rendering to generic `ModuleRecordPage` with `create`, `read`, and `edit` modes.
- `ModuleListPage` owns only the View Selector, Action Bar, and Data Table slot. It removes legacy `view` query keys, writes `viewId`, and falls back to the default View for missing/unknown ids.
- `ModuleRecordPage` owns only the Record title/Form Selector, Action Bar with Status Group, and Form Renderer. It resolves mode-specific Actions and sends Save/Save & Close through `ModuleRuntimeCommandHandler`.
- Owner defaults to the current principal in create mode when the owner Field exists and no owner value is provided.
- Owner, Status, and Sub Status do not immediately save from the Status Group. They remain read-only outside edit mode and are persisted only through Save or Save & Close once handlers exist.
- The shared form renderer supports tabs, sections, Field components, timeline shell, notes shell, related-list shell, custom-widget shell, label overrides, 1-4 column layouts, mobile collapse, no-wrap tabs, and More overflow.
- The shared Related List shell now reuses the existing shared `DataTable`, exposes New/Edit/Delete/Refresh actions, supports right-side Quick Create, supports parent Reference binding, and renders clean empty/disabled states when data adapters or related metadata are missing.
- Action grouping uses command metadata. Data Transfer renders as one group, and detail mode excludes Import and Export Template.
- Delete remains soft-delete intent only. Hard delete/purge commands are not exposed on normal Module runtime pages.

### What Was Cleaned Up

- `EmployeeRuntimeListWrapper` was reduced to Employee row/value lookup adaptation and now delegates runtime page chrome to `ModuleListPage` and table rendering to `ModuleDataTable`.
- `EmployeeRuntimeFormWrapper` was reduced to Employee lookup/value adaptation and now delegates runtime page chrome and form rendering to `ModuleRecordPage`.
- The unused `EmployeeRuntimeDetailWrapper` compatibility bridge now delegates to `ModuleRecordPage` instead of duplicating `ModuleDetailShell`, command grouping, status group configuration, and navigation behavior.
- Related List actions and Quick Create behavior moved into shared runtime components instead of Employee-specific tab code.
- Form renderer layout support was normalized around DijiPeople Form, Tab, Section, Field, and component metadata.

### Remaining Blockers

- Employee flag-on list no longer uses `EmployeesTable`; it still applies View filters client-side in the thin Employee value adapter for local parity. Server-side metadata query execution is still needed.
- Save, Save & Close, Delete, Assign, Share, owner/status changes, import, export, and export-template handlers remain prepared/no-op until backend validation, audit/change history, and field-security enforcement are confirmed.
- Related Lists show shared shells and metadata columns, but Employee related APIs are not yet connected to a generic related-record adapter.
- Quick Create shell exists and supports parent binding, but related Module Quick Create metadata and backend create handlers must be connected before enabling New on Employee related tabs.
- Future `visibleWhen` metadata shape exists as `visibilityRuleKey`; full rule evaluation is still a Form Designer/runtime rules phase.

### Old Employee Files Still Used

- `apps/web/app/(authenticated)/employees/page.tsx` still contains the feature-flag branch and the flag-off legacy list page.
- `apps/web/app/(authenticated)/employees/new/page.tsx` still contains the feature-flag branch and the flag-off legacy Employee form.
- `apps/web/app/(authenticated)/employees/[employeeId]/page.tsx` still contains flag-off Employee tabs, Employee command bar, Employee-specific profile sections, and legacy metadata form preview.
- `apps/web/app/(authenticated)/employees/[employeeId]/edit/page.tsx` still contains the feature-flag branch and the flag-off legacy Employee form.
- `apps/web/app/(authenticated)/employees/_components/employees-command-bar.tsx` remains used only by flag-off Employee pages.
- `apps/web/app/(authenticated)/employees/_components/employees-table.tsx` remains used by the flag-off list page only.
- Employee tab body components for documents, education, history, previous employment, compensation, reporting, access, and agent remain used by flag-off detail routes.

### Old Employee Files Now Replaceable

- Employee-specific runtime page shell code is replaceable because `ModuleListPage` and `ModuleRecordPage` own the shared runtime chrome.
- `EmployeeRuntimeCommandHandler` is replaceable by `ModuleRuntimeCommandHandler`; it can be removed after confirming no legacy bridge imports remain.
- `EmployeeRuntimeDetailWrapper` is now a compatibility shim over `ModuleRecordPage` and can be removed after route imports are verified.
- Employee-specific command bar behavior can be retired after runtime command handlers cover import/export/delete/assign/share/save.

### Pending Deletion After Parity Approval

- Legacy Employee command bar, form shell, detail tabs, and tab body managers.
- Employee-specific list table after the flag-off path is retired and server-side metadata-driven querying is confirmed.
- Employee-specific related-tab body components after each Related List is backed by the generic related-record adapter and audited Actions.

## Adapter-Backed Command Execution Update

Validation date: 2026-06-02.

The generic runtime command path now executes adapter-backed commands through this flow:

`Action Bar / Form Renderer / Related List -> ModuleRuntimeCommandHandler -> executeRuntimeCommand -> ModuleDataAdapter -> existing module API/backend`.

UI components do not call Employee APIs directly in the flag-on runtime path. `ModuleRuntimeCommandHandler` receives the active Form, active View, selected rows, current draft Record values, and an optional `ModuleDataAdapter`. It builds reusable adapter command handlers for Save, Save & Close, soft delete, assign owner, status/sub-status command hooks, refresh, list export, record export, and related-record mutations.

### Employee Adapter Wiring Status

Supported through `employeeModuleDataAdapter`:

- `list` and `getById` call the existing `/api/employees` proxies.
- `create` posts through `/api/employees`.
- `update` patches through `/api/employees/{id}`.
- Owner changes made in edit mode are stored in draft form state and persisted on Save/Save & Close through the existing assign-owner endpoint.
- `softDelete` calls `/api/employees/{id}` for a single record and `/api/employees/bulk-delete` for bulk soft delete/archive.
- `assignOwner` calls the existing single-record and bulk assign-owner endpoints when an owner id is supplied by a generic command payload.
- `exportList` calls `/api/employees/export` and includes the selected runtime `viewId` plus selected View columns where possible.
- Record export is generated by the generic runtime from the selected Form metadata and current Record data. It includes Record Header, Status Group fields, and every visible field or field component across Form tabs and sections without duplicate fields.
- Related create/update/delete are wired for `employee_previous_employments` and `employee_education`, where existing APIs are present.
- Related list refresh is wired only where a list API exists. `employee_previous_employments` has a list endpoint; `employee_education` currently has create/update/delete but no list endpoint.

Disabled or blocked:

- Generic bulk Assign is available through the reusable Assign dialog when the module adapter exposes `assignOwner` and owner options are available.
- Record `Status` and `Sub Status` command hooks are disabled because no dedicated Employee record status/sub-status backend API was verified. Status fields are editable only in edit mode, remain in draft form state, and must not immediately mutate.
- Share remains disabled because no Employee sharing backend was verified.
- Related lists without verified APIs show clean disabled action states and do not render fake data.

### Runtime Behavior Confirmed

- Save/Create/Update now flow through `ModuleDataAdapter`.
- Save & Close saves through the adapter and returns to the module list.
- Owner, Status, and Sub Status controls are read-only in read mode and editable only in edit mode.
- Owner/Status/Sub Status dropdown changes update local form state only; they do not trigger immediate mutations.
- Create mode defaults Owner to the current principal where the owner Field exists.
- Delete remains soft delete/archive only. Hard delete and purge are not exposed on Module runtime pages.
- List export is adapter-backed when available, with a generic client-side CSV fallback using the selected View columns and current rows.
- Record export appears on detail pages where metadata exposes `record.export` and uses the selected Form metadata shape from the generic runtime. It no longer depends on the legacy Employee fixed-profile export shape.
- Related Quick Create opens the shared right-side `ModuleQuickCreatePanel` and saves through `createRelatedRecord` when the adapter supports the relationship.

## Generic Runtime Action Finishing Pass

Validation date: 2026-06-02.

### Owner Picker And Assign

- `ModuleOwnerPicker` is the shared owner/user picker for runtime surfaces. It lives in the shared runtime component area and wraps the existing `LookupField`, so it supports single-owner selection, current owner display, local filtering, and adapter-backed remote search without module-specific UI.
- `ModuleCommandBarStatusGroup` uses `ModuleOwnerPicker` for the Owner field in edit mode.
- `ModuleAssignDialog` is the shared Assign surface for both record and bulk selection assignment. It shows the selected count, uses `ModuleOwnerPicker`, and submits through `ModuleRuntimeCommandHandler`.
- Assign execution flows through `ModuleRuntimeCommandHandler -> ModuleDataAdapter.assignOwner`. UI components do not call owner APIs directly.
- The adapter can optionally expose `getOwnerOptions(runtime, search)` for generic owner/user lookup. Employee implements this through the existing owner-options API inside `employeeModuleDataAdapter`; the backend owns candidate eligibility and actor authorization, while the generic frontend only renders returned options.
- If a module does not provide `assignOwner`, the Assign action remains unavailable with a clear disabled/error reason.
- Validation cleanup: `LookupField` accepts a generic `onSearch` callback, `ModuleOwnerPicker` forwards search text, `ModuleAssignDialog` forwards it to the runtime command handler, and `ModuleRuntimeCommandHandler` loads owner options through `ModuleDataAdapter.getOwnerOptions`. The search callback is stored behind a stable ref so remote owner search does not loop on parent re-render.

### Share Dialog

- `ModuleShareDialog` is the shared record share surface.
- Share does not call a backend or bypass RBAC. It generates the current record route link and states that the link only works for users with relevant permissions.
- Share requires record route context. If no record id/route exists, the command fails with a clear reason.
- Employee consumes the generic share dialog only; no Employee-specific share UI was added.

### Confirmation Framework

- `CommandDefinition.confirmation` now supports reusable confirmation metadata: title, description, confirm label, and destructive flag.
- `ModuleRuntimeCommandHandler` shows the shared `ConfirmationDialog` before executing commands that define `confirmation` or `requiresConfirmation`.
- Confirmation descriptions can include `{selectedCount}` for bulk actions.
- Delete and bulk delete confirmations clearly describe soft delete/archive behavior and explicitly avoid hard delete/purge.
- Confirmed commands still execute only through the command runtime and adapter-backed handlers.

### Soft Delete UX

- Single-record delete from detail and bulk delete from list selection use the same confirmation framework.
- Delete execution flows through `ModuleDataAdapter.softDelete`.
- Employee uses existing single and bulk soft-delete/archive endpoints inside `employeeModuleDataAdapter`.
- Module runtime pages still expose no hard delete or purge command.
- After successful soft delete, the runtime refreshes list/detail context and record delete returns to the module list.

### Disabled Reasons

- Disabled commands carry metadata reasons via `CommandDefinition.disabledReason`.
- The command bar renders disabled actions with tooltip reasons.
- The command resolver also blocks disabled commands before execution, so disabled state is enforced outside the visual layer.

## Employee Runtime QA Fixes

Validation date: 2026-06-02.

### Status Group Popover

- The Action Bar status group is a single reusable `Status Group` control.
- It is collapsed by default and opens as an anchored popover on click, keeping the Action Bar height stable.
- The popover closes on outside click and Escape.
- The trigger shows a concise Owner / Status / Sub Status summary when values are available.
- The popover contains Owner, Status, and Sub Status.
- Owner uses the shared `ModuleOwnerPicker`; Status and Sub Status use reusable choice-list controls.
- Sub Status is modeled as dependent on Status. Changing Status clears Sub Status in draft state.

### Status Group Permissions

- Owner, Status, and Sub Status are editable only when the page is in edit mode and the current user has one of Global Administrator, System Administrator, or HR.
- Generic runtime contexts must propagate the authenticated user's role source into `runtime.security.principal.roleKeys` and, when available, `runtime.security.principal.roles`. The Employee flag-on wrappers populate those values from `getSessionUser()`.
- Role checks use reusable normalization so display names, role keys, and aliases such as `Global Administrator`, `global-admin`, `global administrator`, `global_administrator`, `System Administrator`, `system-admin`, `HR`, and `HR Manager` match consistently.
- `hasAnyRuntimeRole(userRoles, allowedRoles)` accepts string roles, role objects with `name`, `displayName`, `slug`, `key`, or `id`, and nested `roles` arrays. It normalizes case, trim, spaces, underscores, and hyphens before matching.
- All other users and modes see locked read-only values using the shared `components/ui/form-control` disabled visual pattern, with no lookup/search/dropdown interaction.
- Owner assignment is additionally enforced by the Employee backend with the same normalized role matching rule: only Global Administrator, System Administrator, or HR actors can assign owners.
- Development-only Status Group editability diagnostics may log mode, raw roles, normalized roles, allowed roles, and match result. They are guarded by `process.env.NODE_ENV === "development"` and are not emitted in production.
- The actual mounted runtime path also logs guarded diagnostics from `ModuleRecordPage`, `ModuleCommandBarStatusGroup`, and `ModuleRuntimeCommandHandler`, including command keys, selected adapter methods, command results, and field editability state.
- Status Group changes update the same draft Record state as the Form Renderer. They do not call immediate mutation APIs. Save and Save & Close pass the combined draft values through `ModuleRuntimeCommandHandler -> ModuleDataAdapter.update`.
- Employee root-cause finding: the Employee Prisma model already had `ownerUserId`, `createdAt`, `createdById`, `updatedAt`, `updatedById`, `deletedAt`, `deletedById`, and `isDeleted`, but did not have separate system lifecycle `status` and `subStatus` fields. `employmentStatus` is a business field and must not be used as record Status.
- Employee now has dedicated record lifecycle fields through `20260603090000_employee_record_lifecycle_fields`: `status` and `subStatus`, both separate from `employmentStatus`.
- Employee runtime `status` and `subStatus` read/write only those system lifecycle fields. `employmentStatus` remains a normal Employee form field under Employment Info.

### Owner Eligibility

- Runtime owner selection supports adapter-provided owner options and forwards picker search text to `ModuleDataAdapter.getOwnerOptions` when available.
- Employee owner options are returned by the backend as active tenant users with Global Administrator, System Administrator, or HR roles. Frontend runtime code does not apply a second role filter to owner candidates.
- Employee owner assignment validates the target owner with the same role rule before writing `ownerUserId`.
- Random active users are no longer eligible owner candidates.

### Standard Module Migration Pass

- Added `standard-module-runtime` metadata helpers to generate reusable Module config, Entity metadata, View metadata, Form metadata, and standard command metadata from a module spec.
- Added `StandardModuleListPage`, a thin client wrapper around `ModuleListPage` and `ModuleDataTable`, for modules whose list route already fetches records on the server.
- Migrated list routes for Leaves, Attendance, Timesheets, Projects, Approvals, and Customers to the generic runtime list contract: View Selector, Action Bar, and Data Table only.
- The migrated list routes keep existing server-side API reads and access guards, but no longer render module-specific list command bars, view selector components, or table wrappers on those routes.
- `viewId` is now the selected-view URL key for the migrated standard module list pages. Legacy `view` parameters are not used by the new generic list wrappers.
- Standard module Delete and Assign commands remain disabled until a module-specific `ModuleDataAdapter` confirms soft-delete and assign-owner backend support. No hard delete/purge is exposed.

### Employee Migration Validation

- `/employees`, `/employees/new`, and `/employees/:id/edit` now use the generic runtime path without feature-flag fallback UI.
- `/employees` renders through the thin `EmployeeRuntimeListWrapper -> StandardModuleListPage -> ModuleListPage -> ModuleDataTable` path with `employeeModuleDataAdapter`.
- `/employees/new` and `/employees/:id/edit` render through the thin `EmployeeRuntimeFormWrapper -> ModuleRecordPage` path with `employeeModuleDataAdapter`.
- Removed legacy Employee list files after validation: `employees-table.tsx`, `employee-columns.tsx`, and the unused `employee-runtime-detail-wrapper.tsx`.
- Still pending parity before deletion: Employee detail legacy fallback body and `employees-command-bar.tsx` remain referenced by `/employees/:id` while read-page related tab parity is finalized.

### Header And Status-Only Fields

- Employee `Full Name` remains the primary record title/header value and was removed from the Employee system form sections.
- Employee `Owner` appears only in the Status Group and was removed from the Employee system form sections.
- Customization-created forms can still include those fields later only when explicitly added by metadata.

### Auto-Generated Employee Code

- `employeeCode` is marked with generic field metadata:
  - `autoGenerated`
  - `formatSource: settings`
  - `settingsKey: employee.employeeCodeFormat`
  - `lockedByDefault`
  - `unlockableByCustomization`
- The generic form renderer treats fields as editable only when the page is create/edit, field behavior and field security allow writes, the Form field is not read-only, and the Field is not `autoGenerated` or `lockedByDefault`.
- `unlockableByCustomization` only means a customization layer may explicitly unlock the field later. It does not make the system field editable by default. Employee Code is locked in create, read, and edit unless metadata explicitly unlocks it.
- Read, edit, and create modes use the same Form metadata tabs, sections, and fields. Read mode uses shared `components/ui/form-control` locked visuals; edit/create modes unlock only fields allowed by metadata and security.

### Cascading References

- Generic Field metadata now supports:
  - `dependsOnFieldId`
  - `dependencyFilterKey`
  - `resetOnParentChange`
- Employee defines `Country -> State / Province -> City` through that metadata.
- When Country changes, State / Province and City reset and the renderer asks the module data adapter for fresh State / Province options.
- When State / Province changes, City resets and the renderer asks the module data adapter for fresh City options.
- The form renderer calls `ModuleDataAdapter.getLookupOptions`; UI components do not call Employee lookup APIs directly for this dependency refresh.

### Export Contract

- Employee export now accepts generic runtime export query parameters:
  - `viewId` as UUID
  - `columns` as either a comma-separated list or repeated string array query values
- The backend validates columns against a fixed allow-list of Employee export field logical names and maps runtime lookup columns such as Department, Designation, Reporting Manager, and Owner to safe export values.
- Unsupported or empty column input falls back to the standard Employee export columns.
- `GET /api/employees/export?viewId=<uuid>&columns=fullName,employeeCode` is part of the accepted generic runtime contract and must not fail DTO whitelisting for `viewId` or `columns`.
- Detail pages continue to exclude Import and Export Template.
- Record export is a generic current-record export that uses selected Form metadata across all tabs and sections. It includes the primary Record title from the header policy, Status Group fields when configured, labels/display values where available, and avoids duplicate fields.

### Remaining Blockers After QA Fixes

- Server-side Employee list filtering still does not execute arbitrary runtime View metadata. The flag-on runtime sends the selected View export shape, but list filtering parity remains a backend query-planning task.
- Dedicated Employee status/sub-status command APIs are still not verified. Status and Sub Status edits stay in draft state and persist only through Save/Save & Close.
- Share remains a route-link dialog only; it does not grant permissions or bypass RBAC.
- Old Employee flag-off files remain intentionally retained until parity approval and feature-flag retirement.

## Customization Package Foundation Phase A

Validation date: 2026-06-03.

### Terminology And Navigation

- Product-facing customization copy now uses DijiPeople terminology: Modules, Fields, Related Lists, Choice Lists, and Packages.
- The existing `/settings/customization/tables` route and `/customization/tables` API remain in place for backward compatibility, but the page title, table headers, actions, filters, and empty states present the area as Modules.
- The settings navigation label changed from Tables to Modules and Columns to Fields. Legacy keywords remain searchable so existing users can still find the section.
- Designer implementation was not overhauled in this phase. Safe labels were changed from columns to fields where the existing designers expose runtime view/form metadata.

### Package And Publisher Metadata Foundation

- Shared customization types now include package/publisher metadata primitives:
  - `CustomizationPublisher`
  - `CustomizationPackage`
  - `CustomizationPackageComponent`
  - `CustomizationPackageType`
  - `CustomizationPackageState`
  - `CustomizationComponentType`
- System components display as Default Package owned; custom components display as Custom Package owned until backend package ownership tables are available.
- The frontend does not fabricate export/import behavior. Package labels are transitional metadata indicators only in Phase A.

### Modules List Modernization

- `/settings/customization/tables` now uses the shared `DataTable` with search, local pagination, sorting, System/Custom filtering, and Active/Inactive filtering.
- The list uses compact enterprise density and columns for Module name, Logical name, Route, Type, Status, Fields count, Forms count, Views count, Modified on, and Actions.
- System Modules can be customized/renamed where permissions allow but cannot be deleted. Custom Modules can be deleted only through the existing customization delete API and only when dependency rules allow it.
- Activate/Deactivate actions are present, with system Module status changes disabled where the backend does not safely support them.

### Module Detail Modernization

- `/settings/customization/tables/[module]` uses a local customization shell with collapsible sidebar navigation and tabs for Forms, Views, Fields, and Settings.
- Forms, Views, and Fields tabs all use the shared `DataTable` with search, filters, sorting, compact density, and pagination.
- The detail shell surfaces System/Custom source and package labels consistently across Forms, Views, and Fields.
- The Employee module merges runtime metadata Forms and Views into the customization detail page when API rows are missing, so the runtime Employee Forms and Views are visible during customization review.

### Field Modal Rules

- Add custom Field generates a locked logical name with the default publisher prefix `dp_`, for example `dp_passportExpiryDate`.
- Field logical name is editable only during creation and locked after creation.
- Sort order UI was removed from the Field modal; internal order is still preserved for compatibility payloads.
- Choice Fields use structured option rows with label, stable value/key, and active state.
- Reference target selection appears only for Reference Fields.
- The backend customization DTO now accepts publisher-prefixed Field logical names shaped as `<prefix>_<camelCaseName>`.

### DataTable Reuse

- The shared `DataTable` now supports client-side pagination when pagination metadata is supplied without server mode.
- The customization pages reuse this shared table instead of adding local grid implementations.
- This preserves backward compatibility for existing non-paginated `DataTable` consumers and server-mode consumers.

### Remaining Blockers

- Backend package/publisher persistence is not implemented yet. Default Package and Custom Package labels are frontend transition labels until package ownership is stored and resolved by API.
- Import/export package commands were not added in this phase.
- Form Designer and View Designer still use the existing designer architecture. They received only safe terminology label updates.
- The customization route and API paths still use `tables` and `columns` internally for compatibility. Renaming those contracts should wait for a backend migration plan.
- System component layering rules are represented in UI labels, but managed/unmanaged package enforcement still depends on future backend package ownership and publish validation.

## Customization Package Foundation Phase B

Validation date: 2026-06-03.

### Package CRUD

- `/settings/customization/packages` is the Package management entry point.
- The Packages page uses the shared `DataTable` with search, local pagination, Type filter, State filter, Managed filter, and compact enterprise density.
- The Action Bar exposes New Package, Import Package, and Refresh.
- Default Package is visible and read-only. It cannot be edited or deleted.
- Custom Packages can be created and renamed through the existing customization package API bridge.
- Package delete is guarded. It is disabled for Default Package, managed packages, and packages that still contain components or require unavailable dependency validation.
- Publish is intentionally disabled with the reason: "Publish Center and dependency validation are not fully implemented yet."

### Publisher And Prefix Model

- Phase B introduces publisher and prefix metadata in the API response and frontend types.
- Until a dedicated Publisher schema exists, the tenant default publisher is derived from the authenticated tenant name and tenant id.
- Publisher prefix is derived from the company/business short name and shown as read-only in the New Package flow.
- Prefix locking is documented as a rule and exposed as metadata-ready behavior, but full persistence of publisher prefix locks requires a future Publisher table.
- Package keys auto-generate from the prefix and package name and must remain unique per tenant.
- Package version validates semantic version format. Existing storage returns version `1.0.0` until a version column or package manifest store exists.

### Package Hierarchy

- Package detail lives at `/settings/customization/packages/[packageId]`.
- Package detail renders the hierarchy as Package -> Module -> Components.
- Components are grouped by Module and displayed through shared `DataTable` instances.
- Displayed component groups include Module, Fields, Forms, Views, Choice Lists, Relationships, Related Lists, Action Bars, Rules, Automations, and Timeline Config.
- Current storage-backed component types are Module, Field, Form, and View through `CustomizationSolutionComponent`. Unsupported component groups render as metadata-ready choices but do not fake persistence.

### Add Existing Flow

- Add Existing opens from Package detail.
- Users choose Module, Component Type, and one or more components.
- Adding an existing System component creates a package membership/layer reference with layer action `Modify`.
- Adding an existing Custom component creates a package membership/reference with layer action `Reference`.
- Duplicate membership in the same Package is prevented by the existing `solutionId_componentType_objectId` uniqueness rule and disabled candidate rows.
- Dependency warnings are shown where metadata is available, but the real dependency engine remains pending.

### JSON Export

- Export Package downloads metadata-only JSON.
- Export shape:

```json
{
  "manifest": {
    "packageId": "...",
    "packageKey": "...",
    "displayName": "...",
    "version": "1.0.0",
    "publisher": {
      "publisherId": "...",
      "displayName": "...",
      "prefix": "dp"
    },
    "exportedAt": "...",
    "formatVersion": "1.0"
  },
  "modules": [],
  "components": [],
  "dependencies": []
}
```

- Export includes metadata only and never exports business data records.
- Dependencies export as an empty array until the dependency engine is complete.

### Import Preview Shell

- Import Package accepts JSON, validates manifest shape, validates supported `formatVersion`, validates package key/version, and validates that component entries include stable identity.
- The import flow shows a preview with package name, version, publisher/prefix, modules count, components count, and dependencies count.
- Import apply is not enabled in Phase B. Valid JSON returns a preview plus a clear blocker message.

### Remaining Blockers

- Dedicated Publisher schema and persisted prefix locking.
- Real dependency engine and delete dependency graph.
- Publish Center and publish validation.
- Managed/unmanaged upgrade and patch layering logic.
- JSON import apply/persistence.
- Runtime package layer merge and effective metadata resolution.

## Metadata Layering And Publish Center Phase B.5

Validation date: 2026-06-04.

### Metadata Layering Model

Metadata is resolved in this order:

1. Platform Runtime
2. Default Package
3. Managed Packages
4. Custom Packages
5. Personal/User Layer, later

Higher layers override lower layers by `componentKey` or `baseComponentId`. System components in the Default Package are immutable; customization creates a higher-layer component in a selected Custom Package. Package component layer actions are:

- `create`: brand-new custom component.
- `modify`: customization layer over an inherited component.
- `reference`: dependency/export membership without modifying the original.
- `remove`: future layer that hides/removes an inherited component.

### Runtime Layer Resolution

Runtime uses published metadata only. Draft metadata is visible only in Customization and Publish Center. The reusable runtime resolver accepts component layers, filters published layers for runtime, orders layers by `layerOrder`, and merges by `componentKey`/`baseComponentId`. Runtime must never read draft package metadata.

### System Component Customization Rule

When a user edits a System component, the original System/Default Package component remains untouched. A customization layer must be created or reused in the selected Custom Package. If no Custom Package is selected, the UI must show: "Select or create a custom package before customizing a system component."

This applies to Fields, Forms, Views, Choice Lists, Action Bars, Relationships, Related Lists, Timeline Config, Rules, and Automations. Phase B.5 adds the shared helper/service foundation and guards the current Fields/Forms/Views direct-edit paths where safe.

### Draft vs Published Lifecycle

Metadata layer lifecycle states are `draft`, `published`, `deprecated`, and `archived`. Draft changes are saved as package layer metadata and stay out of runtime until publish. Published layers are immutable from runtime's perspective. Deprecated and archived layers remain visible in customization history and dependency checks but are not normal runtime targets.

### Publish Center Foundation

`/settings/customization/publish` lists draft package components pending publish with shared `DataTable` columns for Component, Type, Module, Package, Layer Action, State, Modified On, Issues, and Actions. Validate runs dependency foundation checks. Publish Selected remains disabled until Publish Center transactions and dependency validation are complete; the UI must not fake publish success.

### Phase B.6 End-To-End Layer Persistence

Validation date: 2026-06-04.

What passed:

- Package component rows now persist layer metadata on `CustomizationSolutionComponent`: `baseComponentId`, `layerAction`, `lifecycleState`, `layerOrder`, `version`, `checksum`, `metadataJson`, `publishedAt`, and `publishedByUserId`.
- Default Package sync publishes system metadata as immutable lower-layer references.
- Add Existing in a Custom Package creates draft layer rows. System components become `modify` layers over `baseComponentId`; custom components become `reference` layers.
- Publish Center supports selecting draft components, validating selected components, publishing selected components, and writing a publish snapshot.
- Runtime effective metadata has a read endpoint that returns published layers only. Draft metadata remains customization-only.
- Module detail now exposes the standard metadata tabs: Fields, Forms, Views, Choice Lists, Relationships, Action Bars, and Settings.

Cleaned up:

- Publish Center no longer has a disabled placeholder Publish Selected action.
- Draft list state now comes from persisted lifecycle state instead of hardcoded `draft` labels.
- Package export includes persisted layer state and component dependency placeholders.
- Package delete now blocks specifically on published components; draft-only packages can be removed after components are cleared.

Remaining blockers:

- Choice Lists, Relationships, and Action Bars tabs are present but backend CRUD stores are not enabled yet; they show clean disabled empty states.
- Dependency validation is still foundation-level. It reports structured issues but does not yet resolve every cross-package dependency from full metadata graphs.
- Import apply, managed package upgrades, conflict resolution, and patch compatibility are still pending.
- System component edit flows still require a selected Custom Package to create/reuse higher-layer draft metadata before direct system edits can be fully replaced.
- Form and View designers still need the full enterprise drag/drop designer pass; current designer persistence remains tied to Forms/Views metadata already present.

### Effective/System Component Actions

Validation date: 2026-06-04.

Customization screens may show effective runtime metadata that does not yet exist as a persisted `CustomizationForm`, `CustomizationView`, or `CustomizationColumn` row. Actions on those rows must never patch the Default Package or the system component directly.

Layer-safe action flow:

1. Detect whether the row is a persisted custom component or an effective/system component.
2. Persisted custom components update through their normal table-scoped endpoint.
3. Effective/system components require a selected Custom Package. Default Package is not allowed.
4. The API creates or reuses a draft package layer with `layerAction=modify`, `lifecycleState=draft`, `baseComponentId`/component key pointing at the inherited component, and `metadataJson` carrying the requested override when a separate row cannot be duplicated.
5. Runtime continues to consume published layers only; draft layers remain visible in Customization and Publish Center.

Forms:

- Runtime/system forms such as `employee.main.full` are patched with current effective form metadata plus `packageId`.
- If no persisted form row exists, the API creates a draft custom form row and package component layer.
- Designer navigation first ensures the draft layer, then opens the designer against the draft form key.
- Deactivate/Activate and Set Default on system forms create/update draft layer metadata rather than mutating system metadata.

Views:

- Runtime/system views use the same selected Custom Package flow before edit, designer, activate/deactivate, or default actions.
- The designer edits the ensured draft row.

Fields:

- Persisted custom fields update normally.
- Persisted system fields cannot be duplicated with the same logical key in the current schema, so field overrides are persisted as draft package component metadata in `metadataJson` and the system field row is not updated.

If a component cannot be resolved from published metadata or customization records, the UI/API must show: "This component does not exist in published metadata or customization records."

### Unassigned Draft Customizations

Validation date: 2026-06-04.

Users may customize an effective/system component without selecting a Custom Package. Those changes must never fall back to Default Package. The runtime now uses an internal tenant package bucket:

- `solutionKey`: `unassigned-draft-customizations`
- display name: `Unassigned Draft Customizations`
- package type: custom draft holding area
- export: blocked until moved to a real Custom Package
- publish: blocked until moved to a real Custom Package

The bucket exists only to preserve work safely while the user has not chosen packaging ownership. It is not a replacement for exportable Custom Packages.

### Ensure Layer API

`POST /api/customization/layers/ensure` creates or returns a draft package component layer for Forms, Views, Fields, and other storage-backed metadata component types.

If `packageId` is supplied, the API uses that Custom Package. If `packageId` is missing, it creates/uses `Unassigned Draft Customizations`. Default Package is rejected. Duplicate draft layer membership for the same package/component is prevented by checking for an existing draft layer before creating another.

### Move To Package

`POST /api/customization/components/move` moves selected draft components from one package to another Custom Package. The move preserves base component identity, layer action, lifecycle state, version, checksum, and metadata payload. It rejects Default Package targets, Unassigned targets, non-draft components, and duplicate membership in the target package.

Publish Center exposes this as `Move to Package`, with package filtering and selected-row movement. Unassigned drafts must be moved before publishing.

### Publish Center Finalized Rules

- Validate selected drafts.
- Publish selected drafts only when validation passes.
- Block publishing from `Unassigned Draft Customizations`.
- Filter by package, including Unassigned Draft Customizations.
- Move selected draft components into a real Custom Package.
- Runtime effective metadata continues to resolve published layers only; draft and unassigned layers are ignored by runtime until moved and explicitly published.

### Dependency Validation Foundation

Dependency validation returns structured issues:

- `severity`: `error`, `warning`, or `info`
- `componentId`
- `componentType`
- `message`
- `blocking`

Foundation checks include Field used by Form, Field used by View, default Form/View protection, Choice List used by Field, Relationship used by Related List, Action permission reference placeholders, duplicate package component membership, missing base component, and missing package dependency. Phase B.5 uses this for Publish Center validation and keeps existing delete guards aligned with the same structured issue model.

### Conflict/Upgrade Model Placeholder

Managed/unmanaged upgrades must detect layer conflicts, missing base components, publisher collisions, dependency breaks, and patch compatibility before import/apply/publish. The placeholder model exists in shared types but real upgrade resolution remains a future Publish Center/import phase.

### Reuse Rules

Reusable metadata lifecycle, layer resolution, dependency validation, package helpers, DTOs, and permission checks must live under shared locations:

- `apps/web/lib`
- `apps/web/lib/runtime`
- `apps/web/app/components`
- `services/api/src/modules/customization`
- `services/api/src/common`

Module-specific metadata lifecycle logic is not allowed. Existing helpers must be extended before new ones are introduced.

## Customization Designer QA Finishing Pass

Validation date: 2026-06-04.

### Form Designer Layout

- Form layout metadata now supports `columns` on the Form root and on each Tab.
- Tab columns control the section grid. Section `columnSpan` is clamped to the parent Tab columns, so two span-1 sections can sit side by side on a two-column Tab and a span-2 section occupies the full Tab row.
- Sections still own their own `columns` value for Fields/components inside the Section.
- Field/component `columnSpan` is clamped to the parent Section columns.
- Designer persistence preserves tab order, tab columns, section order, section columns, section spans, field order, field spans, field labels, required/read-only flags, form type, default state, and active state.

### Form Type And Mode Cleanup

- Product-facing Form Types are Main Form, Minimal Form, Quick Create Form, Card Form, and Lookup Form.
- Create, read, and edit remain runtime modes/states and must not be presented as Form Types.
- Legacy `create` and `edit` enum values remain schema-compatible for older data, but new UI creation does not offer them.
- Quick Create Forms are used by Related List `New`, open in the right-side Quick Create panel, reuse the shared Form Renderer, and receive parent Reference binding from the Related List context.

### Field Palette And Logical Names

- The Form Designer palette is compact, searchable, filterable by Available/Used, System/Custom, and Field type, and uses grouped metadata buckets for System, Business, Custom, and Hidden/Locked Fields.
- Used Fields are marked and hidden by default through the Available filter.
- Custom Field logical names auto-generate from Display Name using the publisher prefix, for example `dp_passportExpiryDate`, and are locked after creation.
- Choice Lists, Relationships, and Action Bars use the same prefix-based logical-name generation in their editors.

### DataTable Width And Counts

- Customization pages continue to reuse the shared `DataTable`. Width overflow is contained inside the table container rather than the page, with compact cell padding and pagination kept visible.
- Module detail counts now use server-provided Fields, Forms, and Views plus metadata-component counts loaded from the package layer endpoint for Choice Lists, Relationships, and Action Bars.
- Counts represent effective customization metadata visible in the current customization context; draft package layers are included on customization screens and remain excluded from published runtime resolution until publish.

### Choice Lists

- Choice Lists are no longer placeholders. The tab uses the shared `DataTable`, search, filters, pagination, and package-backed draft metadata rows.
- The editor captures label, logical name, type, active state, options, color, parent status for Sub Status lists, notes, and package ownership.
- Saves call `POST /api/customization/layers/ensure` and create or update draft `optionSet` layer metadata. System metadata is not overwritten.
- Deactivation is metadata-layered and dependency guarded by future publish validation; hard delete is not exposed.

### Relationships

- Relationships are no longer placeholders. The tab uses the shared `DataTable`, search, filters, pagination, and package-backed draft metadata rows.
- The editor captures display name, logical name, source Module, target Module, relationship type, reference Field, Related List generation, cascade behavior, active state, notes, and package ownership.
- Saves call `POST /api/customization/layers/ensure` and create or update draft `lookup` layer metadata. System metadata is not overwritten.

### Action Bars

- Action Bars are no longer placeholders. The tab uses the shared `DataTable`, search, filters, pagination, and package-backed draft metadata rows.
- The editor captures display name, logical name, scope, actions, action groups, order, icon key, permission key, active state, notes, and package ownership.
- Standard system actions remain New, Edit, Delete, Refresh, Assign, Share, Import, Export, Export Template, Back, Save, and Save & Close.
- Saves call `POST /api/customization/layers/ensure` and create or update draft `actionBar` layer metadata. System metadata is not overwritten.

### Module Properties

- The Settings tab is now Module Properties.
- It shows singular/plural display names, locked logical name, locked route, primary name readiness, owner/status/timeline/change history/audit readiness, icon/color/description, source, package, lifecycle, active status, and component counts.
- Copy buttons are provided for stable identifiers and routes.
- System Modules cannot be deactivated or deleted through this screen. Display name, icon, color, and description customization must go through a draft layer before runtime publish.

### Remaining Blockers

- Dedicated normalized metadata stores for Choice Lists, Relationships, and Action Bars are still represented as package layer metadata in `CustomizationSolutionComponent.metadataJson`.
- Dependency validation is still publish-time foundation logic; editors do not yet resolve every cross-component dependency inline.
- Module Properties safe-edit controls are metadata-ready but not fully implemented as a separate module-property layer editor.
- Package publisher schema and persisted prefix selection remain future work; current UI uses the package publisher prefix when available and falls back to `dp`.

## Generic Module Runtime Migration Validation

Validation date: 2026-06-04.

### Generic Runtime Foundation

The reusable runtime foundation now has the shared surfaces required for module migration:

- `ModuleListPage` renders View Selector, Action Bar, and shared Data Table only.
- `ModuleRecordPage` renders Record title/Form Selector, Action Bar with Status Group, and shared Form Renderer only.
- `ModuleRuntimeCommandHandler` routes runtime actions through `ModuleDataAdapter` command handlers.
- `ModuleQuickCreatePanel`, Related List shell, Action Bar, Status Group, View Selector, and Data Table reuse shared runtime/component primitives.
- `StandardModuleListPage`, `StandardModuleRecordPage`, `standard-module-runtime`, `standard-module-route-helpers`, and `standard-module-data.adapter` provide reusable system-module wrappers without module-specific UI.

### Owner And Assign Runtime Validation

Owner selection and Assign use the generic flow:

`Action Bar -> ModuleRuntimeCommandHandler -> ModuleAssignDialog -> ModuleOwnerPicker -> ModuleDataAdapter.assignOwner`.

Owner search is delegated to the adapter via `getOwnerOptions(runtime, search)` and no longer filters owner candidates in Employee UI code. Employee remains a consumer of the generic assign path; backend authorization remains the authority for who can be assigned. Unsupported modules keep Assign disabled with the reason: "Owner assignment is not configured for this module adapter yet."

### Employee Migration

Employee is generic-runtime only on the migrated path:

- `/employees` uses generic `ModuleListPage` through the thin `EmployeeRuntimeListWrapper`.
- `/employees/new` uses generic `ModuleRecordPage` in create mode through the thin `EmployeeRuntimeFormWrapper`.
- `/employees/:id` uses generic `ModuleRecordPage` in read mode through the thin `EmployeeRuntimeFormWrapper`.
- `/employees/:id/edit` uses generic `ModuleRecordPage` in edit mode through the thin `EmployeeRuntimeFormWrapper`.

Cleaned up Employee-specific UI files:

- `apps/web/app/(authenticated)/employees/_components/employees-table.tsx`
- `apps/web/app/(authenticated)/employees/_components/employee-columns.tsx`
- `apps/web/app/(authenticated)/employees/_components/employee-form.tsx`
- `apps/web/app/(authenticated)/employees/_components/employees-command-bar.tsx`
- `apps/web/app/(authenticated)/employees/_components/employee-runtime-command-handler.tsx`

Employee files still used:

- `employee-metadata.adapter.ts` for Employee metadata/config mapping.
- `employee-data.adapter.ts` for Employee API-backed data commands.
- `employee-value-adapter.ts` for Employee display/value normalization.
- Thin route wrappers under `/employees` and `_components/employee-runtime-*-wrapper.tsx`.

Old Employee detail body/tab files are now replaceable after related-list and specialized widget parity approval. They should not be reintroduced into the flag-on route path.

### Standard Module Migration Status

| Module | List | Read Record | Create Record | Edit Record | Generic Adapter Status | Remaining blockers |
| --- | --- | --- | --- | --- | --- | --- |
| Employees | Generic | Generic | Generic | Generic | Employee adapter supports list, get, create, update, assign owner, export, and configured related commands. | Legacy specialized Employee widgets remain only as replaceable files pending parity approval. |
| Leaves | Generic | Generic | Generic | Blocked | Standard REST adapter supports list/get/create through `/api/leave-requests`. | No generic update/edit endpoint is wired. Submit, Cancel, Approve, and Reject are preserved as disabled business Actions until adapter handlers are added. |
| Attendance | Generic | Backend-limited | Generic create | Backend-limited | Standard adapter lists through `/api/attendance` and creates through `/api/attendance/manual`. | Record read/edit is limited by Attendance's specialized APIs and team/correction flows. Check In, Check Out, and Correction Request remain disabled business Actions until generic handlers are added. |
| Timesheets | Generic | Generic read | Blocked | Blocked | Read route uses existing team timesheet endpoint. | Timesheet create/edit remains specialized around entries and monthly editor APIs. Submit, Approve, and Reject remain disabled business Actions until generic handlers are added. |
| Projects | Generic | Generic | Generic | Generic | Standard REST adapter supports list/get/create/update through `/api/projects`. | Close/Reopen are preserved as disabled business Actions until generic handlers are added. Delete/Assign remain disabled because no standard soft-delete or assign-owner adapter capability is declared. |
| Approvals | Generic | Generic | Not applicable | Not applicable | Standard REST read/list only. | Approve/Reject remain disabled business Actions until generic handlers are added. |
| Customers | Generic | Generic | Generic | Generic | Standard REST adapter supports list/get/create/update through `/api/customers`. | Activate, Deactivate, and Convert remain disabled business Actions until generic handlers are added. Delete/Assign remain disabled because no standard soft-delete or assign-owner adapter capability is declared. |

### Generic Record Route Rules

The migrated record routes use the generic `StandardModuleRecordPage` and `buildStandardRouteRuntime` helpers. Route wrappers only fetch session/record data, resolve active Form metadata from `?form=`, and pass the selected runtime context into the generic page. Module-specific layout, tabs, command bars, and form renderers are not used in these migrated root module routes.

### Business Action Preservation

Existing business actions were not reimplemented as new UI. They are represented as command metadata with clear disabled reasons when no generic `ModuleDataAdapter` handler exists. This preserves the intended action surface without faking success or calling module APIs directly from UI components.

### Soft Delete And Assign

Delete means soft delete only. Standard modules keep single and bulk Delete disabled unless their spec explicitly declares `adapterCapabilities.softDelete`. Assign stays disabled unless the spec declares `adapterCapabilities.assignOwner`. Employee uses its dedicated adapter-backed command definitions for Assign and soft-delete behavior. No hard delete/purge action is exposed on migrated module pages.

### Verification

- Targeted runtime/module lint passed for the touched generic runtime and migrated route files.
- `npm --workspace web run check-types` passed.
- No API files were changed in this migration pass, so API lint/typecheck was not required for this specific pass.

## P1 Owner, Assign, And Status Group Persistence Validation

Validation date: 2026-06-04.

### Runtime Route Trace

The active Employee route path uses generic runtime surfaces:

- `/employees` uses `ModuleListPage` through the thin Employee runtime list wrapper.
- `/employees/new` uses `ModuleRecordPage` in create mode through the thin Employee runtime form wrapper.
- `/employees/:id` uses `ModuleRecordPage` in read mode through the thin Employee runtime form wrapper.
- `/employees/:id/edit` uses `ModuleRecordPage` in edit mode through the thin Employee runtime form wrapper.

Removed from the active path in this pass:

- Employee-specific server diagnostics calls from the Employee route wrappers.

Previously removed legacy Employee UI remains disconnected:

- Employee table/column bridge.
- Employee command bar.
- Employee legacy form body.
- Employee-specific runtime command handler.

Remaining `EmployeeRuntime` references are metadata/config, data adapter, value mapping, or thin wrapper names. `runtimeFeatureFlags` remains as an unused compatibility file only and is not used by the active Employee routes.

### Development Diagnostics

Generic development-only diagnostics now use `debugRuntime(message, data)` and log from the actual rendered path:

- `ModuleRecordPage rendered`: module key, record id, mode, current principal, raw roles, normalized roles, editability result, owner/status/sub-status metadata, current owner/status/sub-status values, and owner option count.
- `Status Group editability`: raw roles, role keys, normalized roles, allowed roles, and final `canEditStatusGroup`.
- `Status Group rendered`: editable state and current values for Owner, Status, and Sub Status.
- `Status Group owner options loaded/error`: adapter-backed owner lookup count and backend errors.
- `Status Group owner selected`: selected owner id.
- `Assign command clicked`: record/selection context and current owner.
- `Assign adapter payload/result`: owner id and record ids flowing through `ModuleRuntimeCommandHandler -> ModuleDataAdapter.assignOwner`.
- `Save payload` and `Save adapter result`: draft values flowing through Save/Save & Close into `ModuleDataAdapter.create/update`.

All diagnostics remain guarded by `process.env.NODE_ENV === "development"`.

### Role Matching Rule

Status Group Owner, Status, and Sub Status are editable only when:

- `mode === "edit"`.
- The current principal has Global Administrator, System Administrator, HR, or HR Manager.

The shared frontend role matcher supports string roles, role objects with `name`, `displayName`, `slug`, `key`, or `id`, nested role arrays, and admin/administrator aliases. The API role matcher now accepts the same normalized Global/System Administrator and HR/HR Manager variants where those role names/keys are present.

### Owner Editability And Picker

Owner editability is generic and lives in `ModuleRecordPage`/Status Group config. The Status Group owner picker now loads eligible owner options through `ModuleDataAdapter.getOwnerOptions` in the rendered Status Group path, merges them with any server-provided lookup options, supports search, preserves the current owner display value, and shows the shared lookup empty state when no eligible owners are returned.

Owner options are not filtered in frontend Employee UI. Backend/adapter eligibility remains the source of truth.

### Assign Action

Assign flow is generic:

`Action Bar Assign -> ModuleRuntimeCommandHandler -> ModuleAssignDialog -> ModuleOwnerPicker -> ModuleDataAdapter.assignOwner -> backend -> refresh`.

The Assign dialog now shows a validation error when no owner is selected. If the adapter is missing, the command remains disabled or returns a clear unsupported message. If the backend rejects, the exact adapter/backend error is surfaced through the runtime command error area and logged by development diagnostics.

Employee Assign persists through `/api/employees/:id/assign-owner` or `/api/employees/assign-owner`, and backend authorization allows Global Admin, System Admin, HR, and HR Manager role variants.

### Status Group Save Flow

Changing Owner, Status, or Sub Status in the Status Group updates the draft record only. It does not save immediately. Save and Save & Close pass the draft values into `ModuleDataAdapter.update`.

For Employee:

- `ownerUserId` persists via the Employee adapter assign-owner call after the update payload is saved.
- `status` and `subStatus` remain system record fields and are sent separately from `employmentStatus`.
- There is no mapping from system Status/Sub Status to Employee Employment Status.

### Employee Code Lock

Employee Code remains locked through metadata and shared renderer logic:

- `autoGenerated: true`
- `lockedByDefault: true`
- Stripped from create/update adapter payloads.

It is locked in create, read, and edit modes. Future unlock behavior must go through customization metadata, not Employee-specific UI.

### Files Changed In P1

- `apps/web/app/components/runtime/module-record-page.tsx`
- `apps/web/app/components/runtime/module-command-bar-status-group.tsx`
- `apps/web/app/components/runtime/module-assign-dialog.tsx`
- `apps/web/app/components/runtime/module-runtime-command-handler.tsx`
- `apps/web/lib/runtime/module-adapter-command-handlers.ts`
- `apps/web/lib/runtime/modules/standard-module-data.adapter.ts`
- `apps/web/lib/runtime/role-runtime.ts`
- `apps/web/lib/runtime/security-runtime.types.ts`
- Employee route wrappers under `/employees`
- `services/api/src/common/security/role-matching.ts`
- `services/api/src/modules/employees/employees.service.ts`

### Verification

- Targeted web lint passed for the touched runtime and Employee route files.
- `npm --workspace web run check-types` passed.
- Targeted API ESLint passed when run from `services/api` against the touched API files.
- `npm --workspace api run check-types` passed.

The API workspace lint script still lints the entire API project regardless of appended file arguments and currently fails on an unrelated pre-existing `agent.service.ts` `no-empty-object-type` issue. The touched API files pass targeted ESLint directly.

## Runtime, Security, And Access Migration Pass

Validation date: 2026-06-04.

### Owner And Assign Root Cause

The generic Owner/Assign path remains adapter-backed only:

`Action Bar/Status Group -> ModuleRuntimeCommandHandler -> ModuleDataAdapter -> module backend`.

Employee is a consumer of that generic flow. Owner values edited in the Status Group remain draft form state until Save or Save & Close. Assign from the Action Bar uses the reusable Assign dialog and owner picker. No Employee-specific owner UI or direct API call was added.

### Customization Security

Customization access is now enforced as a role-plus-permission rule:

- Frontend `/settings/customization/*` routes require the System Customizer role and `customization.read`.
- The settings navigation hides customization entries unless the user has the System Customizer role.
- The API customization controller uses `CustomizationAccessGuard` in addition to the JWT and permission guards.
- Publish endpoints require both the System Customizer role and `customization.publish`; elevated-role bypass alone is not enough for publish.

New customization permission keys were added to both web and API catalogs for Modules, Fields, Forms, Views, Choice Lists, Relationships, Action Bars, Packages, Publish Center, Import Preview, and Export. Existing customization keys remain supported for backward compatibility.

### Access Pages

`/settings/access/permissions` now uses the shared `DataTable` wrapper with searchable/filterable columns for Permission, Module, Type, Scope, Source, Status, and Description. It replaces the previous grouped card-only catalog with a table-first review surface.

`/settings/access/roles` now uses a DataTable-centered role catalog and a focused role editor/details panel. System roles are read-only, custom roles can be created/edited/deleted through the existing `/api/roles` APIs, clone creates a new custom-role draft, and permissions are grouped by module with search. Activate/deactivate remains intentionally not exposed until the role lifecycle policy is finalized.

### Standard Module CRUD

The standard module adapter now supports a reusable `updateApiPath` template so modules with nonstandard update endpoints can still use generic runtime pages without module-specific UI. Attendance uses this for `/api/attendance/{recordId}/override`.

Attendance now has generic read and edit record routes:

- `/attendance/:entryId`
- `/attendance/:entryId/edit`

Remaining module CRUD blockers are unchanged unless a safe backend endpoint exists:

- Leaves: no generic update/edit endpoint verified.
- Timesheets: create/edit remain specialized around entry/monthly editor APIs.
- Approvals: approve/reject are business workflow commands, not generic edit.
- Projects and Customers: generic CRUD is wired where REST endpoints exist; delete and assign remain disabled until soft-delete/assign adapter capability is confirmed.

### Action Bar And Package Integration

System runtime actions remain metadata-driven: New, Edit, Delete, Refresh, Assign, Share, Import, Export, Export Template, Back, Save, and Save & Close. Delete remains soft-delete only and is disabled for standard modules unless the adapter declares soft-delete support. Unsupported business actions remain visible only as disabled metadata commands with clear reasons; they do not fake success.

Customization package foundations remain additive. Runtime consumes published metadata only; draft package metadata stays in Customization and Publish Center.

### Verification Status

- Targeted web ESLint passed for the settings access pages, settings navigation, attendance generic routes, standard module adapter/specs, and security key changes.
- Targeted API ESLint passed for the customization guard/module/controller and RBAC/permission catalogs.
- Full web and API typechecks are required for final acceptance of this pass.

## Package Publisher, Publish State, And Effective Counts Pass

Validation date: 2026-06-05.

### Publisher And Prefix Rules

Default Package rules:

- Publisher is always `DijiPeople`.
- No prefix is required or displayed for Default Package.
- Default Package is system/read-only.
- Default Package components do not need a tenant prefix.

Custom Package rules:

- Publisher is mandatory when creating a Custom Package.
- Prefix is generated from the publisher/company display name.
- Prefix is lowercase and always ends with `_`.
- Multi-word publisher names use first letters: `Maseer Tech -> mt_`, `Diji People -> dp_`.
- Single-word publisher names use the first two letters: `Maseer -> ma_`.
- Extra spaces and symbols are ignored.
- Duplicate prefixes receive a numeric suffix before the underscore: `mt_`, `mt2_`, `mt3_`.
- Prefix is locked once represented by a Custom Package key and custom components are created under that package.

Custom Package keys carry the prefix convention so the current schema does not require new publisher columns. Custom component logical-name generation consumes the package prefix directly:

- Custom module Contact under Maseer Tech: `mt_contact`.
- Custom field Passport Expiry Date under Maseer Tech: `mt_passportExpiryDate`.

### Publish State Rules

Package state is computed from component lifecycle, not only `CustomizationSolution.isActive`:

- Default Package is `Published`.
- Archived/inactive package is `Archived`.
- Custom Package with components and no remaining draft components is `Published`.
- Custom Package with draft components remains `Draft`.

Publishing selected draft components through `POST /customization/publish/components` now:

- validates selected draft components,
- rejects unassigned draft components,
- marks selected components/layers as `published`,
- creates a publish snapshot containing effective metadata,
- returns affected package diagnostics including package ids, component ids, validation result, after state, draft count, and published count.

The Publish Center removes successfully published rows from the Draft table immediately, shows a success message with package state/counts, calls `router.refresh()`, and surfaces backend errors without fake success.

### Module Count Source Rules

Customization module counts come from effective published metadata:

- Default Package/system published metadata.
- Published customization layers.
- Draft counts are excluded from `/settings/customization/tables` because that page represents runtime/effective metadata, not draft package review.

The backend `/customization/tables` response now includes effective counts for:

- Fields.
- Forms.
- Views.
- Choice Lists.
- Relationships.
- Action Bars.

Rows also include source/package/lifecycle context where available. System module rows show `System`, `Default Package`, and `Published`. This prevents modules such as Employees from showing `0` fields/forms/views when effective metadata exists.

### Verification Status

- Targeted web ESLint passed for package list, publish center, table list, metadata components, columns management, and customization types.
- Targeted API ESLint passed for customization service and DTO updates.
- `npm --workspace web run check-types` passed.
- `npm --workspace api run check-types` passed.
- `npx prisma validate` passed.
- Prisma schema was not changed in this pass, so Prisma generate was not required.

## Owner Lookup And Assign Root-Cause Fix

Validation date: 2026-06-05.

The generic runtime now treats Owner as a reference field, not a primitive string:

- Runtime owner is canonicalized as `ownerId`. Employee remains backed by `ownerUserId`, but that name is isolated to the Employee adapter/API mapping.
- `ModuleCommandBarStatusGroup` renders Owner through `ModuleOwnerPicker` in allowed create/edit modes and through a locked `FormControl` display value in read/disallowed modes.
- `resolveOwnerDisplayName` resolves owner labels from the current principal, adapter owner options, lookup display values, or record display fields (`ownerName`, `ownerDisplayName`, `ownerEmail`).
- Normal UI never falls back to a raw GUID for Owner; unresolved owners display as `Unknown owner`.
- `ModuleOwnerPicker` normalizes owner options from `id/value`, `name/label/displayName`, `email`, `subtitle`, and role metadata.
- Owner option load errors stay visible near the picker instead of silently locking the field.

Status Group editability remains generic:

- Owner, Status, and Sub Status are editable only in create/edit mode when the current principal has Global Administrator, System Administrator, HR, or HR Manager role names/aliases.
- Create mode defaults Owner to the current principal id and display name. Status/Sub Status default to the module metadata defaults where the module provides them.
- Read mode and disallowed edit/create mode stay locked.

Employee adapter/backend wiring status:

- Employee runtime still uses generic `ModuleRecordPage`, `ModuleCommandBarStatusGroup`, `ModuleOwnerPicker`, and `ModuleRuntimeCommandHandler`.
- Status Group Save updates `draft.ownerId`; the Employee adapter sends `ownerUserId` to the backend.
- Employee API responses are mapped back to runtime `ownerId` and owner display fields.
- Employee API create/update DTOs accept `ownerUserId`.
- Employee service persists `ownerUserId` to the real Employee owner column and validates owner assignment through the same Global Administrator/System Administrator/HR/HR Manager role gate.
- Assign action still flows through `ModuleRuntimeCommandHandler -> ModuleDataAdapter.assignOwner -> /api/employees/:id/assign-owner` or bulk assign, with development diagnostics for selected owner, adapter payload, backend response, and refreshed UI via router refresh.

No Employee-specific UI was added. Legacy Employee UI files remain intentionally undeleted until runtime parity receives final approval.

### Field-Level Validation Contract

Generic runtime forms now validate before Save/Save & Close:

- `FormControl` supports required markers, disabled/locked state styling, error/warning/help text, touched/dirty-ready props, validation status styling, and invalid state wiring for text, select, lookup, date, checkbox, textarea, number, and multi-select controls.
- `validateRuntimeForm` validates only fields present on the selected form.
- Frontend validation blocks Save/Save & Close before the adapter call when required, min/max length, email, number min/max, or pattern rules fail.
- Locked autogenerated fields such as Employee Code are skipped when a backend/system default is expected.
- Backend validation error payloads are preserved by command execution and mapped to field errors. Employee backend `ownerUserId` maps back to runtime `ownerId`.

### DB-Backed Validation Proof

Direct Prisma DB verification was run on 2026-06-05 and restored the original owner afterward:

- Existing employee tested: `5d3daa53-aff7-40a9-a1ed-82b7a8e5644b` (`DP-1002`, Omar Farooq).
- Old owner id: `3dcc6fc2-2963-4ce8-8e27-f4d614690639`.
- New owner id/name: `77068945-0692-4eef-9e23-0f44e9fc077a` / Taimur Israr.
- DB update proof: owner changed to `77068945-0692-4eef-9e23-0f44e9fc077a` and read-back matched.
- Restore proof: owner changed back to `3dcc6fc2-2963-4ce8-8e27-f4d614690639` and read-back matched.

Browser click-through of Assign and Status Group Save was not run in this environment. The validated persistence path proves the Employee owner column accepts and retains the corrected owner value, and automated lint/typecheck verified the generic runtime and adapter wiring.

## System Settings Recovery Rules

Validation date: 2026-06-05.

- `/settings/system` reads tenant settings as a resolved defaults overlay. Missing optional tenant setting rows are represented by catalog defaults and do not produce a fatal not-found response.
- Dashboard-view options are loaded through `/api/lookups/dashboard-views`. If the dashboard summary cannot be resolved, the lookup returns a safe default option with `source: "default"` instead of forwarding an optional lookup failure.
- Saved dashboard-view ids are verified against the current lookup. A stale id is replaced in the form with the resolved default, shown as a non-blocking repair warning, and left as an unsaved change so the user can persist the repair.
- Optional lookup requests declare inline error handling. The authenticated shell continues to handle authentication failures, but it does not promote those recoverable lookup responses to the global fatal error UI.
- Missing optional settings, stale view ids, unavailable dashboard views, and absent optional branding configuration are recoverable. Authentication failures, authorization failures, invalid explicit record requests, and unexpected server failures remain fatal/global as appropriate.
- Client API error normalization creates an `Error` stack when an API payload does not include one, while preserving the original trace id, status, path, method, details, and server-provided stack when available.

## Runtime Access And Published Metadata Hardening

Validation date: 2026-06-06.

- `GET /tenant-settings/resolved` is authenticated runtime configuration and is no longer gated by settings-administration permissions. Update and category-management endpoints remain permission protected.
- Attendance record authorization resolves the current tenant user's linked Employee before applying self scope. Employees may read their own records only; broader HR, administrator, and manager access continues through existing scope rules.
- Access-denied record surfaces preserve the backend trace reference and expose the sanitized error-log download flow. Ordinary users may download only logs tied to their own user and tenant; support roles retain broader access.
- Main Forms default to three columns. Minimal and Quick Create Forms may use simpler layouts. Section and component spans remain clamped by the shared renderer.
- Published runtime metadata is readable through the authenticated `/runtime-metadata/published` endpoint. It is separate from Customization administration, so published custom Forms can be consumed by runtime users while draft metadata remains excluded.
- Standard Module forms continue to include the generic Timeline widget. Modules without a Timeline adapter show `Timeline is not available yet for this module.` and do not fabricate activity.
- Leave Requests register the generic Leave Approval Tracker widget and adapter-backed Approve/Reject commands. Approval data is filtered by the Leave record id and remains subject to approval scope permissions.
- Attendance registers Status Group metadata and Check In/Check Out Action metadata. Check In/Check Out remain disabled with explicit diagnostics until the shared attendance-mode and browser/work-location capture interaction is connected to the existing backend handlers.
- Default Package synchronization persists runtime-registered Action Bar metadata. Widgets remain runtime-registered because `CustomizationSolutionComponentType` does not yet provide normalized Widget storage; Package diagnostics must continue to state that limitation explicitly.

## Package Explorer And Widget Hardening Pass

Validation date: 2026-06-06.

Package detail now uses a Package -> Module -> Component Type explorer. The
left side owns navigation; the right side renders one overview, component
table, or component detail surface. Component tables reuse the shared
`DataTable`. Package diagnostics expose blocking validation issues, warnings,
unsupported component types, missing handlers, and permission gaps.

Package actions now have backend-enforced boundaries:

- Add Existing supports storage-backed Modules, Fields, Forms, and Views and
  automatically adds the parent Module membership for child components.
- Remove from Package deletes membership only. Removing a Module is blocked
  while child memberships remain.
- Delete Component deletes custom metadata only. System, managed, default,
  published, dependent, and unsupported components are blocked.
- Publish validates and publishes the entire Package. Unassigned drafts,
  validation errors, Default Package, managed Package editing, and empty
  publish sets are rejected.
- Custom Module delete now retires metadata and never purges Module data.

Runtime selectors use UUID identity:

- Forms use `?formId=<uuid>`.
- Views use `?viewId=<uuid>`.
- Logical keys remain internal.
- Unknown ids repair to the published default.
- Draft Forms and Views are excluded from runtime selectors.

Form tabs are normalized to `fields` and `related_module`. Related Module tabs
render only the reusable Related List surface. Widgets are first-class Form
components and can be placed only in field tabs. Timeline is injected once by
default into runtime Forms, remains removable metadata, and renders through
`ModuleWidgetRenderer`. Unsaved Records show the required post-save message;
missing adapters show honest empty diagnostics and never fake activity.
Reporting Hierarchy uses the same Widget contract and is constrained to the
Employee Module.

Generic Document metadata contracts now separate the Document Module from a
parent Module's optional Document Profile. Relationship availability does not
automatically add a Documents tab; Form metadata controls tab placement.

Leave create runtime loads policy-aware active Leave Types from
`/leave-requests/available-types`. Attendance create runtime loads allowed
attendance modes from resolved tenant settings. Missing or invalid settings
produce visible non-fatal diagnostics rather than hardcoded option fallbacks.

### Package And Runtime Hardening Review

Validation date: 2026-06-06.

The review corrected the following runtime and Package behaviors:

- Missing or unknown `formId` and `viewId` values now repair the URL to the
  published default UUID. Legacy `form` and `view` keys are removed.
- Package publish snapshots retain the effective top-level Forms and Views
  shape consumed by runtime selectors. Older nested effective-metadata
  snapshots are normalized when read.
- Package validation blocks child components whose parent Module membership is
  missing.
- Delete Component dependency checks now inspect persisted package metadata
  references for Fields, Forms, and Views. Package detail surfaces those
  dependency reasons before Delete is attempted.
- Related Module tabs never render Field sections or Widgets. Missing
  Relationship/Related List metadata produces an explicit disabled state.
- Runtime rendering permits at most one Timeline and one Reporting Hierarchy
  placement per Form while continuing to allow multiple custom Widget
  instances.
- Timeline adapter refresh clears stale errors after a successful load.

Intentional backend gaps remain:

- Widgets, Timeline Templates, Document Metadata, Actions, Rules, Automations,
  Guided Processes, and Related Lists do not yet have normalized package
  storage. Their Package explorer nodes remain diagnostic-only and do not
  create fake records.
- The Form Designer does not yet provide Widget add/remove/move controls.
  Runtime metadata supports placement, span, height, and configuration, but
  designer persistence for those operations is pending.
- No Module adapter currently implements Timeline or Reporting Hierarchy data
  loading. The generic renderer therefore shows explicit adapter-missing or
  unsaved-record states.
- Document Profile contracts exist, but Employee and Leave document profiles
  and relationship-backed Form tabs are not configured yet.
- Package publish returns metadata and Package invalidation keys and refreshes
  the active route. A shared distributed metadata-cache invalidator is not yet
  registered.
- Dependency checks cover persisted Forms, Views, package metadata JSON, and
  published runtime membership. Future normalized security, import/export
  mapping, and Widget stores must register their dependency edges before their
  delete actions are enabled.

## Widget Runtime Go-Live Readiness

Validation date: 2026-06-10.

- Leaves, Attendance, Timesheets, and Projects now expose generic Timeline
  adapter paths backed by authorized record reads followed by audit timeline
  lookup. Entries include action label/type, actor, timestamp, and linked
  Record reference, newest first. Missing history renders the shared honest
  empty state.
- System Widgets are normalized `widget` Package components. The Default
  Package synchronizes supported Widgets from the shared registry; Add
  Existing creates draft customization layers; runtime resolves published
  layers only.
- Form Designer Widget placement is capability-filtered. Employees support
  Timeline and Reporting Hierarchy; Leaves and Timesheets support Timeline and
  Approval Tracker; Attendance and Projects support Timeline. Custom Widget
  execution remains disabled and visible only as a future capability.
- Published metadata reads are `no-store`. Publish writes a versioned snapshot
  and emits tenant, Package, Module, component-type, and
  `metadata:<tenant>:type:widget` invalidation keys for future cache consumers.
- Project reads now enforce effective RBAC scope for list, Record, and Timeline
  access. Employee Self Service can read only Projects it created or is
  actively assigned to; inaccessible Projects resolve as not found.
- Browser UAT passed for Global Administrator, System Administrator, HR, and
  Employee Self Service across Employees, Leaves, Attendance, Timesheets, and
  Projects. The matrix verifies supported Widget rendering, real empty states,
  role/scope denial, self-service restrictions, and draft isolation.
- Local evidence lives under ignored `uat-runtime-tests/`. The final decision
  is GO.

## System Widget Registry Hardening

Validation date: 2026-06-10.

System Widget availability now resolves through the shared
`@repo/config` registry instead of renderer-local Module checks. Timeline,
Reporting Hierarchy, and Approval Tracker declare stable keys, aliases,
supported Module capabilities, supported Form component types, required
adapter methods, permissions, saved-Record behavior, empty states, and
missing-adapter diagnostics.

Runtime evaluates published placement, Module capability, permission, role,
saved Record state, and adapter readiness before invoking a Widget renderer.
Draft placements are excluded by the shared Form Renderer. Unsupported
Modules, missing adapters, unsaved Records, and Custom Widgets render explicit
non-fabricated states.

Current real data wiring:

- Employee Timeline maps the existing Employee History endpoint.
- Employee Reporting Hierarchy maps the existing reporting-structure endpoint,
  now protected by `hierarchy.read`.
- Leave Approval Tracker maps the existing scoped Approvals endpoint.
- Timesheet Approval Tracker maps the existing Timesheet review state through
  a reusable approval-record response adapter.

Leaves, Attendance, Timesheets, and Projects now use authorized audit-backed
Timeline adapters. They return newest-first entries with action label, actor,
timestamp, action type, and linked Record context where available. Records
without audit activity render the shared valid empty state; missing Records or
insufficient scope are rejected before audit lookup.

Attendance and Projects do not declare approval tracking. Custom Widget
execution remains disabled until an authorized plugin/code-activity runtime is
available.

## Generic Package Runtime Hardening

Validation date: 2026-06-10.

- Effective runtime metadata is resolved from published Package layers only.
  Draft layers remain isolated until publish.
- Layer resolution follows base component identity, applies ordered overrides,
  deep-merges metadata objects, preserves references, and honors remove layers.
- Default Package system components are synchronized as published base
  metadata. Custom component creation is assigned to a Custom Package or the
  Unassigned Draft Customizations holding Package and includes parent Module
  membership.
- Editing an effective/system Field, Form, or View now requires an existing
  draft `modify` layer created through Add Existing in the selected Custom
  Package. Update endpoints no longer create that customization layer
  implicitly.
- Publish validates metadata references against selected draft and currently
  published components. Missing Field, Relationship, Related List, Widget, or
  Rule references block publish with component-specific errors.
- Publish returns tenant, snapshot-version, Package, component-type, and Module
  invalidation keys so runtime metadata clients can discard stale selector and
  renderer state.
- Shared Widget rendering no longer branches on Module names. Widget data
  sources are declared by Module metadata/specification and executed through
  the generic Module data adapter.
- Generic automated tests cover Field, Form, View, Rule, and Widget lifecycle;
  draft isolation; Add Existing protection; effective override resolution;
  dependency validation; cache invalidation keys; URL ID safety; and shared
  runtime purity.

Remaining normalized-storage limitation:

- Rules, Related Lists, and other component types not represented by
  `CustomizationSolutionComponentType` can be resolved and validated by the
  generic layer engine when present in metadata, but full CRUD/package explorer
  persistence for those types still requires schema-backed component stores.

## Widget Runtime Go-Live Validation

Validation date: 2026-06-11.

- System Widgets are storage-backed Package components. Add Existing creates a
  draft customization layer, Default Package placements are read-only, draft
  placements stay out of runtime, and published placements render.
- Publish returns Widget-specific metadata invalidation keys. Runtime published
  metadata reads remain uncached and draft-isolated.
- Form Designer and Package Explorer expose only System Widgets supported by
  the selected Module capability. Timeline is supported across Employees,
  Leaves, Attendance, Timesheets, and Projects; Reporting Hierarchy is
  Employee-only; Approval Tracker is supported by Leaves and Timesheets.
- Registry and Widget contract tests passed: 15.
- Targeted Package, audit, RBAC, timeline, Employee access, and inbox tests
  passed: 46.
- Browser UAT passed for Global Administrator, System Administrator, HR, and
  Employee Self Service across the five target Modules. An additional manager
  scenario confirmed direct-report read scope, no Edit/Assign leakage,
  notification deep-link access, and own-profile access.
- API and web typechecks passed. Targeted ESLint completed with zero errors.
  `git diff --check` passed.
- Release decision: GO WITH ACCEPTED RISKS. Custom Widget execution remains
  intentionally disabled; legacy warning-only typing and image optimization
  debt is non-blocking.
