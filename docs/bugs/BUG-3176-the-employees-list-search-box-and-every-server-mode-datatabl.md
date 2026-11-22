---
ID: BUG-3176
aliases: [BUG-3176]
Title: The Employees list search box, and every server-mode DataTable instance, never reaches the backend and only filters the already-loaded page
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [apps/web, apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-715
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt: 2026-11-22
---

# BUG-3176 — The Employees list search box, and every server-mode DataTable instance, never reaches the backend and only filters the already-loaded page

> **Architect triage, 2026-09-11 — `FIX_NOW`.** A search box that does not reach the server on a server-mode table is a wiring defect users hit immediately.

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

In server mode the search box only filtered the rows already on the current page, so a record on another page could never be found and the search appeared to work.

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

apps/web/app/components/data-table/data-table-server-search.spec.ts. REG-715, QA-RUNTIME-049. The helper is unit-tested for no navigation on initial render or unchanged text, page reset, parameter preservation and encoding.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `FE-06` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`

## Resolution

In server mode the typed text is sent as the search URL parameter after a 300 ms pause (reset to page 1, restored from the URL on reload, cleared by Clear). The local current-page filter stays as instant feedback and as the fallback for a list whose API takes no search parameter. The URL logic is a pure helper with its own tests; the component itself has no rendering test because apps/web has no jsdom setup, so the debounce wiring is verified by typecheck and review, not by a rendered test. A browser check against the Employees list is still owed (WP5).

Fixed on branch agent/dependency-alert-remediation (SESSION-0137). Premise re-verified against the code before changing it (2026-11-22).

## QA Retest

QA-RUNTIME-049 on the isolated database, 2026-11-22: passing with the fix and failing with it removed. Independent review pending.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (FE-06) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[platform-admin]]
- Regression — REG-715 (see the regression register)

<!-- GRAPH:END -->
