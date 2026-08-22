---
ID: BUG-0352
aliases: [BUG-0352]
Title: The tenant timeline rendered every entry with no count and no paging
Status: VERIFIED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: 0d10a9d
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-183
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/ux-round-two
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-21
---

# BUG-0352 — The tenant timeline rendered every entry with no count and no paging

## Summary

The Timeline panel on a tenant record rendered every entry the endpoint
returned, in one list, with no total and no way to move through it. On a tenant
a few weeks old that is 154 rows, and it only grows.

## Expected Behavior

A history panel says how many entries there are and shows a bounded page of
them, so the panels below it stay reachable and "is this all of it?" has an
answer on screen.

## Actual Behavior

One unbounded `<ol>`. The category chips carried per-category counts, so the
total could be inferred by reading the "All" chip — which is not the same as
being told, and says nothing about how much of it is currently visible.

## Reproduction

Open `/tenants/<id>` for a tenant with substantial history and select Timeline.

## Evidence

- `apps/admin/app/_components/tenants/tenant-timeline-panel.tsx` (before) —
  `items.map(...)` over the full filtered array, with no slice and no pager.
- Reported screenshot: chips reading "All 154 / System 146" above a list with no
  end in view.

## Root Cause

The panel fetches the whole timeline in one request and rendered exactly what it
received. Nothing was wrong at the data layer; the view simply had no notion of
a page, which is easy to leave out while a tenant is new and impossible to
notice until one is not.

## Impact

Platform operators reviewing tenant history. Non-blocking — everything is
present — but the panels below Timeline sit beneath an arbitrarily long list,
and any category other than the first requires scrolling past everything above
it.

## Affected Areas

`apps/admin` — `app/_components/tenants/tenant-timeline-panel.tsx`.

## Proposed Resolution

Page the already-fetched list at 25 entries, show "Showing 1–25 of 154", and
reset to the first page when the category filter changes. Compute the window
rather than storing it, so a page number that outlives its list cannot render an
empty panel above rows that exist.

## Acceptance Criteria

- The panel states the total and which part of it is on screen.
- Previous/Next appear only when there is more than one page, and are disabled
  at the ends.
- Changing the category filter returns to the first page.
- A page number left over from a longer list clamps into range rather than
  rendering nothing.

## Regression Coverage

REG-183 — `apps/admin/lib/list-paging.spec.ts` covers the window arithmetic,
including the clamp and full coverage of every row across all pages.

## Dependencies

None.

## Related Items

[[BUG-0314]] — the notification feed, the other unbounded admin list surface.

## Resolution

Fixed on `agent/ux-round-two`. Paging arithmetic extracted to
`apps/admin/lib/list-paging.ts` and the panel wired to it.

## QA Retest

Not opened in a browser. The arithmetic is asserted; the rendered pager is not.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-183 names `apps/admin/lib/list-paging.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, apps/admin   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-21 — reported as "Make sure Timeline has a number of record show and
  pagination".
