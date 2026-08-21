---
ID: BUG-0221
aliases: [BUG-0221]
Title: Schema-completed form fields render on a tab the form never declares
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: 08b8661
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-176
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/admin-record-status-header
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
ResolvedAt: 2026-08-21
---

# BUG-0221 — Schema-completed form fields render on a tab the form never declares

## Summary

`completeFormsFromSchema` adds every readable Prisma column a module's record
form did not configure, into a section pinned to the tab key `details`. That tab
only exists in the *default* tab set. Any module that declares its own tabs
therefore received those fields, passed the registry's schema-coverage check on
them, and then rendered none of them — the record page draws a section only when
its tab is the active one, and `details` was never selectable.

## Expected Behavior

A field the runtime adds to a record form is reachable on some tab of that form.

## Actual Behavior

The field exists in the definition, satisfies every load-time check, and is
invisible in the product.

## Reproduction

1. Open `/tenants/<tenantId>` and look for **Environment group**. It is on the
   tenant detail form and appears on none of the eight tabs.
2. Open `/onboarding/<onboardingId>` and look for **Agreed seats**. Same.

## Evidence

- `apps/admin/lib/runtime/platform-module-registry.ts` — `completeFormsFromSchema`
  pushed `{ key: "additional-details", tab: "details" }` unconditionally, while
  the default tab set (`summary`, `details`, `related`, `documents`, `timeline`)
  applies only when the form declares no tabs of its own.
- `apps/admin/app/_components/runtime/runtime-form.tsx` — sections are filtered
  with `!section.tab || section.tab === activeTab`, so a section on an
  undeclared tab can never be active.
- Affected at this baseline: `tenants.environmentGroupId`,
  `customer-onboarding.agreedSeats`.

## Root Cause

The schema-coverage rule in the registry asserts that every readable field
appears on *some* form. It does not ask whether the form can show it, so it
passed on fields nobody could reach — a check that proves presence and nothing
else.

## Impact

Two fields invisible today. The mechanism is general: any module that gains its
own tabs loses every schema-completed field at the same moment, silently.

## Affected Areas

Every `apps/admin` record page whose form declares tabs.

## Proposed Resolution

Place the completed section on the `details` tab when the form has one and on
the last declared tab otherwise, and make the registry's load-time validation
fail on a section or field placed on a tab the form does not declare — so the
coverage check can no longer pass vacuously.

## Acceptance Criteria

- No form field in the registry renders on no tab.
- Adding one fails at module load with a message naming the field.

## Regression Coverage

`unreachableFormPlacements` in `platform-module-registry.ts` runs at import time
alongside `validateRuntimeDefinition`; the registry throws, so every admin spec
and the app boot fail together. Verified by leaving `planForms` without an
`entitlements` tab: the registry throws naming the section.

## Dependencies

None.

## Related Items

[[BUG-0220]] — the same schema-completion mechanism offering fields the API
rejects.
[[BUG-0222]] — related panels placed on a tab, with the mirror-image mistake.

## Resolution

Fixed on `agent/admin-record-status-header`: the fallback tab is resolved from
the form's own tabs, the completed fields are re-tabbed with the section, and
`unreachableFormPlacements` now fails the registry on any unreachable placement.

## QA Retest

Covered by the load-time invariant above; no manual QA run was recorded.

## History

- 2026-08-21 — found while auditing tab reachability during the plans detail
  page rebuild.
