---
ID: BUG-0220
aliases: [BUG-0220]
Title: Saving a plan from the runtime record page always returns 400
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: 08b8661
AffectedModules: [apps/admin, api:platform-runtime, api:super-admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-174
RelatedBacklogItem: ITEM-0022
RelatedDecision:
RelatedImplementation: agent/admin-record-status-header
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
ResolvedAt: 2026-08-21
---

# BUG-0220 — Saving a plan from the runtime record page always returns 400

## Summary

`/plans/[planId]` renders the platform runtime record page. Pressing **Save**
there sent every schema-editable Plan column to
`PATCH /api/platform-runtime/plans/:id`, including columns `UpdatePlanDto` does
not declare. The API validates with class-validator's `forbidNonWhitelisted`,
which rejects on the presence of an unknown key — so the whole request failed
with a 400 and no plan edit made from the standard Admin screen was ever saved.

## Expected Behavior

Editing a plan's name, description, display order, legacy prices or active flag
and pressing Save persists the change and returns the updated record.

## Actual Behavior

Every save fails with a 400 naming a property that "should not exist". Which
property is named depends on key order, so the message varies between saves of
the same form.

## Reproduction

1. Sign in to Platform Admin and open any plan at `/plans/<planId>` (no
   `?workspace=` parameter, so the runtime record page renders).
2. Press **Edit**, change **Plan name**, press **Save**.
3. `PATCH /api/platform-runtime/plans/<planId>` returns 400.

## Evidence

- `apps/admin/app/_components/runtime/runtime-record-page.tsx` — `save()` builds
  its payload from the form's non-read-only fields whose generated schema entry
  is `editable`.
- `packages/config/platform-runtime-schema.generated.json` — for `plans`,
  `isPublic`, `publicationStatus`, `salesModel`, `publishedAt`, `publishedById`,
  `archivedAt`, `legacyPricingMigratedAt` and `tenantId` are all `editable: true`,
  because they are plain writable Prisma columns.
- `apps/admin/lib/runtime/platform-module-registry.ts` — `completeFormsFromSchema`
  adds every readable schema field the form did not configure, marking it
  read-only only when it is `systemManaged` or non-writable. None of the columns
  above qualified, so all of them arrived on the form as editable.
- `services/api/src/modules/super-admin/dto/update-plan.dto.ts` — accepts exactly
  `key`, `name`, `description`, `isActive`, `monthlyBasePrice`,
  `annualBasePrice`, `currency`, `sortOrder`, `featureKeys`.
- `services/api/src/modules/platform-runtime/platform-runtime.service.ts` —
  `dto()` runs `validate` with `whitelist: true, forbidNonWhitelisted: true`.

## Root Cause

Two correct-in-isolation mechanisms met. The runtime completes a form from the
Prisma schema, which is a statement about the *database*; the API validates
against a DTO, which is a statement about the *contract*. Nothing reconciled
them, and Plans is where the two diverge most, because ITEM-0018 added
publication columns to `Plan` without adding them to `UpdatePlanDto`.

The failure was invisible to the existing checks: `POST /validate` returns
`{ success: true }` for any module with no DTO mapped, and `plans` had none — so
the form's own validation step passed and the request failed at the write.

## Impact

Every plan edit from the standard Admin screen. Reachable in production by any
platform operator. The only working path was the legacy screen at
`?workspace=legacy-commerce`, which nothing links to.

## Affected Areas

`apps/admin` plans record page, `platform-runtime` update and validate,
`super-admin` `updatePlan`.

## Proposed Resolution

Declare the plan form explicitly and mark every field `UpdatePlanDto` does not
accept as read-only, so the save payload cannot contain one. Map `plans` onto
`UpdatePlanDto` in the runtime `validate` switch so a contract mismatch is
reported against the field instead of failing the whole write.

Not part of this fix: making the publication columns writable. That is
[[ITEM-0022]] — publication is a commercial act that needs governed, audited
actions rather than an edit form.

## Acceptance Criteria

- Editing and saving a plan's name, description, display order, active flag,
  currency or legacy prices succeeds.
- No field the API will reject is offered as editable on the plan form.
- Publication status, sales model and the publication timestamps are visible on
  the record and clearly not editable there.

## Regression Coverage

`apps/admin/lib/runtime/plan-record-form.spec.ts` — "leaves writable only the
fields UpdatePlanDto accepts" parses `update-plan.dto.ts` and fails on any
writable plan form field the DTO does not declare. Verified to fail against the
defect by making `isPublic` writable again: 2 of 6 assertions fail.

## Dependencies

None.

## Related Items

[[ITEM-0018]] — added the publication columns this form then offered.
[[ITEM-0022]] — the governed publish and archive actions that should own them.
[[BUG-0027]] — the other place Admin and the API disagreed about plan pricing.
[[BUG-0221]] — the same schema-completion mechanism placing fields on no tab.
[[BUG-0223]] — the one column this fix leaves unreachable.

## Resolution

Fixed on `agent/admin-record-status-header`.

- `planForms()` now declares every Plan column explicitly, with the eight the
  DTO accepts writable and the rest read-only and described.
- `PlatformRuntimeService.validate` maps `plans` (update mode) onto
  `UpdatePlanDto`, so field errors surface on the field.

## QA Retest

Covered by the regression spec above; no manual QA run was recorded.

## History

- 2026-08-21 — found while rebuilding the plans detail page; fixed in the same
  task and recorded here rather than only in the task summary.
