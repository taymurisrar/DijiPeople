---
ID: BUG-3495
aliases: [BUG-3495]
Title: Customization editors accept invalid metadata and silently rewrite what the administrator typed
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: USER_REPORT
DetectedDate: 2026-09-13
DetectedInSha: df0f84f1
AffectedModules: [apps/web, customization]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-484
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: [docs/plans/EXECPLAN-0045-customization-end-to-end-for-permission-holders.md, services/api/src/modules/customization/customization.service.ts, apps/web/app/(authenticated)/settings/customization/_components/metadata-components-management.tsx, apps/web/app/components/ui/form-control.tsx]
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
ResolvedAt:
---

# BUG-3495 — Customization editors accept invalid metadata and silently rewrite what the administrator typed

## Summary

Several Customization editors save metadata that cannot work, and replace
values the administrator typed without saying so:

- An action bar saves with rows that have no command.
- A relationship saves against a reference field that does not exist.
- A new package's typed key is discarded and replaced with a generated one.
- The package's prefix does not match the components moved into it, and nothing
  objects.
- The lifecycle and package labels for one module contradict each other.
- Pressing Escape in a dropdown throws away the whole dialog.

Each one is small alone. Together they mean what an administrator sees in the
editor is not what was stored, and invalid metadata reaches Publish.

## Expected Behavior

- An editor rejects metadata that cannot function, at the field it concerns and
  before saving. That includes an action row with no command, or a relationship
  whose reference field is not a real field on the module.
- A value the administrator typed is stored as typed, or refused with a reason.
  It is never silently replaced.
- A module's lifecycle state is consistent with its components' states.
- Escape inside an open dropdown closes the dropdown, not the dialog.

## Actual Behavior

| Editor | Observed |
|---|---|
| Action bar | `dd_qaRecordBar` (detail-command-bar, 5 actions) saved with rows whose command still read "Choose a command". No validation error. |
| Relationship | "QA Asset Employee" (`dd_qaAssetEmployee`, many-to-one → employees) saved with reference field `dd_assignedEmployee`, which does not exist on the module and cannot be created (see [[BUG-3492]]). The field is free text. |
| New Package | Typed key `qa-walkthrough` was replaced by `qw_qaWalkthroughPackage` with no indication. |
| Package prefix | The package prefix is `qw_`. The 9 components moved into it kept their `dd_` names. Validate and publish both accepted the mismatch. |
| Prefix hint | The choice list, relationship and action bar dialogs show the hint "publisher prefix dd__", with a double underscore. |
| Dialog keyboard | Pressing Escape while a combobox inside a dialog is open closes the entire dialog and discards everything typed. |
| Lifecycle | The module lists lifecycle "published" while its fields, forms and views read "Draft". |
| Package names | One module shows three package names: "Default Package", "Custom Package" and "Unassigned Draft Customizations". |

## Reproduction

1. Sign in to `https://dijipeople-demo.ws.dijipeople.com` as the workspace
   owner and open custom module `qaAsset` in Customization.
2. Action Bars → New. Keep a pre-seeded row with command "Choose a command",
   then Save. It saves.
3. Relationships → New. Enter reference field `dd_assignedEmployee` and target
   Employees, then Save. It saves, although no such field exists on `qaAsset`.
4. Packages → New Package. Enter key `qa-walkthrough`, a display name "QA
   Walkthrough Package" and a publisher, then Save. The created package's key
   is `qw_qaWalkthroughPackage`.
5. In Publish Center, move the `dd_` drafts into that package, then Validate and
   Publish. Both succeed, with no prefix issue.
6. In any of those dialogs, open a combobox and press Escape. The dialog closes
   and the input is lost.

Reproduced on the live demo tenant at `df0f84f1`. The records created are still
on the tenant as test data.

## Evidence

- `services/api/src/modules/customization/customization.service.ts:1361-1411`
  (`createPackage`) uses `dto.packageKey` only for the "default" and conflict
  checks (lines 1366-1379). The stored `solutionKey` comes from
  `uniquePackageKey`, called with the publisher prefix joined to
  `camelize(dto.displayName)` (lines 1384-1392).
- `services/api/src/modules/customization/dto/customization.dto.ts:22`
  declares `PACKAGE_KEY_PATTERN` as `^[a-z][a-z0-9]*_[a-z][a-zA-Z0-9]*$`, the
  key shape the create DTO validates.
- `services/api/src/modules/customization/dependency-validation.ts:22-105`
  (`validatePackageComponentDependencies`) checks duplicate membership, missing
  base components and dangling metadata references. It does not check that a
  component's prefix matches its package's publisher prefix.
- `validatePublishDrafts` (`customization.service.ts:504-575`) calls only that
  function, which is consistent with step 5 passing.

## Root Cause

Established for the package key only. `createPackage` never stores the typed
key: it always derives one from the publisher prefix and display name, and the
response does not say so.

Established for the rest during TASK-0031 WP-01 (line numbers at `88f33c6e`):

- **Action bar.** `metadata-components-management.tsx:1307-1308` silently dropped
  rows without a command on save, and the API (`ensureCustomizationLayer`)
  validated no component metadata.
- **Relationship.** The reference field was a free `TextField`
  (`metadata-components-management.tsx:890-894`) and the API never checked it.
- **Prefix hint.** `metadata-components-management.tsx:494` rendered `${prefix}_`
  where `packagePrefix()` already ends in `_`.
- **Escape.** `apps/web/app/components/ui/dialog.tsx:216` listens on `document`
  in the capture phase, so it runs before a combobox's own handler and closes the
  dialog; `SearchableSelect` had no Escape handling at all.
- **Lifecycle and package labels.** `customization.service.ts:5334` hardcoded
  `lifecycleState: 'published'` for every module; `columns-management.tsx:188`
  hardcoded "Default Package" / "Custom Package", and the column list returned no
  lifecycle.
- **Prefix mismatch.** `validatePackageComponentDependencies` has no prefix rule,
  by design: the Architect decided a component's logical name and prefix are
  immutable and record its originating publisher (see Resolution).

## Impact

Administrators publish metadata that cannot work, such as commands bound to
nothing or relationships over missing fields, and learn this only at runtime.
Once [[BUG-3494]] gives custom modules a runtime, this becomes user-facing
failure. Silent rewrites erode trust in every other value the editor shows.
Losing a whole dialog to Escape costs real work.

No data outside the tenant's customization metadata is affected. Reachable in
production.

## Affected Areas

- API: `customization` module, specifically package create, component
  create/update for action bars and relationships, and publish validation.
- Web: Customization action bar, relationship, choice list and package dialogs;
  the module lifecycle and package labels; dialog and combobox keyboard handling
  in the shared form controls used by those dialogs.

## Proposed Resolution

- Validate at the API, so no client can bypass it:
  - An action row must name a registered command.
  - A relationship's reference field must be an existing reference column on
    the module, and should be picked from that module's fields, not typed.
  - A component's prefix must match its package's publisher prefix, or the move
    must rename it, as a decision recorded by the architect.
- Package create either stores the typed key or does not ask for one.
- Correct the prefix hint's string construction.
- Make Escape in an open combobox stop at the combobox.
- Derive a module's displayed lifecycle from its components.

No explanatory UI copy is part of the fix. No ExecPlan needed unless
prefix-renaming on move is chosen.

## Acceptance Criteria

- Saving an action bar with any row lacking a command returns 400, naming the
  row. Saving with all commands set succeeds.
- Saving a relationship whose reference field is not an existing reference
  column on the module returns 400.
- Creating a package with a valid typed key stores exactly that key, or the UI
  does not offer a key input. The stored key is never different from a key the
  user typed.
- Validate reports a blocking issue when a component's prefix does not match its
  package's publisher prefix, or the move renames it. Whichever is chosen is
  covered by a test.
- The prefix hint shows a single underscore.
- With a combobox open inside a Customization dialog, Escape closes only the
  combobox. The dialog and its input remain.
- A module whose components are all Draft is not labelled "published".

## Regression Coverage

QA scenario QA-SETTINGS-024.

- REG-484: `services/api/src/modules/customization/customization-publish-and-metadata.spec.ts`
  — an action bar missing a command returns 400 naming the row; a missing
  reference field returns 400; a real reference field is accepted into the tenant
  package; legacy deactivation is allowed; a missing component-type write key
  returns 403; a typed package key is stored exactly.
- REG-485: `apps/web/app/components/ui/listbox-escape.spec.ts` — the Escape
  decision, window-capture versus document-capture ordering, both comboboxes
  wired and named.

Mutation-checked: each of package key rewrite, command-less row, missing
reference field and unchecked type key fails the spec; moving the listbox
listener to `document` fails the Escape spec. The API checks are unit-level
rather than the DB-backed e2e required below; the component test is
source-reading because the web jest environment has no jsdom.

As filed, the record required:

- A DB-backed API e2e test posting an action bar with an unset command, and a
  relationship with a non-existent reference field. Both must return 400;
  today both return success.
- A unit test on `createPackage` asserting that the stored key equals the
  supplied valid key. It fails today.
- A component test for Escape-in-combobox inside a dialog.

REG entries follow once written.

## Dependencies

[[BUG-3492]]: a real reference field must be creatable before the relationship
check can be exercised end to end.

## Related Items

- [[BUG-3492]]: why a real reference field cannot be created.
- [[BUG-3493]]: the package workaround path where the key and prefix rewrites
  were observed.
- [[BUG-3494]]: the runtime where invalid metadata would surface.
- [[ITEM-0184]]: Customization usability defects in the same dialogs.

## Resolution

Fixed in TASK-0031 WP-01 (commit 811a915c on `agent/walkthrough2-customization`,
merged into `agent/walkthrough2-integration`; plan EXECPLAN-0045).

| Observed | Change |
|---|---|
| Action bar rows with no command | API `validateLayerMetadata` refuses a row without a command (400 "Action N has no command…"); the dialog validates rows by position and drops nothing silently. |
| Relationship over a missing field | The API requires `referenceField` to be a lookup column of the source module (system definition or active tenant column, tenant-scoped query); the dialog offers only the module's reference fields. Deactivation (`isActive: false`) is exempt. |
| Typed package key replaced | `createPackage` stores the validated `dto.packageKey` (DTO pattern plus the existing 409 on conflict). |
| Prefix hint "dd__" | Removed with the other explanatory hints (ITEM-0183). |
| Escape closes the dialog | `useListboxEscape` in `form-control.tsx`: an open `SelectField`, `LookupField` or the action bar's `SearchableSelect` handles Escape on `window` in the capture phase, closes itself and stops the event; with everything closed, Escape reaches the dialog. |
| Contradictory lifecycle and package labels | The module's lifecycle and package come from its table component, each field's from its column components; the Fields tab and module list show real package names. Labels "Many-to-many" and plain cascade wording replace "metadata-ready". |
| Component prefix differs from its package's prefix | Intended behaviour, not a defect (Architect decision, 2026-09-13): logical names are immutable, the prefix records the originating publisher, and renaming on move would break every reference to the component. Moving legacy `dd_` drafts into another publisher's package stays allowed and is not flagged. |

The "registered command" rule is enforced on the server as non-empty; the check
against the web command catalog stays client-side because the API has no
command registry.

## QA Retest

**NOT BROWSER-TESTED.** This record was not exercised in a browser during the
local QA run or on production. Coverage is unit specs only
(`customization-publish-and-metadata.spec.ts`, `listbox-escape.spec.ts`). CI
runs 34732185363, 34732682935 and 34732697734 passed on f865ac5e (the merged
tree), which is evidence the unit suite is green, not that the browser
scenario below was run. Scenario QA-SETTINGS-024:

1. Action Bars → Add action bar with a row left on "Choose a command" → the row
   is named; the same payload to the API returns 400.
2. Relationships → the Reference field offers only the module's reference
   fields; `referenceField: "dd_assignedEmployee"` to the API returns 400.
3. New package with key `qw_walkthrough` stores `qw_walkthrough`.
4. In Add field, Add relationship and Action bar dialogs, Escape in an open
   dropdown closes only the dropdown; a second Escape closes the dialog.
5. A module whose components are all Draft reads "Draft"; after publish,
   "Published"; the Package column names the owning package.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — fixed in TASK-0031 WP-01; the prefix-versus-package observation closed as intended behaviour by the Architect; unit-tested; browser verification pending.
- 2026-09-13 — QA retest: NOT BROWSER-TESTED — local browser QA run and production verification at e253306a.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Implementation — [[EXECPLAN-0045-customization-end-to-end-for-permission-holders]]
- Regression — REG-484 (see the regression register)

<!-- GRAPH:END -->
