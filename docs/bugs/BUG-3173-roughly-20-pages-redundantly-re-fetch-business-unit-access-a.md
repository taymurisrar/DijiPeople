---
ID: BUG-3173
aliases: [BUG-3173]
Title: Roughly 20 pages redundantly re-fetch business-unit access and current-employee context the shell layout already loaded
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3173 — Roughly 20 pages redundantly re-fetch business-unit access and current-employee context the shell layout already loaded

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** Twenty pages re-fetching the same access context is the frontend half of BUG-3165 and should be solved with it, not separately.

## Summary

Roughly 20 pages redundantly re-fetch business-unit access and current-employee context the shell layout already loaded

Identified by the 2026-09-10 full technical audit as FE-02 (confidence: FE-02=CONFIRMED).

## Expected Behavior

`getBusinessUnitAccessSummary` and `getCurrentEmployee` should be wrapped in React's `cache()` (as `getResolvedTenantSettings` already is), so the layout's call and any page's call collapse into a single request-scoped fetch.

## Actual Behavior

For any of these ~20+ pages, `/organization-access/me` and/or `/employees/me/context` are fetched **twice** in the same render — once in `(authenticated)/layout.tsx`'s `Promise.all`, once again in the page component — each a fresh HTTP round trip to the NestJS API that independently pays the full authentication/access-context chain ORCH-04 measured at ~26 DB round trips. `getResolvedTenantSettings` in the very same layout file (`layout.tsx:139`) already demonstrates the fix (`const getResolvedTenantSettings = cache(() => apiRequestJson(...))`, per CACHE-11) — the pattern exists in the codebase but was not applied to these two helpers.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**FE-02** (`apps/web/app/(authenticated)/layout.tsx`, `apps/web/app/(authenticated)/_lib/business-unit-access.ts`, `apps/web/app/(authenticated)/_lib/current-employee.ts`, and ~20 page components):

`apps/web/app/(authenticated)/layout.tsx:122-158` — a single `Promise.all` that already fetches, for **every** authenticated page render: `/tenant-settings/features/availability`, `getCurrentEmployee()` (→ `/employees/me/context`), `getResolvedTenantSettings()` (→ `/tenant-settings/resolved`, wrapped in React `cache()`), `getBusinessUnitAccessSummary()` (→ `/organization-access/me`), `/timesheets/access-restriction`, and `/navigation/sidebar`.
  `apps/web/app/(authenticated)/_lib/business-unit-access.ts:21-25` — `export async function getBusinessUnitAccessSummary() { return apiRequestJson<BusinessUnitAccessSummary>("/organization-access/me")... }` — a plain function, **not** wrapped in React `cache()`.
  `apps/web/app/(authenticated)/_lib/current-employee.ts:9-11` — same: `getCurrentEmployee()` calls `apiRequestJson("/employees/me/context")` directly, also not `cache()`-wrapped.
  Because `apiRequestJson` merges an `AbortController` signal into every fetch (`apps/web/lib/server-api.ts:139`), Next's automatic per-render fetch-request memoization does not apply (this is the same mechanism CACHE-11 documented for `/tenant-settings/resolved`) — so every additional call site is a guaranteed second network round trip, not a deduped one.
  Page-level call sites of `getBusinessUnitAccessSummary()` found via `grep -rn "getBusinessUnitAccessSummary()" apps/web/app --include=*.tsx`: `attendance/page.tsx:44`, `attendance/team/page.tsx:40`, `customers/page.tsx:33`, `employees/new/page.tsx:26`, `employees/page.tsx:38`, `leaves/approvals/page.tsx:8`, `leaves/page.tsx:27`, `onboarding/page.tsx:21`, `projects/page.tsx:23`, `recruitment/applications/page.tsx:20`, `recruitment/candidates/new/page.tsx:24`, `recruitment/candidates/page.tsx:21`, `recruitment/jobs/new/page.tsx:24`, `recruitment/jobs/page.tsx:25`, `recruitment/page.tsx:57`, `recruitment/talent-pool/page.tsx:21`, `reports/page.tsx:37`, `timesheets/approvals/page.tsx:28`, `timesheets/page.tsx:37`, `users/page.tsx:34` — **20 page-level call sites**, all in addition to the layout's own call.
  Page-level call sites of `getCurrentEmployee()`: `attendance/page.tsx`, `employees/page.tsx`, `employees/[employeeId]/page.tsx`, `leaves/page.tsx`, `my-profile/page.tsx`, `timesheets/page.tsx` — **6 more call sites**, again on top of the layout's own call.

---


Full finding text: FE-02 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

On the ~20 affected pages, every request pays roughly double the ORCH-04 auth tax just from this one duplication (on top of whatever else the page fetches) — a real, broad latency and database-load cost, worse in aggregate than the single-endpoint duplication CACHE-11 flagged because it recurs across two endpoints and twenty call sites rather than one.

## Affected Areas

apps/web

## Proposed Resolution

Wrap `getBusinessUnitAccessSummary` (`apps/web/app/(authenticated)/_lib/business-unit-access.ts:21`) and `getCurrentEmployee` (`apps/web/app/(authenticated)/_lib/current-employee.ts:9`) in `cache()` from `react`, exactly as `getResolvedTenantSettings` already is at `apps/web/app/(authenticated)/layout.tsx:139`. No caller changes needed.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `apps/web/app/(authenticated)/layout.tsx`, `apps/web/app/(authenticated)/_lib/business-unit-access.ts`, `apps/web/app/(authenticated)/_lib/current-employee.ts`, and ~20 page components (audit id FE-02).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: FE-02=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `FE-02` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (FE-02) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
