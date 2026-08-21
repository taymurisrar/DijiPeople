---
ID: BUG-0222
aliases: [BUG-0222]
Title: Plan related-record panels declare no tab, so they never render
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

# BUG-0222 — Plan related-record panels declare no tab, so they never render

## Summary

The plans module declares two related-record panels — subscriptions on the plan,
and customers who selected it — with no `tab`. The record page renders a
relationship only when `relationship.tab === activeTab`, and the plan form
declares tabs, so neither panel could ever be the active one. The plan record
page advertised **Subscriptions** and **Tenants** tabs and showed nothing on
either.

## Expected Behavior

Opening a plan's Subscriptions tab lists the tenants billed on that plan.

## Actual Behavior

Both tabs were filtered out of the tab bar as empty. Even when reachable they
rendered no panel.

## Reproduction

1. Open `/plans/<planId>`.
2. The tab bar shows Overview, Pricing and Stripe only — no Subscriptions, no
   Tenants — despite `planForms()` declaring seven tabs.

## Evidence

- `apps/admin/lib/runtime/platform-module-registry.ts` — the plans
  `relatedRecords` entries carried `key`, `label`, `module` and `foreignKey`,
  and no `tab`.
- `apps/admin/app/_components/runtime/runtime-record-page.tsx` —
  `relatedRecords.filter(r => !formDefinition.tabs?.length || r.tab === activeTab)`,
  and the tab-visibility filter drops a tab with no fields, no relationship, no
  timeline and no runtime panel.
- The same file's `hasSpecialPanel` returned true for `moduleKey === "plans"` on
  every tab, which suppressed the "nothing to show here" message that would have
  made the dead tabs obvious.

## Root Cause

`tab` is optional on a relationship, which is correct for a module whose form
has no tabs, and silently wrong for one whose form does. Nothing checked the
combination.

## Impact

An operator could not see which tenants a plan is billing from the plan record —
the single most useful thing to know before changing its pricing or
entitlements.

## Affected Areas

`apps/admin` plans record page.

## Proposed Resolution

Give both relationships the tab they belong on, and narrow `hasSpecialPanel` for
plans to the tabs that actually carry a panel so an empty tab says so.

## Acceptance Criteria

- The plan record page renders a Subscriptions tab listing subscriptions and a
  Customers tab listing customer accounts.
- A plan tab with nothing on it reports that, rather than rendering blank.

## Regression Coverage

`apps/admin/lib/runtime/plan-record-form.spec.ts` — "places the related record
panels on tabs that exist" fails if either relationship loses its tab or names
one the form does not declare.

## Dependencies

None.

## Related Items

[[BUG-0221]] — the mirror-image placement failure, on form fields.
[[BUG-0220]] — the plans save failure found in the same pass.

## Resolution

Fixed on `agent/admin-record-status-header`: both relationships name their tab
and carry an empty-state, and `hasSpecialPanel` is scoped to the plan tabs that
have one.

## QA Retest

Covered by the regression spec above; no manual QA run was recorded.

## History

- 2026-08-21 — found while rebuilding the plans detail page.
