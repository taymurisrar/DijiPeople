---
ID: BUG-3174
aliases: [BUG-3174]
Title: Every pagination, sort or filter click on a runtime list page re-executes the whole server-side call fan-out, not just the list query
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [apps/web, apps/admin]
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

# BUG-3174 — Every pagination, sort or filter click on a runtime list page re-executes the whole server-side call fan-out, not just the list query

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** Re-executing on every pagination or sort click is the runtime list contract; changing it touches every module that uses it.

## Summary

Every pagination, sort or filter click on a runtime list page re-executes the whole server-side call fan-out, not just the list query

Identified by the 2026-09-10 full technical audit as FE-03 (confidence: FE-03=CONFIRMED).

## Expected Behavior

Data that does not vary with the pagination/sort/filter state (session, current-employee context, business-unit access, tenant settings, table views) should be memoized per request (FE-02) and, more importantly, should not need to be part of the RSC payload recomputed on every list interaction — e.g. by isolating the paginated table behind its own data fetch (client-side fetch to a route handler, or a nested Suspense boundary/parallel route) rather than making the whole page server component re-render on every URL change.

## Actual Behavior

Because nothing in this render path is cached (FE-01/CACHE-11: `cache: "no-store"` throughout) and the pagination/sort/filter UI is implemented as full Next.js navigations to the same server component, changing the page number on the Employees list re-executes `getSessionUser`, `getCurrentEmployee`, `getBusinessUnitAccessSummary`, the tenant-settings fetch, and the table-views fetch — five calls that did not need to change — alongside the one that did.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**FE-03** (`apps/web/app/(authenticated)/employees/page.tsx`, `apps/web/app/components/data-table/data-table-pagination.tsx`, and any of the 61 runtime-driven pages using the same pagination pattern):

`apps/web/app/components/data-table/data-table-pagination.tsx:90-127` — pagination controls render `<Link href={buildHref(...)}>`, and `apps/web/app/components/runtime/module-data-table.tsx` / `apps/web/app/components/data-table/data-table.tsx:299-364` drive sort and column-filter changes via `router.push`/`router.replace` with updated search params — genuine Next.js navigations, not client-side array operations.
  `apps/web/app/(authenticated)/employees/page.tsx:35-39,106-121` — on every render (i.e. every navigation triggered by the above), the page re-runs `Promise.all([getSessionUser(), getCurrentEmployee(), getBusinessUnitAccessSummary()])` and then a second `Promise.all([employees list, apiRequestJson("/tenant-settings/resolved"), getTableViews("employees")])` — six distinct backend calls, none cached (FE-02, CACHE-11), all re-issued for a page-2 click that only actually needed a new `/employees?page=2` response.

---


Full finding text: FE-03 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Every click a user makes on a large employee/timesheet/attendance list multiplies backend load by the page's full fan-out (up to 6x on Employees) rather than the 1x the interaction actually requires — compounds directly with ORCH-04's per-request cost.

## Affected Areas

apps/web, apps/admin

## Proposed Resolution

At minimum, apply FE-02's `cache()` fix so five of the six calls collapse to zero marginal cost on a same-render navigation. As a structural fix, consider moving the paginated table's data fetch to a client-side call against a dedicated route handler (or a streamed child Suspense boundary) so only the table itself re-fetches on page/sort/filter changes, leaving session/settings/access data untouched by the URL change.

(Difficulty: MEDIUM; Regression risk: MEDIUM (changes the rendering strategy of the runtime list pattern used by 61 pages); Fix now: LATER — land FE-02 first (LOW risk, immediate partial relief), treat the structural fix as a follow-up plan.)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `apps/web/app/(authenticated)/employees/page.tsx`, `apps/web/app/components/data-table/data-table-pagination.tsx`, and any of the 61 runtime-driven pages using the same pagination pattern (audit id FE-03).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: FE-03=MEDIUM (changes the rendering strategy of the runtime list pattern used by 61 pages). Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `FE-03` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (FE-03) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[platform-admin]]

<!-- GRAPH:END -->
