# Customization Packages and ALM

> **Last verified:** 2026-09-26 against `agent/packages-alm` (TASK-0033).
> Decision record: ADR-0022. Plan: EXECPLAN-0052. Links: [[TASK-0033]].

A **package** groups customization metadata into one unit. You can release it
as a version, export it as a file, and install it in another environment. An
**environment** in DijiPeople is a tenant workspace, typed DEVELOPMENT, UAT,
SANDBOX or PRODUCTION by `Tenant.environmentType`. So "DEV → UAT → PROD" means:

1. Export from one workspace.
2. Import into the next.

All of it lives in `services/api/src/modules/customization`. It sits on the
existing package, layer and publish model; it does not replace it.

```
Platform module registry / Prisma DMMF  →  DijiPeople Core (system package, per tenant)
Custom modules, fields, forms, views, choice lists, relationships, action bars, widgets
        ↓  membership + overlay layers (reference / modify / remove / create)
Packages  →  released versions (immutable)  →  .djpkg artifact
        ↓
Import: analyze → plan → execute (one transaction) → publish snapshot
```

## Kinds of package

Kind is derived from flags and never stored (`package-kind.ts`).

| Kind | What it is | Where it can change |
|---|---|---|
| `system` | **DijiPeople Core** — the out-of-the-box modules, fields, forms, views and widgets, materialised per tenant by the default-solution sync. Its version is the metadata schema version (`CUSTOMIZATION_METADATA_SCHEMA_VERSION`). | Nowhere. It cannot be edited, released, exported, deleted or uninstalled. |
| `editable` | A package authored in this workspace, including **Default Customizations** (`isTenantDefault`). A draft created without a chosen package lands there. | Here: edit, release, export, delete. |
| `installed` | Imported from another environment (`origin = IMPORTED`, `isManaged`). | Nowhere, unless it is detached. Every edit path refuses changes to a component it created (`assertNotInstalledComponent`). |

Default Customizations is created at provisioning, in the `customization-defaults`
step. For an older workspace it is created the first time the Packages list is
opened. Customizing Core never moves Core's ownership: a package *references* the
Employees module and *adds* its own field, or *modifies* a Core form through a layer.

## Identity and ownership

- **Portable identity** is `<componentType>:<objectKey>`, for example
  `column:misAsset.mis_grade`. Artifacts never carry database, tenant or user ids.
- **Ownership:** the package holding a `create` layer for a component owns it.
  A `reference` layer depends on a component without owning it. A `modify` or
  `remove` layer extends a component the package does not own.
- **Publishers** (`CustomizationPublisher`) are stored per tenant, with a
  unique prefix of 2–8 characters. Fields a publisher creates must carry the
  prefix (`mis_grade`). The prefixes `dp`, `dijipeople`, `sys` and `system` are
  reserved. Core components keep their historical unprefixed names.

## Component types in format 1

`PORTABLE_COMPONENT_TYPES` in `package-artifact.ts`:

- `environmentVariable`
- `table`
- `column`
- `optionSet`
- `lookup`
- `form`
- `view`
- `widget`
- `actionBar`

These do not travel yet ([[ITEM-0218]]):

- module views
- navigation overrides
- workflows
- report definitions
- templates

Custom code, custom widgets and plugins are not component types. The format
version is the extension point for them, and nothing in a package is ever
executed.

## Dependency engine

The dependency engine has one reader: `package-portable.reader.ts`. It decides
**export dependencies, the target comparison, "Show Dependencies" and delete
safety**, so these can never disagree.

It sees these dependencies:

- a component's parent module;
- a lookup's target module;
- fields named in form layouts, view columns and filters;
- relationship reference fields, action bars and layer metadata (through the
  existing `readMetadataDependencies` scanner).

Two kinds of cycle are treated differently:

- **Component cycles** are allowed. Two modules looking each other up is a
  legitimate schema, so ordering breaks the cycle deterministically.
- **Package dependency cycles** are refused. `findPackageDependencyCycle` names
  the loop.

## Release and validation

`GET packages/:id/release-readiness` returns ERROR, WARNING and INFO issues. It
covers:

- installed or system package
- missing publisher
- reserved or invalid prefix
- prefix mismatch
- empty package
- drafts that will publish
- missing components
- components owned by an undeclared package, with an *Add dependency* remedy
- components in no package, with an *Add to package* remedy
- declared dependencies absent or out of range
- required environment variables
- a version not higher than the last release

ERROR blocks release.

`POST packages/:id/release` then does four things:

1. Publishes the package's drafts through the existing path.
2. Serialises the artifact.
3. Stores `CustomizationPackageVersion`, which is immutable.
4. Bumps the working version.

A released version cannot be re-released.

## The artifact (`.djpkg`)

The artifact is a single canonical JSON document:

```
{ formatVersion: 1,
  manifest: { packageKey, displayName, version, publisher{publisherKey,displayName,prefix},
              metadataSchemaVersion, sourceEnvironmentType, dependencies[], coreDependencies[],
              componentCount, signature: null },
  components: [ { key, type, objectKey, parentKey, layerAction, baseIsSystem,
                  definition, layer, dependsOn[], checksum } ],
  contentChecksum }
```

- **Deterministic.** Keys are sorted, components are in dependency order, and
  there are no timestamps inside components. Exporting the same version twice
  gives identical bytes. `GET packages/:id/versions/:version/artifact` streams
  the stored version; `latest` means the newest.
- **No secrets.** Credential-looking keys fail the export. Environment variable
  values are never included, and a secret's default is never included.
- **Integrity only.** A checksum proves the file is intact, not who published
  it. Signing is [[ITEM-0220]].

## Import

Import has two steps, and the plan between them is persisted as a
`CustomizationPackageOperation`.

1. **Analyze** — `POST package-imports/analyze`, multipart, 5 MB. It checks, in
   order:
   1. size, depth, string length and prototype keys
   2. format version
   3. per-component and whole-package checksums
   4. manifest and identifier rules
   5. the values inside each definition
   6. platform metadata-schema compatibility
   7. package dependencies against what is installed here
   8. publisher and prefix collisions
   9. per-component comparison
   10. mode: INSTALL, UPGRADE, REINSTALL or DOWNGRADE
   11. required environment values

   Nothing changes here. The result is READY or BLOCKED.

2. **Execute** — `POST package-imports/:id/execute`:
   1. Re-verifies the stored artifact.
   2. Re-plans and refuses a stale plan.
   3. Applies everything in **one transaction**, in dependency order.
   4. Writes the publish snapshot in the same transaction.
   5. Records the result.

   Any failure rolls back everything. The operation becomes FAILED and names
   the component that failed.

Comparison statuses (`package-comparison.ts`):

| Status | Meaning | Applied? |
|---|---|---|
| NEW | Not here | created |
| MATCHING | Identical | no-op |
| UPDATE | The package owns it here; content changed | updated |
| TARGET_MODIFIED | Changed here after it was installed; the package wins | updated, warned |
| CONFLICT | Owned by Core or another package, or a destructive change (field type, lookup target) | blocks |
| MISSING_DEPENDENCY | Needs something neither shipped nor present | blocks |
| INCOMPATIBLE | Extends a Core component this platform lacks | blocks |
| SKIPPED | Removes something already absent | no-op |

A component removed from the source is **reported and kept**. A **downgrade**
is blocked unless `allowDowngrade` is set, and that override is audited.
Importing the same version again gives zero changes.

Installed layers use `layerOrder` 250. That puts them above Core (100) and
module references (200), and below this workspace's own unmanaged layers (300).

## Uninstall, detach and delete

These are four different actions:

- **Remove from package** unlinks a component from the package; the metadata
  stays.
- **Delete component** deletes a custom component. It is refused while any
  layer in any package still names the component.
- **Delete package** deletes an editable package. It is refused while the
  package has published components.
- **Uninstall** applies to installed packages only. It is refused, with the
  path shown, when any of these hold:
  - another package depends on it (for example "MIS Payroll → depends on → MIS
    Customizations");
  - another package layers on its components;
  - its modules hold records.

  Uninstall removes only the components the package created. Records are never
  deleted.
- **Detach** turns an installed package into an editable one and keeps
  everything. It is the way out when uninstall is refused because of data.

## Environment variables

- `CustomizationEnvironmentVariable` is the definition. It is a package
  component, and its types are text, number, boolean, url and secret.
- `CustomizationEnvironmentVariableValue` is this workspace's value. Secrets
  are encrypted with `SecretEncryptionService`.
- A required variable with no value here blocks import until the wizard
  supplies one.
- Server code reads a value with `PackageAlmService.resolveEnvironmentValue`. No
  endpoint returns a secret.
- Connection references are [[ITEM-0216]].

## Permissions

| Key | Allows |
|---|---|
| `customization.read` | Viewing packages, lifecycle, versions, deployments, dependencies and variables |
| `customization.packages.manage` | Creating packages and publishers; editing dependencies; environment variables |
| `customization.packages.release` | Release |
| `customization.export` | Downloading a version |
| `customization.packages.import` | Analyze and execute imports; the Import Package page |
| `customization.packages.uninstall` | Uninstall and detach |

- Every route carries both `@Permissions` and
  `@RequirePermission(ENTITY_KEYS.CUSTOMIZATION, …)`.
- `CustomizationAccessGuard` requires the key even of elevated roles
  (ADR-0013).
- The web page map (`customization-page-permissions.json`) is checked against
  both controllers by `customization-web-gate.seam.spec.ts`.

## Tenant isolation

- Every model is tenant-owned, and every query is scoped by the caller's
  `tenantId`.
- Operations and variables are loaded by `{ id, tenantId }`.
- The artifact contains no tenant data.
- The DB-backed suite includes cross-tenant read, export, execute, uninstall
  and list attempts.

## Screens

Settings → Customization → Packages:

- **List.** Shows type (System, Editable, Installed), version, installed
  version, Import Package, and export of the latest release.
- **Package detail.** Has these tabs:
  - Components
  - Validation (editable packages only)
  - Dependencies
  - Versions
  - Deployments
  - Environment

  It also has Release, Export, Uninstall and Detach, and Show Dependencies on a
  component.
- **Import Package.** Upload → Review → Result, with recent deployments.

## ALM workflow

1. Customize in the DEV workspace, in a named package or in Default
   Customizations.
2. Declare package dependencies, then Validate. Fix errors.
3. Release a version and export the `.djpkg`. Commit it to Git if you want to
   review diffs.
4. Import into UAT: review the plan, enter the UAT values, then import.
5. Test in UAT.
6. Import the same file into PROD.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "is authored in this workspace" | You imported into the environment that owns the package. Import it elsewhere. |
| CONFLICT "belongs to …" | A component with the same logical name exists here in another package. Remove it there, or rename it at the source. |
| "Changing a field's type would be destructive" | Target data would be lost. Create a new field instead. |
| "This workspace changed since the package was analyzed" | Analyze again. The plan must match what executes. |
| Import FAILED, rolled back | A database constraint refused a component, for example two primary-name fields. The failed component is named, and nothing changed. |
| Field travels but holds no values on Employees | [[BUG-3697]] — system-module field values have no storage yet. |

## Tests

- `services/api/src/modules/customization/package-artifact.spec.ts`
- `services/api/src/modules/customization/package-comparison.spec.ts`
- `services/api/test/customization-package-alm.e2e-spec.ts` — a DB-backed round
  trip, mutation-checked, covering scenario QA-SETTINGS-033.

## Future

- Signing: [[ITEM-0220]]
- CLI and CI promotion: [[ITEM-0219]]
- Platform admin view: [[ITEM-0217]]
- More component types: [[ITEM-0218]]
- Custom widgets and extensions: a later format version with assets and a
  sandbox. Packages never execute uploaded code.
