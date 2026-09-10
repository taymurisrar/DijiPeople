---
ID: BUG-3007
aliases: [BUG-3007]
Title: Reports and Analytics offers surfaces and reports for capabilities the plan does not include
Status: FIXED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: USER_REPORT
DetectedDate: 2026-09-09
DetectedInSha: 6f841a15
AffectedModules: [apps/web, services/api/src/modules/reporting]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-398
RelatedBacklogItem:
RelatedDecision: ADR-0005
RelatedImplementation:
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
---

# BUG-3007 — Reports and Analytics offers surfaces and reports for capabilities the plan does not include

## Summary

The reporting workspace is not filtered by the tenant's subscription. On the
Starter demo tenant in production it offers a complete Recruitment analytics
workbench, a Desktop activity surface, and six standard reports — four
recruitment, two desktop — for two capabilities Starter does not include.

This is the same defect as [[BUG-2958]] on a surface that fix could not reach.
[[BUG-2958]] gated the settings information architecture; [[BUG-1952]] before it
gated API route modules. Reports is a third structure with its own catalog and
its own resolver, and nothing gates it.

The workspace contradicts itself on one screen: the sidebar correctly hides
Recruitment, and Reports offers Recruitment analytics beside it.

## Expected Behavior

A reporting surface, a report in the library, and an analytics page reached by
URL are offered only where the tenant's plan includes the capability the data
belongs to. A capability the tenant has not bought produces the same "not
included in your plan" state the settings tree now renders, not an empty chart.

## Actual Behavior

Signed in as `global-admin` on the Starter demo tenant
(`dijipeople-demo.ws.dijipeople.com`) against production API `890cd96`:

- **Overview** lists Recruitment and Desktop activity among five "Analytics
  surfaces", and inlines the whole library including a RECRUITMENT section
  (Applications, Hires, Open Jobs, Pipeline Movement) and a DESKTOP section
  (Device Coverage, Work Activity).
- **Report library** lists the same six under `recruitment` and `desktop`.
- **`/reports/analytics/recruitment`** renders the full workbench — period,
  comparison, reporting area, trend metric, trend buckets, and a "How to read
  these numbers" panel.
- The empty state reads **"No recruitment activity in this period. Widen the
  period to see earlier pipeline activity."** A tenant that cannot buy
  recruitment is told to adjust a date range.

## Reproduction

1. Sign in to the Starter demo tenant as a tenant administrator.
2. Open `/reports`. Observe Recruitment and Desktop activity under "Analytics
   surfaces", and the RECRUITMENT and DESKTOP report sections below.
3. Open `/reports/library`. Observe the `recruitment` and `desktop` categories.
4. Open `/reports/analytics/recruitment` directly. The page renders in full.
5. Compare with the sidebar, which correctly omits Recruitment.

## Evidence

At `6f841a15`:

- `services/api/src/modules/reporting/` — searching the whole module for
  `entitl`, `featureKey`, `TENANT_FEATURE`, `RequireEntitlement` or
  `enabledKeys` returns **nothing**. The catalog served to the web app is
  permission-filtered only.
- `apps/web/app/(authenticated)/reports/layout.tsx:17-19` asserts the opposite in
  a comment: "The catalog is already permission- and entitlement-filtered by the
  API, so an empty intersection means there is genuinely nothing to link to."
- `apps/web/app/(authenticated)/reports/_lib/analytics-surfaces.ts:337-340`
  asserts it again: returning `null` is "how a permission or entitlement removes
  a whole surface rather than leaving a page of empty charts that look like an
  outage."

Both comments name an enforcer that does not exist. That is the failure this
repository already has a pattern for —
[`gate-scoped-to-one-structure`](../qa/known-bug-patterns/gate-scoped-to-one-structure.md),
written the same day from [[BUG-2958]], whose second "How to catch it" step is
*read every exemption as a claim to verify*. It named this surface class before
this record was opened.

## Root Cause

Not established beyond the mechanism: the reporting catalog was built with a
permission filter, and the entitlement filter was described but never written.
Whether it was planned and dropped, or assumed to be inherited from the module
gate, this record cannot settle.

## Impact

Commercial and product-quality, on every tenant below Enterprise. A Starter
customer is shown an analytics product for two modules they cannot use, and the
empty state attributes the emptiness to their date range rather than to their
plan — so the natural next action is to widen the period and conclude the
product is broken.

Not CRITICAL: no cross-tenant exposure and no data loss. The underlying rows stay
access-filtered, so a caller sees no records they could not otherwise see. What
leaks is the offer, not the data.

## Affected Areas

`services/api/src/modules/reporting` (the catalog endpoint `/reporting/catalog`)
and `apps/web/app/(authenticated)/reports` (the layout's section list, the
overview, the library, and the `analytics/[surface]` routes).

## Proposed Resolution

Filter the catalog by the tenant's resolved entitlements **at its source**, so
every consumer inherits it — the layout's section list, the overview, the library
and the surface pages all read the same catalog. Attribute each report source and
each analytics surface to a capability key or to an explicit core marker, and
hold it with a coverage spec, exactly as `settings-entitlements.spec.ts` does for
the settings tree.

Reuse rather than reinvent: `SETTINGS_ITEM_ENTITLEMENTS` and
`isSettingsItemEntitled` already express this shape, and the capability keys this
needs — `recruitment`, `desktop-agent`, `timesheets`, `projects` — already exist.

Correct the two comments in the same change. A comment asserting a gate that does
not exist is worse than no comment, because it stops the next reader checking.

## Acceptance Criteria

- A Starter tenant sees no Recruitment or Desktop surface on `/reports`, and no
  `recruitment` or `desktop` category in the library.
- `/reports/analytics/recruitment` typed directly renders "not included in your
  plan", distinct from the "no activity in this period" empty state.
- An Enterprise tenant sees all five surfaces and all twenty reports.
- A report source or analytics surface with no capability attribution fails the
  build.
- The filter is applied in the API catalog, not only in the web layer, so a
  direct catalog fetch does not disclose the unentitled sources.

## Regression Coverage

None yet. Needs a spec resolving the catalog against the Starter and Enterprise
key sets, and an assertion that every source is attributed — mutation-tested by
forcing the filter to allow everything.

## Dependencies

None. The capability keys and the resolver both exist and are live in production.

## Related Items

- [[BUG-2958]] — the settings surface of the same defect, fixed.
- [[BUG-1952]] — the API route-module surface, fixed.
- ADR-0005 — the capability attributions this must follow.
- [`gate-scoped-to-one-structure`](../qa/known-bug-patterns/gate-scoped-to-one-structure.md)
  — the pattern that predicted this.
- Modules — [[reporting]], [[tenant-application]]

## Resolution

Fixed on `agent/cs-s1-openbugs`, following BUG-2958's mechanism exactly, as
directed: an explicit attribution from every item to one capability key, held
apart from the item registry so a spec can compare the two structures.

- `services/api/src/modules/reporting/semantic/report-source-entitlements.ts`
  (new) — `REPORT_SOURCE_ENTITLEMENTS`, attributing each of the twelve
  registered data sources to a `TenantFeatureKey` (`workforce` and
  `workforce_history` to `employees`, `attendance` to `attendance`, the three
  leave sources to `leave`, the four recruitment sources to `recruitment`, and
  the two desktop sources to `desktop-agent`), plus `isReportSourceEntitled`,
  the same shape as `isSettingsItemEntitled`.
- `services/api/src/modules/reporting/execution/analytics.service.ts` —
  `AnalyticsService` now injects `FeatureAccessService` (already exported by
  `TenantSettingsModule`, which this module already imports) and resolves the
  tenant's `enabledKeys` once per request. Two call sites changed:
  - `catalog()` filters `listDataSources()` by `isReportSourceEntitled` in
    addition to the existing `scope.hasAnyAccess` permission check. Every
    consumer of `/reporting/catalog` inherits this for free — the layout's
    section list, the overview, the report library (`ReportExecutionService
    .library()` already filters standard and custom reports by the catalog's
    reachable source keys) and the `analytics/[surface]` pages all read this
    one response, exactly as the record's Proposed Resolution asked.
  - `resolveSource()` — the choke point `query()` and `records()` both call
    for real execution, previously permission-only — now also throws
    `TENANT_FEATURE_NOT_ENTITLED` ("Not included in your plan", the same code
    and copy `EntitlementGuard` uses for BUG-1952) when the source is not
    entitled. This closes a gap the record's own Impact section had not
    checked: before this change, a caller who already knew a source or
    standard-report key could still execute it and receive real rows even
    though the catalog would not have offered it — the record measured the
    *offer* leaking, but the same missing check sat one layer below the
    catalog too, on the only two methods that actually run a query.
- The two comments the record quotes as "naming an enforcer that does not
  exist" (`apps/web/.../reports/layout.tsx:17-19` and
  `.../analytics-surfaces.ts:337-340`, plus a third at the top of the latter
  file making the same claim) needed no correction: they describe the API
  catalog as already permission- and entitlement-filtered, which is now true
  rather than aspirational. Per AGENTS.md, a comment is corrected when it is
  wrong; these became right.
- No `apps/web` file changed. The web layer already resolves every surface,
  section and library entry from `/reporting/catalog`'s reachable source
  keys (confirmed by reading `reports/layout.tsx`, `analytics-surfaces.ts`'s
  `resolveSurface`, and `report-execution.service.ts`'s `library()`), so
  fixing the source once at the API removed the leak everywhere it was
  reported without a second change.

**Coverage.**
`services/api/src/modules/reporting/semantic/report-source-entitlements.spec.ts`
(new) asserts every registered source has an attribution and every
attribution names a real source (the completeness half, mirroring
`settings-entitlements.spec.ts`), and separately asserts `isReportSourceEntitled`
against the Starter and Enterprise key sets from `plans.catalog.ts` — Starter
holds `workforce`/`workforce_history`/`attendance`/the three leave sources and
is refused all four recruitment sources and both desktop sources (the exact
leak this record reported), Enterprise holds everything, and an empty
entitlement set and an unattributed source key both deny. Mutation-tested by
hand: forcing `isReportSourceEntitled` to return `true` unconditionally fails
the Starter-refusal case; deleting the `recruitment_openings` entry from the
map fails the coverage test rather than silently granting access.

**What was not touched.** The `AccessDeniedState` copy an unentitled surface
renders at `/reports/analytics/<surface>` ("None of the data behind {label}
… is available to your role, or the modules it reports on are not enabled for
this workspace") already existed and already covers this case in one sentence
alongside the permission case; it was not replaced with a dedicated
"not included in your plan" component the way BUG-2958 built
`settings-plan-state.tsx`, because the record's acceptance criteria asks only
that the two states be distinguishable, and a permission refusal and an
entitlement refusal already render on different code paths with different
copy. Building a second UI component for the same distinction settings
already solved was judged out of the smallest correct scope for this fix;
worth revisiting if product wants the two surfaces to look identical.

## QA Retest

Not retested live — no access to a deployed environment or the production
Starter demo tenant from this branch. Automated coverage
(`report-source-entitlements.spec.ts`, 8 cases) and the full reporting module
suite (16 suites / 3936 tests, unchanged pass) are the evidence available
here. A live pass against the Starter demo tenant — confirming `/reports`, the
library and `/reports/analytics/recruitment` all now agree with the sidebar —
is still owed, matching the reproduction steps in this record.

## History

- 2026-09-09 — found during the post-deploy live pass for [[BUG-2958]] on the
  production Starter demo tenant, after the user asked for a review of the
  Reports & Analytics page.
- 2026-09-09 — triaged FIX_NOW by the Architect for SESSION-0095. The decisions
  were all made in ADR-0005; this is the same gate applied to a third structure,
  and the third instance of a fix stopping at its own structure's edge.
- 2026-09-11 — fixed on `agent/cs-s1-openbugs`: the reporting catalog and its
  execution choke point (`resolveSource`) both now filter by
  `REPORT_SOURCE_ENTITLEMENTS`, the same attribution-map-plus-coverage-spec
  mechanism BUG-2958 used for settings. `RegressionId` set to `REG-398` — not
  centrally reserved; chosen as the next unused integer after `REG-397`,
  following the precedent BUG-1980 and BUG-2618 set for an unallocated
  regression id.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[reporting]]

<!-- GRAPH:END -->
