---
ID: BUG-3493
aliases: [BUG-3493]
Title: Publishing customizations dead-ends because new drafts land in a package that cannot be published
Status: OPEN
Severity: HIGH
Priority: P1
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

# BUG-3493 — Publishing customizations dead-ends because new drafts land in a package that cannot be published

## Summary

Every component an administrator creates in Customization defaults into a
holding package named "Unassigned Draft Customizations". Publish Center's
Validate step reports those drafts as valid with no issues. Publish then refuses
them, because drafts in that package can never be published. The Move to
Package control, the only way out, reads "No writable Custom Packages".

The page never shows that a Custom Package must be created first, or where. An
administrator who follows the screen as designed cannot publish anything.

## Expected Behavior

An administrator who creates customizations can publish them from Publish
Center without knowing an unstated precondition. Validation and publish apply
the same rules, so a set that validates also publishes. Drafts created without
an explicit package land somewhere publishable. Otherwise the flow itself
supplies a valid target, not an empty dropdown.

Validation warnings describe the component accurately. A view the administrator
just created is not called a default component.

## Actual Behavior

- Validate selected returns `valid: true` with no issues.
- Publish selected returns 400 with "Move unassigned draft customizations to a
  Custom Package before publishing."
- Move target is disabled, with the placeholder "No writable Custom Packages".
- Validation emits the warning "QA All Assets is a default component.
  Deactivation or deletion requires replacement metadata." for a view created
  minutes earlier.
- Publish Center also lists the system action bar and the default view and form
  that were generated automatically, as drafts the administrator never created.

## Reproduction

1. Sign in to `https://dijipeople-demo.ws.dijipeople.com` as the workspace
   owner.
2. In Customization, create a module and add a field, a view, a choice list, a
   relationship and an action bar, leaving each package choice at its default.
3. Open `/settings/customization/publish-center`. Every draft's Package column
   reads "Unassigned Draft Customizations".
4. Select all visible, then Validate selected. The result is valid, with no
   blocking issues.
5. Publish selected. The response is 400 with "Move unassigned draft
   customizations to a Custom Package before publishing."
6. Open Move target. It is disabled and reads "No writable Custom Packages".

Workaround, proven on the same tenant:

1. Packages → New Package, which requires a publisher.
2. Back in Publish Center, select the 9 drafts and move them to that package.
3. Validate, then Publish. The response is 201 with 9 components published and
   `snapshotVersion` 1, and the toast reads "9 component(s) published".

Reproduced on the live demo tenant at `df0f84f1`.

## Evidence

- `services/api/src/modules/customization/customization.service.ts:582-584`
  (`ensureCustomizationLayer`) and `3994-3996` fall back to
  `getOrCreateUnassignedDraftPackage` when no `packageId` is supplied. That
  function, at lines 4039-4071, upserts the package with key
  `unassigned-draft-customizations` (lines 60-61).
- `customization.service.ts:504-575` (`validatePublishDrafts`) computes
  `valid` from dependency issues only. It never checks whether a selected draft
  belongs to the unassigned package.
- `customization.service.ts:812-845` (`publishComponents`) runs that validation,
  which passes. It then separately throws the unassigned-package
  `BadRequestException` at lines 836-845. `publishPackage` repeats the refusal
  at lines 1207-1211, and export does too at line 1946.
- `apps/web/app/(authenticated)/settings/customization/_components/publish-center.tsx:53-59`
  builds `movablePackages` by excluding default, read-only, non-custom and
  unassigned packages. With no Custom Package yet the list is empty, and lines
  465-480 render the disabled "No writable Custom Packages" select. Nothing on
  the page leads to package creation.
- `customization.service.ts:563-568` passes every draft form and view name as
  `defaultComponentKeys`.
  `services/api/src/modules/customization/dependency-validation.ts:50-58`
  then emits "… is a default component" for each of them, whether or not it is
  a default.

## Root Cause

The unassigned holding package is both the default destination for every new
draft and a package the publish path refuses. That publishability rule lives
only in `publishComponents` and `publishPackage`, not in `validatePublishDrafts`.
So validation passes a set that publish rejects.

The Publish Center UI filters the unassigned package out of the move targets
and has no path to create a Custom Package. The one recovery action is empty
when it is needed. Separately, `validatePublishDrafts` labels all form and view
drafts as default components, without checking whether they are.

## Impact

No tenant administrator can publish a customization by following Publish Center.
Without publishing, no customization takes effect. With [[BUG-3494]], this
means the Customization section as shipped has no reachable end-user outcome.

The misleading "valid" result and the false default-component warning make the
failure look like user error. Reachable in production.

## Affected Areas

- API: `customization` module, specifically `validatePublishDrafts`,
  `publishComponents`, `publishPackage`, export, and the component-create paths
  that default to the unassigned package.
- Web: Publish Center (`publish-center.tsx`), and component-create dialogs that
  leave the package blank (for example `custom-package-picker-dialog.tsx`).

## Proposed Resolution

The owner decided to keep the package, prefix and layer model (decision D3,
2026-09-13), so the fix works inside it:

- Move the unassigned-package rule into `validatePublishDrafts` as a blocking
  issue, so validate and publish can never disagree.
- Remove the dead end structurally. Either give every draft a publishable
  destination automatically, such as a tenant Custom Package created on first
  use, or have Publish Center offer package creation inline as a move target.
  The architect chooses. Adding explanatory copy is not a fix.
- Compute `defaultComponentKeys` from the component's real default flag, not
  from its type.

No ExecPlan needed unless the automatic-package option changes existing package
data.

## Acceptance Criteria

- On a tenant with no Custom Package, an administrator can create a module,
  field, form and view with default package choices, and publish them from
  Publish Center without leaving the page to create a package first.
- For any selection, `POST /api/customization/publish/validate` returns
  `valid: false` exactly when `POST /api/customization/publish/components`
  would refuse it for a validation reason.
- A view or form the administrator created is not reported as a default
  component.
- Existing packages and already-published components are unaffected.

## Regression Coverage

A DB-backed API e2e test that creates a draft with no `packageId`, calls
publish/validate and then publish/components, and asserts both agree. Against
current code, validate returns `valid: true` and publish returns 400, so the
test fails.

A unit test on `validatePublishDrafts` asserting that a non-default view
produces no default-component warning. A REG entry follows once written.

## Dependencies

None. It was reachable only while [[BUG-3491]] was worked around.

## Related Items

- [[BUG-3491]]: blocked access to Publish Center.
- [[BUG-3494]]: what should happen after a publish succeeds.
- [[BUG-3495]]: package key and prefix rewrites seen on the workaround path.
- [[BUG-3496]]: the hydration error modal that also appears on Publish Center.
- [[ITEM-0184]]: Publish Center presentation defects (raw component ids and
  layer-action jargon).

## Resolution

## QA Retest

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
