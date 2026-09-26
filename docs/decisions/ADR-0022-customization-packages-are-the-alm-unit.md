---
ID: ADR-0022
aliases: [ADR-0022]
Title: Customization packages are the ALM unit — built on the existing package layer, separate from ApplicationRelease
Status: ACCEPTED
CreatedAt: 2026-09-26
UpdatedAt: 2026-09-26
---
# ADR-0022 — Customization packages are the ALM unit

## Status

Accepted — 2026-09-26. The plan (EXECPLAN-0052) was approved by the product
owner, with three decisions (D-1 to D-3) recorded there. Related: [[TASK-0033]].

## Context

The product needed customizations to move between environments (DEV → UAT →
PROD) the way Dynamics 365 solutions do: versioned, dependency-aware, portable,
and safe to import.

DijiPeople already had most of the static half:
- `CustomizationSolution` (shown as "Package") and `CustomizationSolutionComponent`;
- `reference` / `modify` / `remove` overlay layers merged at runtime;
- a per-tenant system package, and a default tenant package.

Owner decision D3 (2026-09-13) kept that model.

What was missing was the lifecycle half:
- stored publishers;
- immutable versions;
- package dependencies;
- a portable artifact;
- import that can apply;
- deployment history;
- upgrade, downgrade and uninstall;
- environment-specific values.

Two existing things looked reusable and are not:

- **`ApplicationRelease`** is the catalogue of downloadable client binaries:
  - It covers the desktop agent, the gateway and the ZKTeco diagnostic.
  - It has platform, architecture, channel, storage key and electron-updater
    checksums.
  - It is global, not tenant-owned.
- **An environment** in DijiPeople is a tenant workspace, whose type comes from
  `Tenant.environmentType`. There is no separate environment entity to attach
  packages to.

## Decision

1. **A package is `CustomizationSolution`.** It gains a version, a stored
   publisher, an origin (LOCAL or IMPORTED) and an installed version. It also
   gains `isTenantDefault`, which names Default Customizations. Kind is derived
   from these fields and never stored:
   - `system` is DijiPeople Core, the per-tenant default solution;
   - `editable` is a package authored here;
   - `installed` is a package imported here; it is read-only until detached.

2. **Package versions do not reuse `ApplicationRelease`.**
   `CustomizationPackageVersion` stores each released version immutably, as the
   canonical artifact plus its sha256. The two concepts meet only in
   documentation.

3. **The portable identity is `<componentType>:<objectKey>`.** Database, tenant
   and user ids never leave an environment.

4. **Artifact format 1 is one canonical JSON document (`.djpkg`), not a ZIP.**
   - Keys are sorted.
   - Components are ordered by dependency.
   - Checksums are kept per component and for the whole document.
   - No component carries binary assets, so an archive would add only a
     dependency and the zip-bomb and path-traversal surface.
   - `formatVersion` 2 may wrap it in a ZIP when custom widgets need assets.
   - The importer refuses any format version it does not know.

5. **A checksum is integrity, not trust.** `manifest.signature` is reserved and
   always null, and format 1 refuses a signed artifact. The UI says "Integrity
   verified" and "Not signed".

6. **Import is analyze → persisted plan → execute in one database
   transaction.** All metadata lives in one PostgreSQL database, so a real
   transaction gives atomic rollback. No compensation journal is needed.
   Execute re-verifies the checksum and refuses a plan made stale by workspace
   changes.

7. **An import never overwrites what it does not own.**
   - Creating a component that DijiPeople Core or another package owns is a
     conflict. A package extends Core only through layers.
   - A change that would destroy stored data (a field's type, a lookup's
     target) is a conflict even in the package's own upgrade.
   - Components removed from the source are reported and never deleted.

8. **A downgrade is blocked unless explicitly overridden.** The override is
   audited. Re-importing the same version changes nothing.

9. **Environment variables separate definition from value.** The definition
   travels with the package. The value lives per workspace, encrypted when it
   is a secret, and is never exported. Connection references are deferred
   (D-2, [[ITEM-0216]]).

10. **Installed layers sit at `layerOrder` 250.** That is above Core (100) and
    module references (200), and below this workspace's own unmanaged layers
    (300). A local customization therefore still wins over an installed package.

## Reasons

- Owner decision D3 kept the package model. Extending it avoids a second
  customization system, which AGENTS.md principle 2 forbids.
- A deterministic artifact makes a package reviewable in Git and diffable
  between versions.
- A single transaction is the strongest rollback available, and needs the least
  code to trust.

## Alternatives Considered

- **A new `packages` API module and tables beside customization.** Rejected: it
  would duplicate the component, layer and publish model and fork the source of
  truth.
- **Extending `ApplicationRelease` with a package kind.** Rejected: it would mix
  global binary distribution with tenant metadata, and burden every consumer of
  the binary catalogue.
- **A ZIP artifact now.** Rejected until there are assets to carry.
- **A compensating-operation journal.** Rejected: the database transaction
  already gives what a journal only approximates.

## Consequences

- Release validation replaces the old export-readiness check. That check could
  never fire ([[BUG-3703]]).
- Adding a field no longer demotes a package's own module ([[BUG-3702]]).
- The same reader decides export dependencies and delete safety
  ([[BUG-3699]]).
- A custom field on a system module travels as a definition only, because its
  values have no storage ([[BUG-3697]], D-1).

## Migration / Compatibility Impact

The migration `20260926120000_customization_package_alm` is additive. Its
backfill is idempotent:
- the Core package is renamed "DijiPeople Core";
- the earliest `_tenantCustomizations` package is flagged as Default
  Customizations;
- publishers are recovered from the derived key prefixes.

Existing package keys, component rows and publish snapshots are untouched. The
old `GET packages/:id/export` (working-copy JSON) and the import preview remain
for existing callers.

## Security / Tenant Impact

- Every new model is tenant-owned, and every query is scoped by
  `request.user.tenantId`.
- Operations are loaded by `{ id, tenantId }`.
- The artifact carries no tenant, id or user field.
- Uploads are limited to 5 MB. The parser also enforces depth, count and string
  limits, rejects prototype keys, refuses credential-like keys, and validates
  definition values before anything is compared.
- The new permission keys are `customization.packages.release`, `.import` and
  `.uninstall`. They sit in both permission systems and are granted like
  `customization.packages.manage`.

## Agent Rules

- Do not add package, version or release infrastructure outside
  `services/api/src/modules/customization`.
- Do not reuse `ApplicationRelease` for customization metadata.
- Never write a database id, tenant id or user id into an artifact component.
  Portable identity is the logical key.
- Any new customization component type must be added in four places:
  - `PORTABLE_COMPONENT_TYPES`;
  - `DEFINITION_ENUMS`, when it has enum fields;
  - the portable reader;
  - `applyBaseObject`.

  It must round-trip in `services/api/test/customization-package-alm.e2e-spec.ts`.
- An import must stay one transaction. If it outgrows the timeout, move
  execution to the in-process worker (ADR-0004). Do not split it into partial
  commits.

## Related Modules

customization, tenant-control-plane (erasure order), super-admin (provisioning
creates Default Customizations).

## Related Features

Packages, Publish Center, the import wizard, environment variables. Follow-ups:
[[ITEM-0216]], [[ITEM-0217]], [[ITEM-0218]], [[ITEM-0219]], [[ITEM-0220]].
