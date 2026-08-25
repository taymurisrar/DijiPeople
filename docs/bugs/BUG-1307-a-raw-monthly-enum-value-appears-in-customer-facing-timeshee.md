---
ID: BUG-1307
aliases: [BUG-1307]
Title: A raw MONTHLY enum value appears in customer-facing timesheets copy
Status: VERIFIED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-25
DetectedInSha: 42435d59
AffectedModules: [services/api/src/modules/tenant-settings, apps/landing]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-25-landing-e2e-local-and-prod-42435d5.md
RegressionId: REG-257
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-25
ResolvedAt: 2026-08-25
---

# BUG-1307 — A raw MONTHLY enum value appears in customer-facing timesheets copy

## Summary

The Timesheets module description reads "MONTHLY timesheets, submission, and
approval workflows." The leading `MONTHLY` is a `SCREAMING_SNAKE_CASE` enum
value sitting in prose. It is published on the production marketing site, on
both `/features` and the `/plans` comparison table.

## Expected Behavior

Module descriptions are sentence-case prose, as every sibling entry in the
catalog already is — "Employee directory, profiles, lifecycle actions, and
hierarchy."

## Actual Behavior

One entry begins with an unformatted enum constant.

## Reproduction

1. Open `https://www.dijipeople.com/features`.
2. Find the Timesheets card under "Attendance, leave and time".
3. It reads "MONTHLY timesheets, submission, and approval workflows."

Also visible on `/plans` under "What's in the platform".

## Evidence

Rendered text captured from production on 2026-08-25:

```
Timesheets
MONTHLY timesheets, submission, and approval workflows.
```

The string is a hardcoded literal, not a formatting failure at render time —
[`services/api/src/modules/tenant-settings/tenant-settings.catalog.ts:756`](../../services/api/src/modules/tenant-settings/tenant-settings.catalog.ts#L756):

```ts
{
  key: 'timesheets',
  label: 'Timesheets',
  description: 'MONTHLY timesheets, submission, and approval workflows.',
  ...
```

Its immediate neighbours in the same array are correctly cased, which is what
makes it read as a mistake rather than a house style.

## Root Cause

The description was written by pasting an enum value (the timesheet period,
`MONTHLY`) into prose and not casing it. Nothing validates catalog copy, so it
survived into a customer-facing surface.

## Impact

Cosmetic, but on two public pages that exist to sell the product, and in the
feature comparison a prospect reads while choosing a plan. It also implies
timesheets are monthly-only, which is a product claim the enum value was not
making — the catalog entry is describing a period, not a limitation.

Tenant-facing settings screens read the same catalog, so it appears inside the
product too.

## Affected Areas

- `services/api/src/modules/tenant-settings/tenant-settings.catalog.ts`.
- `/features` and `/plans` on the landing site.
- Any tenant settings screen rendering module descriptions.

## Proposed Resolution

Reword to sentence case and decide what it should actually say — most likely
"Timesheet periods, submission, and approval workflows." if the period is
configurable, or "Monthly timesheets, ..." if it genuinely is not. That is a
product question, not a typo fix, which is the reason to record it rather than
silently recase it.

## Acceptance Criteria

- The published description contains no `SCREAMING_SNAKE_CASE` token.
- The wording reflects whether timesheet periods are configurable.

## Regression Coverage

A catalog test asserting no `description` in `tenant-settings.catalog.ts`
matches `/\b[A-Z]{2,}(_[A-Z]+)*\b/` would catch this class of defect for every
entry, not just this one.

## Dependencies

Needs confirmation of whether timesheet periods are configurable.

## Related Items

- [[BUG-1306]] — the other published-copy defect found in the same run.

## Resolution

Fixed, and the product question the record raised is answered by the schema
rather than deferred.

`Timesheet` is keyed `@@unique([tenantId, employeeId, year, month])` — one
timesheet per employee per calendar month — so "Monthly" is factually accurate
and not a hedge. The description in
[`tenant-settings.catalog.ts`](../../services/api/src/modules/tenant-settings/tenant-settings.catalog.ts)
is now sentence case: `Monthly timesheets, submission, and approval workflows.`

Not done: the catalog-wide test proposed in the record, asserting that no
`description` contains a `SCREAMING_SNAKE_CASE` token. It would catch this class
of defect for every entry and is worth adding; it is out of scope for a copy fix
and belongs with a pass over the whole catalog.

## QA Retest

Verified in `docs/qa/runs/2026-08-25-landing-fixes-verification.md` (V17). The string is served from the module catalog, so it
reaches `/features` and `/plans` on the next API deployment — re-check both
public pages after release.

## History

- 2026-08-25 — created from qa run at `42435d59`.
- 2026-08-25 — fixed, verified on the running product, and closed. See `docs/qa/runs/2026-08-25-landing-fixes-verification.md`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[settings]], [[landing-architecture]]
- Regression — REG-257 (see the regression register)

<!-- GRAPH:END -->
