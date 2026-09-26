# Customization

> Generated from repository evidence at `b55afdb2` (TASK-0033). The full
> architecture is in `docs/architecture/customization-packages.md`; the decision
> is ADR-0022. Links: [[TASK-0033]].

## Purpose

Customization lets a tenant change its product without code: custom modules,
fields, forms, views, choice lists, relationships, action bars and widgets.
**Packages** group those changes so they can be released, exported and
installed in another environment (DEV → UAT → PROD workspaces).

## Main API / services

- `customization.service.ts` handles components, overlay layers, publish, and
  the three package kinds (DijiPeople Core, editable, installed).
- `package-alm.service.ts` handles publishers, release, versions, export,
  staged import, uninstall, detach, the dependency graph and environment
  variables.
- The pure engines are `package-artifact.ts` (canonical artifact, checksums,
  semver, hostile-input parser) and `package-comparison.ts` (import statuses).
- `package-portable.reader.ts` is the single reader that decides export
  dependencies, target comparison, Show Dependencies and delete safety.

## Important business rules

Each is verified by `services/api/test/customization-package-alm.e2e-spec.ts`:

- **An import never overwrites what it does not own.** Creating a Core component
  or another package's component is a CONFLICT. A field type change or a lookup
  target change is a CONFLICT, even within a package's own upgrade.
- **Import is one transaction.** Any failure rolls back everything and names
  the failing component.
- **Re-importing a version changes nothing. Downgrades are blocked** unless
  overridden, and the override is audited.
- **Removed-from-source components are kept.** They are reported, never
  deleted.
- **Environment variable values never leave an environment.** Secrets are
  encrypted.
- **Adding a field never changes how a package holds its module**
  ([[BUG-3702]]).
- **A component another package's layer names cannot be deleted**
  ([[BUG-3699]]).

## Known gaps

- Custom fields on system modules have no value storage ([[BUG-3697]]).
- Draft field edits apply before publish ([[BUG-3698]]).
- Module views, navigation, workflows and reports are not portable yet
  ([[ITEM-0218]]).
- Connection references are [[ITEM-0216]]; signing is [[ITEM-0220]].

## Testing

- Unit tests: `package-artifact.spec.ts` and `package-comparison.spec.ts`,
  mutation-checked.
- DB-backed round trip: 19 cases, scenario QA-SETTINGS-033.
- Browser pass: recorded in the QA run for TASK-0033.
