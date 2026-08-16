---
ID: BUG-0029
Title: Public features page advertised capabilities the product does not gate and omitted ones it does
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DOCUMENTATION
Source: REVIEWER
DetectedDate: 2026-08-16
DetectedInSha: 7686bb0
AffectedModules: [apps/landing]
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-16-public-commercial-wave2-7686bb0.md
RegressionId: REG-019
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/public-commercial-wave2
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
ResolvedAt: 2026-08-16
---

# BUG-0029 — Public features page advertised capabilities the product does not gate and omitted ones it does

## Summary

The public `/features` page rendered a hardcoded array of twelve cards that had
drifted from the product's own feature catalogue in **both** directions: it
advertised things the product does not gate as features, and omitted three that
it does.

## Expected Behavior

The public site describes capabilities that exist, and does not omit ones
customers are paying for. Which features exist is the product's answer, not the
marketing page's.

## Actual Behavior

`apps/landing/app/features/page.tsx` held a literal 12-entry array, maintained
by hand and reconciled with nothing.

**Advertised but not entitlement features:** "Reporting", "Role-based access",
"Multi-tenant architecture". Reporting and role-based access are real product
capabilities (`services/api/src/modules/reports/`, `roles`, `permissions`), so
these are not false claims — but they are platform capabilities presented with
the same weight as Payroll, which describes the software to an engineer rather
than the product to a buyer.

**Omitted despite being entitlement features:** `organization`, `projects`,
`notifications`. Growth and Enterprise both include Projects, and no prospect
reading this page would know.

**Internal vocabulary shown to customers:** one card read "Multi-tenant
architecture — Workspace isolation, tenant billing, feature flags, customer
accounts, and admin lifecycle management." That is five internal terms in one
sentence on a public marketing page.

## Reproduction

1. Open `/features` before this change.
2. Compare the twelve card titles against `TENANT_FEATURE_DEFINITIONS` in
   `services/api/src/modules/tenant-settings/tenant-settings.catalog.ts`.
3. Organization, Projects and Notifications appear in the catalogue and not on
   the page; Reporting, Role-based access and Multi-tenant architecture appear
   on the page and not in the catalogue.

## Evidence

- `apps/landing/app/features/page.tsx:10-23` (pre-change) — the hardcoded array.
- `services/api/src/modules/tenant-settings/tenant-settings.catalog.ts:701+` —
  the 12-feature catalogue the product actually gates on.
- `services/api/src/modules/super-admin/plans.catalog.ts` — Growth includes
  `projects`; the page never mentioned it.

## Root Cause

There was no path from the product's feature catalogue to the public site, so
the page kept its own list. A hand-maintained copy of a fact that changes
elsewhere drifts by default — the only question is when.

## Impact

Prospect-facing and commercial. A buyer evaluating DijiPeople could not see
capabilities included in the plan they were being sold, and read internal
engineering vocabulary on the page meant to persuade them.

## Affected Areas

`/features`, and the plan comparison on `/plans` which had no entitlement source
at all before this wave.

## Proposed Resolution

Serve the feature catalogue from the commercial config API, derived from
`TENANT_FEATURE_DEFINITIONS`, and render both pages from it. Keep marketing
prose in the landing app; keep which-features-exist in the backend.

## Acceptance Criteria

- The public page renders no hardcoded feature list.
- Every advertised feature exists in the catalogue.
- Every visible catalogue feature is reachable on the page.
- Internal vocabulary does not appear in customer-facing copy.

## Regression Coverage

`services/api/src/modules/billing/public-feature-catalog.spec.ts` — REG-019.
Asserts every plan grants only catalogue features, every catalogue feature
carries the metadata the page renders, the seeded plans nest, and the top plan
grants every visible feature (so no comparison row is unreachable).

## Dependencies

Wave 1's commercial configuration API.

## Related Items

[[BUG-0027]] · [[BUG-0028]] — the same shape in pricing rather than features.

## Resolution

Fixed on `agent/public-commercial-wave2`. `/features` and `/plans` now render
from `featureCatalog` returned by `GET /api/public/commercial-config`. The
landing app keeps only category storytelling prose, which is genuinely its own.

## QA Retest

`docs/qa/runs/2026-08-16-public-commercial-wave2-7686bb0.md`.

## History

- 2026-08-16 — found during Wave 2 discovery, fixed in the same wave.
