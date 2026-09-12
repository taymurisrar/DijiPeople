---
ID: BUG-3492
aliases: [BUG-3492]
Title: Every custom field type without a length is rejected with Maximum length must be at least 1
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

# BUG-3492 — Every custom field type without a length is rejected with Maximum length must be at least 1

## Summary

In Customization, adding a field to a module fails for every field type that
has no length, such as a choice field or a reference (lookup) field. The Add
field dialog sends `maxLength: null` for those types, and the API's own
validator treats `null` as a length below 1. The request is rejected with
"Maximum length must be at least 1." The dialog disables the Max length input
for those types, so the administrator has no way to satisfy the error. Only
text-like fields with a length typed in can be created from the UI.

## Expected Behavior

A field type that has no length is created without one. A text field with a
blank Max length is created with no length limit, or with the product default.
A missing length is never a validation error.

## Actual Behavior

`POST` to the column-create endpoint returns 400 `VALIDATION_FAILED` with the
message "Maximum length must be at least 1." The error appears at the bottom of
the dialog, not beside a field. The Max length input it refers to is disabled
for the selected type.

## Reproduction

1. Sign in to `https://dijipeople-demo.ws.dijipeople.com` as the workspace
   owner.
2. Open `/settings/customization/tables/qaAsset/columns`, a custom module
   created for this walkthrough, and choose Add field.
3. Enter the display name "Condition", choose field type `choice`, and add two
   options. Max length is disabled.
4. Save. The API returns 400 with "Maximum length must be at least 1."
5. Repeat with display name "Assigned Employee", field type `reference`, and
   reference target Employees. You get the same 400 and message.

Reproduced twice on the live demo tenant at `df0f84f1`. A text field
(`dd_serialNumber`) with a length typed in was created successfully.

## Evidence

- `apps/web/app/(authenticated)/settings/customization/_components/columns-management.tsx:709`
  sets the payload to `maxLength: supportsMaxLength(form.fieldType) ? form.maxLength : null`.
- `supportsMaxLength` (same file, lines 728-730) is true only for `text`,
  `multilineText`, `email` and `phone`, so every other type sends `null`.
- The create form starts at `maxLength: null` (line 309). A blank input maps to
  `null` (line 554), so a text field with no length typed also sends `null`.
- The Max length input is `disabled={!supportsMaxLength(form.fieldType)}`
  (line 550).
- `services/api/src/modules/customization/dto/customization.dto.ts:170-173`
  declares `maxLength` as `@IsOptional() @IsInt() @Min(1)`. `@IsOptional`
  skips the other validators when the value is `null`, so the DTO passes.
- `services/api/src/modules/customization/customization.service.ts:5058-5060`
  has `if (dto.maxLength !== undefined && dto.maxLength < 1)`, which throws
  `BadRequestException('Maximum length must be at least 1.')`. In JavaScript
  `null !== undefined` is true and `null < 1` is true, so `null` is rejected.
- `validateValueRules` runs on create (`customization.service.ts:2292`, in
  `createColumn`) and again at line 2373.

## Root Cause

The client and the API mean different things by "no length". The client sends
`maxLength: null`. The API's `validateValueRules` only treats `undefined` as
"not provided" and compares `null` numerically, where it counts as 0. The DTO
cannot catch the mismatch, because `@IsOptional` lets `null` through.

Neither side is wrong alone. The defect is at the seam, and no test sends the
real client payload to the real validator.

## Impact

Tenant administrators cannot create choice, reference (lookup), number,
datetime or boolean fields from the UI. Choice and reference were reproduced.
The other types follow from `supportsMaxLength` in the code. Text fields fail
too unless a length is typed.

This blocks the main use of custom modules: a module limited to text fields
cannot hold a status, a lookup or a date. It also blocks lookup-based
relationships, so the relationship editor accepts reference fields that cannot
exist (see [[BUG-3495]]). Reachable in production.

## Affected Areas

- Web: Customization → module → Fields → Add field dialog
  (`columns-management.tsx`), and edit, which uses the same payload builder.
- API: the `customization` module's column create and update paths, and
  `validateValueRules`.

Context from the same dialog, tracked in [[ITEM-0184]] and not in this record:

- The logical-name prefix is only checked on Save.
- The reference target selector is enabled for non-reference types.
- Field-type options show raw lowercase values.
- The dropdowns have no accessible name.

## Proposed Resolution

Make one rule for an absent length, and enforce it at the API boundary.
`validateValueRules` should treat `null` the same as `undefined`: no length.
It should ignore `maxLength` entirely for field types that have no length. The
client should stop sending `maxLength` for those types, so the payload says
what the administrator actually chose. No ExecPlan needed.

## Acceptance Criteria

- From the Add field dialog, a `choice` field with at least one option, a
  `reference` field targeting Employees, and a `number`, a `datetime` and a
  `boolean` field each save with 201.
- A `text` field with Max length left blank saves with 201.
- A `text` field with Max length `0` is still rejected with a field-level error.
- Created fields appear in the module's field list with the chosen type.

## Regression Coverage

A seam test that sends the exact payload `buildPayload` produces, for a choice
field and for a blank-length text field, through the real `ValidationPipe` and
`CustomizationService.createColumn`. It asserts success. It must fail against
the current `validateValueRules`.

A DB-backed API e2e test of `POST` create-column with `maxLength: null` would
serve the same purpose. A REG entry follows once written.

## Dependencies

None. It was reachable only while [[BUG-3491]] was worked around.

## Related Items

- [[BUG-3491]]: blocked access to this dialog.
- [[BUG-3495]]: the relationship editor accepts a reference field that this
  defect makes impossible to create.
- [[ITEM-0184]]: the Add field dialog usability defects.

## Resolution

## QA Retest

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
