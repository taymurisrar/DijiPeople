---
ID: BUG-3495
aliases: [BUG-3495]
Title: Customization editors accept invalid metadata and silently rewrite what the administrator typed
Status: OPEN
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
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
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

Not yet established for the rest: action-bar command validation, the
relationship reference-field check, the prefix hint's double underscore, the
dialog Escape handling and the lifecycle label. Each needs its code path traced
before a cause is recorded. The prefix mismatch is at least consistent with
`validatePackageComponentDependencies` having no prefix rule.

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

## QA Retest

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
