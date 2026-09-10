---
ID: BUG-3176
aliases: [BUG-3176]
Title: The Employees list search box, and every server-mode DataTable instance, never reaches the backend and only filters the already-loaded page
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [apps/web, apps/admin]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3176 — The Employees list search box, and every server-mode DataTable instance, never reaches the backend and only filters the already-loaded page

## Summary

The Employees list search box, and every server-mode DataTable instance, never reaches the backend and only filters the already-loaded page

Identified by the 2026-09-10 full technical audit as FE-06 (confidence: FE-06=CONFIRMED).

## Expected Behavior

The visible search input should either be wired to the existing `search` URL param (real, already-supported backend capability) the way column filters are, or be relabeled/restyled clearly enough that "current page only" is obvious rather than discoverable only in a placeholder string.

## Actual Behavior

With the default page size of 10 (`employees/page.tsx:77`, `getPositiveNumberParam(params.pageSize, 10)`) or any page size up to the server's `@Max(100)` ceiling, a user typing an employee's name into the visible search field only filters the ≤100 rows already on screen — not the tenant's full employee set. On a 10,000-employee tenant this returns confidently-wrong "no results" for any employee not on the current page, with no indication to the user that the search was incomplete.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**FE-06** (`apps/web/app/components/data-table/data-table.tsx`, `apps/web/app/(authenticated)/employees/page.tsx`):

`apps/web/app/components/data-table/data-table.tsx:184` — `searchRows(rows, columns, search)` runs locally against whatever `rows` prop is already in memory, unconditionally on `mode`.
  `apps/web/app/components/data-table/data-table.tsx:461-471` — the search placeholder is literally `"Quick filter current page"` in server mode (`mode === "server" ? "Quick filter current page" : searchPlaceholder`), i.e. the UI's own copy admits the limitation, but the visible search box gives no indication this differs from a full search.
  `apps/web/app/(authenticated)/employees/page.tsx:83-84` builds and forwards a `search` query param to `/employees` and `EmployeeQueryDto.search` exists end-to-end on the backend — but no control in the rendered UI (`ModuleCommandBar`/list shell, grepped, no matches) ever writes to that URL param; only the per-column filter "Apply" button does.

---


Full finding text: FE-06 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

This reads as a performance non-issue (search is instant because it never leaves the browser) but is actually a data-integrity risk: an HR user searching for an employee who is not on the currently-loaded page will conclude the employee doesn't exist. This affects every screen using `DataTable` in server mode with a full dataset larger than one page — Employees is the most consequential instance given the explicit "10,000 employees" scenario this task was asked to trace.

## Affected Areas

apps/web, apps/admin

## Proposed Resolution

In `apps/web/app/components/data-table/data-table.tsx`, when `mode === "server"`, debounce the search input and push it to the URL `search` param (the same `router.push` pattern already used for sort/column-filters at lines 299-364) instead of/in addition to the local quick-filter, so it reaches `employees/page.tsx`'s existing `search` handling.

(Difficulty: MEDIUM; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `apps/web/app/components/data-table/data-table.tsx`, `apps/web/app/(authenticated)/employees/page.tsx` (audit id FE-06).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: FE-06=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `FE-06` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (FE-06) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[platform-admin]]

<!-- GRAPH:END -->
