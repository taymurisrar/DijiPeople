---
ID: ADR-0016
aliases: [ADR-0016]
Title: A published custom module renders in the tenant runtime with a sidebar entry and standard list, form and record screens
Status: ACCEPTED
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
---
# ADR-0016 — A published custom module renders in the tenant runtime with a sidebar entry and standard list, form and record screens

## Status

Accepted — 2026-09-13, by the product owner during the second demo walkthrough.
Tracked as [[BUG-3494]].

## Context

Settings → Customization lets a tenant administrator create a module, add
fields, design its form and views, and publish. On the live demo tenant a module
"QA Asset" was created, given a field, a form layout and a view, and published
(snapshot version 1). Afterwards it appeared nowhere: the main navigation was
unchanged, the Sidebar Designer did not list it, and no `apps/web` route renders
records of a custom table. Records for custom tables are stored through the
generic data API (`services/api/src/modules/data/`), which nothing in the tenant
product calls for them.

The owner was asked whether published custom modules are in scope for the
customization fixes, a separate later feature, or should be removed.

## Decision

**Publishing a custom module makes it usable by end users**, as part of the P1
customization fixes:

- a sidebar entry (governed by the existing Sidebar Designer, visible to users
  with the module's read permission);
- a list screen rendered from its published views;
- create/edit and record screens rendered from its published forms;
- records persisted through the existing generic data API, tenant-scoped.

The screens reuse the standard runtime pages and components
(`StandardModuleListPage`, `StandardModuleRecordPage`, the metadata form
renderer) rather than a parallel implementation.

## Reasons

- Without a runtime, "create module" is a feature with no outcome.
- The metadata runtime, published snapshot and generic data API already exist;
  the missing piece is wiring, not a new architecture.

## Alternatives Considered

- **A separate, later feature.** Rejected by the owner.
- **Remove custom-module creation.** Rejected by the owner.

## Consequences

- Needs an ExecPlan under `PLANS.md` (new tenant-product surface, cross-module).
- Custom modules need permission keys or a generic per-module permission rule;
  the ExecPlan must choose one that fits the two permission systems.
- Unpublished drafts never appear at runtime.

## Migration / Compatibility Impact

Existing published custom modules (the demo tenant's "QA Asset") become visible
on deploy. No schema change is expected; if the data API needs an index for
list queries, it is added in the same change.

## Security / Tenant Impact

Every read and write goes through the generic data API with `tenantId` from
`request.user`; the ExecPlan must show where object-level scope
(`buildScopedAccessWhere()`) applies. A custom module is never visible across
tenants.

## Agent Rules

- Do not build a bespoke page per custom module; render from published metadata.
- Do not read draft (unpublished) metadata at runtime.
- A custom module's screens must be permission-gated server-side, not only in
  the sidebar.

## Related Modules

`customization`, `data`, `navigation`, `views`, `apps/web` runtime.

## Related Features

Settings → Customization → Modules; tenant sidebar.

## Related

- [[BUG-3494]] — the defect this resolves.
- [[BUG-3493]] — publishing, which must work first.
