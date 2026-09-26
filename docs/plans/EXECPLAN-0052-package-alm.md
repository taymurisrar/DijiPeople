CONTEXT_FILES_REQUIRED:
  - AGENTS.md, services/api/AGENTS.md, services/api/prisma/AGENTS.md, apps/web/AGENTS.md
  - .agent/context/runtime-module-system.md
  - .agent/context/auth-rbac.md, .agent/context/tenant-context.md, .agent/context/audit-events.md
  - docs/architecture/module-runtime-overhaul.md (Package terminology :66, Solution Layer :393-395)
  - docs/decisions/ADR-0013-customization-access-is-granted-by-permission.md (binding)
  - docs/plans/EXECPLAN-0045-customization-end-to-end-for-permission-holders.md (owner decision D3)

SPECIALIST_AGENTS_REQUIRED:
  - database        — single writer of schema.prisma + migration + backfill (WP-01)
  - backend-api     — release/export/import/uninstall engines (WP-02..WP-05)
  - frontend        — Packages screens, import wizard (WP-06)
  - security        — RBAC keys, tenant isolation, untrusted-artifact handling (review of WP-02..05)
  - qa              — DB-backed round trip across two tenants, negative suite, browser pass (WP-07)
  - reviewer, integrator, knowledge & graph
DELIBERATELY_NOT_USED:
  - integration     — no external system; connection references deferred (D-2)
  - release/devops  — develop only; NO production deployment (spec §76)

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma, services/api/prisma/migrations/**   (WP-01 only)
  - services/api/src/common/constants/permissions.ts, rbac-matrix.ts       (WP-02 only)
  - apps/web/lib/security-keys.ts                                          (WP-06 only)
  - app.module.ts NOT touched: no new API module (extends `customization`)

QA_REQUIRED: yes  (SECURITY, TENANT, DATABASE, STATE_MACHINE, UI)

TARGET_BRANCH:            develop   (MAIN_CHANGE_STATUS must stay UNTOUCHED)
TARGET_ENVIRONMENT:       LOCAL (throwaway Postgres DB, two tenants = DEV and UAT)
DEPLOYMENT_REQUIRED:      no — production release is a separate owner-triggered RELEASE task
ROLLBACK_CLASS:           DATABASE_ADDITIVE (+ DATA_MIGRATION: idempotent backfill)
INTEGRATOR_REQUIRED:      yes
MERGE_STRATEGY:           merge --no-ff via ref-push after exact-SHA CI gate

# EXECPLAN-0052 — Package ALM: versions, portable artifact, staged import, upgrade, uninstall

## Owner decisions (2026-09-26, recorded at plan approval)

- Plan approved as written, target `develop`, no production deployment.
- D-1: custom-field value storage on system modules is a separate planned task (B1 filed HIGH); packages carry field definitions.
- D-2: connection references deferred to a backlog item until an integration consumes one.
- D-3: super-admin cross-tenant package view deferred to a backlog item.

## Objective

Complete DijiPeople's existing customization Package layer into a working ALM
foundation. A tenant can release an immutable package version, export it as a
deterministic, checksummed artifact with no secrets, and import it into another
workspace (DEV → UAT → PROD are separate tenant workspaces). The import is
analyzed, compared, conflict-checked and planned, applied atomically, and
recorded in deployment history. It supports upgrade detection, downgrade
blocking, idempotent re-import, and dependency-safe uninstall. Nothing already
built is duplicated.

## Existing architecture (FACT) — what is reused, not rebuilt

| Spec concept | Already exists | Evidence |
|---|---|---|
| Package | `CustomizationSolution` (UI name "Package") | schema.prisma:11376; module-runtime-overhaul.md:66 |
| Package membership / component | `CustomizationSolutionComponent` (type, objectId, objectKey, layerAction, lifecycleState, layerOrder, version, checksum, metadataJson) | schema.prisma:11400 |
| Customizing Core without owning it (§16-17) | overlay layers `reference`/`modify`/`remove` + `baseComponentId`, merged by `resolveEffectivePackageComponents` | package-layer-runtime.ts:13-49 |
| DijiPeople Core | per-tenant Default Solution (`solutionKey 'default'`, isDefault+isSystem, published, layer 100), materialised from Prisma DMMF | customization.service.ts:4640-4940; customization.registry.ts |
| Default Customizations | `<prefix>_tenantCustomizations` package, default destination of every draft (BUG-3493 fix) | customization.service.ts:4367 |
| Stable identity | `objectKey` = logical `tableKey[.childKey]`, unique per tenant via tableKey/columnKey/formKey/viewKey | service.ts:300,352,380,2577 |
| Publisher prefix | derived from name, `FIELD_LOGICAL_NAME_PATTERN` enforces `prefix_name` | dto/customization.dto.ts:21-24; service.ts:4151,6036 |
| Add Existing / Create in package | `candidates`, `components`, `packageId` on create/edit, `CustomPackagePickerDialog` | controller.ts:241-270; web `_components` |
| Dependency detection | `dependency-validation.ts`, `findMetadataDeleteDependencies`, table/column dependency endpoints | service.ts:1924, controller.ts:395,469 |
| Validation, Publish | `validatePackage`, `publishPackage`, Publish Center | service.ts:1277,1418 |
| Export (JSON), import preview | `exportPackage` (version hard-coded 1.0.0), `previewPackageImport` (`applySupported:false`) | service.ts:2162,2213 |
| Environments | `Tenant.environmentType` PRODUCTION/UAT/SANDBOX/DEVELOPMENT + `TenantEnvironmentGroup` | schema.prisma:116,2073,2449 |
| Secrets | `SecretEncryptionService` (AES-256-GCM) | common/security/secret-encryption.service.ts:31 |
| Operation-state pattern | `DataJob` / `DataJobStatus` | schema.prisma:11466-11508 |
| Audit | `AuditService.log()` | AGENTS.md |
| Plan entitlement | `FeatureAccessService` — kept separate from package installation (§52) | tenant-settings/feature-access.service.ts |

**ApplicationRelease is NOT reused (decision, ADR to be filed).** It distributes
downloadable client binaries (desktop agent, gateway, ZKTeco diagnostic): it has
platform/architecture/channel/storageKey/electron-updater checksums
(schema.prisma:12591). A customization package version has none of these and
needs tenant scoping and component content. Reusing it would overload a global
binary catalog with tenant metadata. Package versions get their own table; the
two concepts meet only in docs.

## What is missing (the work)

1. The publisher is not persisted. `createPackage` drops the publisher name, and the prefix is re-derived on every read (service.ts:1579,4151).
2. The package has no version. There are no immutable releases, and the export says "1.0.0" whatever the package holds.
3. Packages cannot depend on other packages.
4. Export is not deterministic, has no checksum and no artifact file, and the format version is a string.
5. Import cannot apply. There is no comparison against the target, no conflict model, no plan, no transaction, no history, no upgrade or downgrade handling, and no idempotency.
6. There is no uninstall and no reverse package-dependency check.
7. There are no environment variable definitions or values.
8. There is no Versions, Dependencies or Deployments UI, and no import UI at all.

## Architecture decisions

1. **Package.** Extend `CustomizationSolution` with:
   - `version` (current editable semver)
   - `publisherId`
   - `origin` (LOCAL | IMPORTED)
   - `isTenantDefault`
   - `installedVersion`
   - `sourceEnvironmentType`

   Type is derived and never stored twice:
   - SYSTEM = isDefault+isSystem ("DijiPeople Core")
   - EDITABLE = LOCAL and not managed
   - INSTALLED = IMPORTED and isManaged (read-only)

2. **Publisher.** A new `CustomizationPublisher` has `tenantId`, `publisherKey`, `displayName`, `prefix` and `isSystem`, with @@unique([tenantId, prefix]) and @@unique([tenantId, publisherKey]). The system publisher `dijipeople` reserves the prefixes `dp`, `dijipeople` and `sys`. System fields keep their unprefixed names (backward compatibility). The backfill creates one publisher per distinct derived prefix.

3. **Identity.** The portable identity is `componentKey = <componentType>:<objectKey>`. A child also carries its `parentKey` (tableKey). Database ids never leave the environment: the artifact holds no objectId, no tableId and no user ids.

4. **Versions.** A new `CustomizationPackageVersion` has `packageId`, `tenantId`, `version`, `artifactJson` (canonical), `checksum`, `componentCount`, `releasedBy`, `releasedAt` and `notes`, with @@unique([packageId, version]). It is immutable: there is no update endpoint.
   - **Release** validates the package, publishes its drafts through the existing `publishComponents`, serializes and stores the artifact, then bumps the editable version. The bump is patch by default; the user may choose minor or major.
   - **Export** always serves a released version, the latest by default. Draft-state export stays as today, as a "working copy" JSON marked non-importable.

5. **Package dependencies.** A new `CustomizationPackageDependency` has `packageId`, `dependsOnPackageKey`, `dependsOnPublisherKey`, `minVersion` and `maxVersion?`. It is declared on the editable package and frozen into each version's manifest.
   - Component dependencies are computed, not stored, by the existing scanners. They are materialised into the manifest at release.
   - The artifact carries two kinds of package dependency: the declared ones, plus auto-detected references to DijiPeople Core as INFO.

6. **Artifact (`.djpkg`).** It is a single canonical JSON document (UTF-8) made of:
   - `{ formatVersion: 1, manifest, components[], dependencies[], environmentVariables[] }`
   - sorted keys and sorted components, ordered by dependency topological order, then componentKey;
   - sha256 per component plus a whole-content sha256.

   **Deliberately not a ZIP in format 1.** No component carries binary assets today. A ZIP adds a new dependency (none is direct today) and the zip-bomb and path-traversal surface, for no current benefit.

   Future-proofing:
   - `formatVersion` 2 can wrap this document in a ZIP when custom widgets need assets.
   - The importer rejects any `formatVersion` other than 1 with a clear message.
   - A checksum is integrity only. The manifest reserves a `signature` field, which is null and never trusted. A checksum is not publisher trust, and the UI says "Integrity verified", never "Trusted".

7. **Import.** Import is two persisted phases on a new `CustomizationPackageOperation`:
   - fields: `tenantId`, `kind` (IMPORT | UNINSTALL), `status` (ANALYZING, READY, BLOCKED, IMPORTING, COMPLETED, FAILED, ROLLED_BACK), `packageKey`, `version`, `previousVersion`, `artifactChecksum`, `planJson`, `resultJson`, `errorJson`, `correlationId`, counts, `actorUserId`, and timestamps;
   - (a) `analyze` takes a multipart upload of up to 5 MB, parsed with depth, count and string limits. It runs, in order:
     1. structural validation
     2. format version check
     3. checksums
     4. identifier and prefix rules
     5. unsupported types
     6. platform metadata-schema compatibility
     7. package dependencies against installed versions
     8. per-component comparison against the target, giving NEW / MATCHING / UPDATE / TARGET_MODIFIED / CONFLICT / MISSING_DEPENDENCY / INCOMPATIBLE / SKIPPED
     9. upgrade, same-version or downgrade classification

     It persists the plan and mutates no metadata.
   - (b) `execute(operationId)` re-verifies the stored checksum. It refuses a BLOCKED plan, and refuses a plan that is stale because the target changed since analysis. It applies the plan in dependency order inside **one Prisma interactive transaction** (all metadata lives in one database), writes a journal into `resultJson`, then publishes a snapshot through the existing publish path.
   - On any failure the transaction rolls back and the operation becomes FAILED, naming the failing component; nothing is partially applied. This is real atomic rollback, so no compensating-operation engine is needed.
   - Services run from the operation id and do not depend on the request staying open. Moving to the in-process job worker (ADR-0004 pattern) later is a wiring change, which is justified only if imports exceed the transaction timeout.

8. **Conflict rules (blocking).**
   - a field type change
   - a changed lookup target
   - a changed parent module
   - an objectKey owned by a different package (another publisher)
   - a collision with a system component
   - a prefix registered to a different publisher
   - a downgrade (advanced override; recorded; off by default)
   - a missing package dependency
   - an unsupported type or format

   Requiredness tightened on a module that has records is a WARNING. TARGET_MODIFIED (the target edited an installed component locally) is a WARNING; the package wins, and the local change is listed in the plan.

9. **Upgrade.** An upgrade applies only NEW and UPDATE items. A component removed from the source is **reported, never deleted**. MATCHING items are no-ops, so re-importing the same version gives "No changes — already installed".

10. **Uninstall.** Uninstall is allowed only for INSTALLED packages. It is blocked while another package declares a dependency on the package, and the block shows the dependency chain.
    - It removes only components the package owns: layers are deleted, custom tables are retired (soft) using the existing retire path.
    - It **refuses** if a package-owned custom module has records, unless the admin keeps the data by converting the package to EDITABLE ("detach"). Record data is never deleted.
    - Delete (EDITABLE package), Remove-from-package, Delete component and Uninstall (INSTALLED) stay four distinct actions.

11. **Environment variables.** This adds a new component type, `environmentVariable`. Its definition is a new `CustomizationEnvironmentVariable` in the package: key (prefixed), type (text | number | boolean | url | secret), `isRequired`, and a default for non-secret types.
    - Values are held in `CustomizationEnvironmentVariableValue` per tenant (that is, per environment), and are encrypted with `SecretEncryptionService` when the type is secret.
    - Values are **never exported**. On import, a required variable without a value is a blocking item that the admin fills in the wizard.
    - Nothing consumes these variables yet; they are infrastructure for the next integration features.

12. **DijiPeople Core.**
    - It keeps its existing representation, so no system metadata is duplicated.
    - Its display name becomes "DijiPeople Core", and its version is the platform metadata-schema version: a constant `CUSTOMIZATION_METADATA_SCHEMA_VERSION`, starting at 1.0.0. The platform has no meaningful semver (`services/api/package.json` 0.0.1), so this is the honest compatibility axis.
    - It is protected server-side: it cannot be deleted, renamed, exported, uninstalled or overwritten by an import.

13. **Default Customizations.** The existing tenant package gets `isTenantDefault=true`.
    - It is created at provisioning, in the existing `customization-defaults` step (platform-lifecycle.service.ts:1811, covered by its retry), and still lazily on first use.
    - Its display name is "Default Customizations", and its key is unchanged.
    - The screens that create components show the destination package; that picker already exists.
    - An "active package" preference is **not** built. The picker already makes the destination explicit on every create, and a second hidden default would contradict §15's "never hidden".

14. **Existing customizations.** A backfill migration:
    - creates publishers from the existing derived prefixes;
    - sets `isTenantDefault`;
    - sets version 1.0.0 on every package;
    - creates no versions.

    Nothing moves between packages. Drafts in the legacy "Unassigned" package keep their existing move-out path from BUG-3493.

## Permission / RBAC impact

Reused keys: `customization.read`, `customization.packages.manage`, `customization.publish`, `customization.export` and `customization.import.preview`.

New keys:
- `customization.packages.release`
- `customization.packages.import` (execute)
- `customization.packages.uninstall`

Each endpoint carries both `@Permissions` and `@RequirePermission(ENTITY_KEYS.CUSTOMIZATION, …)`. The `CustomizationAccessGuard` rule, under which elevated roles still need the key, is kept.

The new keys are granted wherever `customization.*` is granted today (auth-access.service.ts:185-191), are added to seed-config and to verify-seed-config, and are mirrored in `security-keys.ts` and the customization page-permissions JSON.

## Tenant isolation

- Every new model is tenant-owned with `tenantId`, the tenant relation, `@@index([tenantId])`, and uniques that include `tenantId`.
- Every query uses `request.user.tenantId`. The artifact carries no tenantId, and the importer ignores any tenant, id or actor field in it.
- An operation is loaded by `{id, tenantId}`.
- Cross-tenant tests cover read, export, analyze-into and execute of another tenant's operation.
- The super-admin cross-tenant view (§47) is deferred (D-3).

## Audit and logging

`AuditService.log()` records:
- package created, updated or deleted
- component added or removed
- validated, released or exported
- import analyzed, completed or failed (with the transaction rolled back)
- uninstalled or detached
- environment variable value set, as the key only and never the value

Structured Logger events `PACKAGE_IMPORT_*` carry a correlationId. Values, secrets and artifact bodies are never logged.

## Pre-existing defects found in discovery (become BUG records, triaged)

- **B1 — HIGH, PRODUCT GAP.** A custom field on a system module (for example "Employee Grade" on Employees) has **no value storage**. No model has a custom-values column, and only the customization service reads `CustomizationColumn`. The field can be defined, packaged and moved, but holds no data. → **owner decision D-1**
- **B2 — MEDIUM.** Draft column edits take effect before publish, because the runtime reads live column rows (custom-module-runtime.service.ts:54-81).
- **B3 — MEDIUM.** `deleteColumn`, `deleteForm` and `deleteView` ignore references held in component `metadataJson`, and `deleteMany` their components across every package. This is fixed in WP-04 by reusing `findMetadataDeleteDependencies` (§66).
- **B4 — LOW.** `GET /runtime-metadata/published` returns the full metadata snapshot to any authenticated user.
- **B5 — LOW.** `CustomizationSolution.tenantId` is nullable under @@unique([tenantId, solutionKey]).
- **Scope note.** ModuleView, navigation overrides, workflows, reports and templates live outside the package model. They are not portable in format 1, and the component registry marks them `supported:false`.

## Work packages

| WP | Title | Depends | Label |
|---|---|---|---|
| WP-01 | Schema: publisher, package columns, version, dependency, operation, env var def/value; enum `environmentVariable`; migration + idempotent backfill | — | DEPENDENCY_BLOCKED (single writer) |
| WP-02 | Publishers, versioning/release, package dependencies, deterministic serializer + checksum, `.djpkg` export, permission keys + seeds | WP-01 | |
| WP-03 | Import engine: analyze → comparison → conflicts → plan → atomic execute → post-validate; upgrade/downgrade/idempotency; history; audit | WP-02 | |
| WP-04 | Dependency graph endpoints (dependencies/dependents per component, per package); uninstall/detach; delete-safety fix B3 | WP-02 | PARALLEL_SAFE with WP-03 (different files) |
| WP-05 | Environment variables: definitions as components, per-tenant values (encrypted secret), import binding | WP-03 | |
| WP-06 | Web: list columns (type/version/publisher/origin), detail tabs Versions/Dependencies/Deployments, Release dialog, `.djpkg` download, import wizard (upload → validate → compare → conflicts → plan → import → result), dependency viewer, env-var values; multipart proxy | WP-03..05 contracts | INTEGRATION |
| WP-07 | QA: unit specs per engine; DB-backed e2e round trip on a throwaway DB with tenant DEV and tenant UAT (§81); negative suite (§82); RBAC + cross-tenant; browser pass | WP-06 | |
| WP-08 | ADR (package model + ApplicationRelease), docs/architecture/customization-packages.md, knowledge, Obsidian sync, integration into develop | all | |

## Testing strategy

Commands:
- `npm --workspace api run test`
- `npm --workspace api run test:e2e`
- `npm --workspace api run check-types`
- `npm run prisma:validate`
- `npm run db:preflight` / `db:postflight`
- `npm --workspace web run test`
- `npm --workspace web run check-types`
- `npm run lint`
- `npm run validate:framework`
- `npm run backlog:check`

The pure engines are specified with mutation-checked specs:
- serializer determinism
- checksum tampering
- comparison classification
- conflict rules
- topological order and cycles, where schema cycles (module A ↔ B lookups) are allowed and package-dependency cycles are rejected
- semver compare, reusing `compareSemver` from tenant-apps.service.ts:516 by moving it to `common/`

A DB-backed e2e test covers the full §81 round trip (release 1.0.0, export, import, upgrade to 1.1.0, re-import) and the §82 negatives.

## Risks (ranked)

1. **Tenant leak through the import or operation endpoints.** Mitigation: `{id, tenantId}` lookups everywhere, and cross-tenant e2e tests.
2. **Transaction timeout on large imports.** Mitigation: batch writes (createMany where possible) and an explicit timeout. Operation state already allows moving execution to a worker.
3. **customization.service.ts is 6,319 lines.** Mitigation: the new engines go in new files (`package-artifact.ts`, `package-comparison.ts`, `package-import.service.ts`, `package-release.service.ts`), and the monolith only delegates.
4. **The backfill touches every tenant's packages.** Mitigation: the backfill is additive and idempotent, is tested on a throwaway database, and adds no NOT NULL column without a default.
5. **The Playwright MCP server failed to connect this session.** The browser pass needs it reconnected, or it falls back to a scripted Playwright run.

## Rollback

The migration is additive, so the code can be reverted with the new columns and tables left in place. The web depends on the API endpoints and must ship after or with the API; an older web against a newer API keeps working.

## Definition of Done

Scenarios A–R from the brief, with these exceptions:
- **Scenario D/F** field *definitions* work end to end. Field *values* on system modules depend on D-1.
- **Scenario L** covers environment variables. Connection references are deferred (D-2).

Beyond the scenarios:
- every command above has been run, with results reported honestly;
- both permission systems are wired;
- tenant scoping is verified by tests;
- records are filed for B1–B5;
- the ADR and docs are filed;
- the work is integrated into develop;
- MAIN_CHANGE_STATUS = UNTOUCHED.
