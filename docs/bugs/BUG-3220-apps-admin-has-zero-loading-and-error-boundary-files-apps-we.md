---
ID: BUG-3220
aliases: [BUG-3220]
Title: apps/admin has zero loading and error boundary files; apps/web has 22 genuinely uncovered pages including login
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: UX
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 4c86a29b
AffectedModules: [apps/admin, apps/web]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-25
ResolvedAt:
---

# BUG-3220 — apps/admin has zero loading and error boundary files; apps/web has 22 genuinely uncovered pages including login

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

apps/admin has zero loading and error boundary files; apps/web has 22 genuinely uncovered pages including login

Identified by the 2026-09-10 full technical audit as FE-10 (confidence: FE-10=CONFIRMED).

## Expected Behavior

Per `AGENTS.md`, "Loading / error / empty states are mandatory for every data surface."

## Actual Behavior

Admin relies entirely on Next.js's default (unstyled, generic) loading/error UI on every screen. Web's login page — the first screen every user and every tenant-branded workspace visitor sees — has no custom loading or error handling despite making a server-side branding fetch that can fail (`apps/web/app/(public)/login/page.tsx:85-88` already handles a resolve failure gracefully in the page body, which somewhat mitigates the missing `error.tsx`, but there is still no `loading.tsx` for the branding fetch's latency).

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**FE-10** (`apps/admin/app/`, `apps/web/app/`):

`apps/admin/app/`: 88 `page.tsx`, **0** `loading.tsx`, **0** `error.tsx` anywhere in the tree (confirmed via `find apps/admin/app -iname loading.tsx` / `-iname error.tsx`, zero hits) — including `apps/admin/app/(internal)/tenants/page.tsx` and the customers screen, the two screens this task specifically traced.
  `apps/web/app/`: 259 `page.tsx`, only 4 `loading.tsx`/`error.tsx` pairs exist (`apps/web/app/(authenticated)/loading.tsx` + `error.tsx` covering the whole route group, plus 3 more specific overrides for `employees/`, `leaves/`, `reports/`). Because Next's file convention applies a group-level `loading.tsx`/`error.tsx` to every nested segment that doesn't define its own, 237/259 pages are effectively covered by the one group-level pair.
  The remaining **22 pages have no `loading.tsx`/`error.tsx` at their own path or any ancestor**: the entire partner portal (8 pages: `apps/web/app/partner/page.tsx` and 7 siblings), all public auth pages (`apps/web/app/(public)/login/page.tsx`, `partner-login/page.tsx`, `activate/page.tsx`, `reset-password/page.tsx`), all workspace-state pages (6, under `apps/web/app/workspace/`), and `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/[...path]/page.tsx`, `apps/web/app/activate-account/page.tsx`, `apps/web/app/t/[tenantSlug]/login/page.tsx`.

---


Full finding text: FE-10 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Admin operators see Next's default error screen (no DijiPeople chrome, no actionable message) on any of the 88 pages if a request fails. On web, the partner portal (external partner users, not internal tenant staff) has no loading/error handling at all — the audience least likely to tolerate a raw Next.js error page.

## Affected Areas

apps/admin, apps/web

## Proposed Resolution

Add a route-group-level `loading.tsx`/`error.tsx` pair to `apps/admin/app/(internal)/` mirroring `apps/web/app/(authenticated)/`'s pattern (one file covers most of the 88 pages, same low-cost/high-coverage approach already proven in web). Add equivalents under `apps/web/app/partner/`, `apps/web/app/(public)/`, and `apps/web/app/workspace/`.

(Difficulty: LOW; Regression risk: LOW; Fix now: NO)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `apps/admin/app/`, `apps/web/app/` (audit id FE-10).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: FE-10=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `FE-10` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FE.md`

## Resolution

Partially resolved. TASK-0032 WP-08 (`agent/pah-wp08-admin-crud`, commit
`9baf16e1`, merged as `b967aae1`) added
`apps/admin/app/(internal)/loading.tsx` and `error.tsx` — a route-group-level
pair mirroring `apps/web`'s `(authenticated)/` pattern, covering all 88 pages
under `(internal)/` with a skeleton loading state and a status/message-
derived error screen instead of Next's default. This closes the `apps/admin`
half of this record. The `apps/web` half — the 22 genuinely uncovered pages
(partner portal, public auth pages including login, workspace-state pages,
dashboard) — is **unchanged** and remains open; this record stays
`DEFERRED` rather than closing, since half its named scope is still exactly
as described in Actual Behavior.

## QA Retest

The admin half is verified by TASK-0032 WP-09 live QA ("Admin screens …" rows:
no failed calls, no console errors, checked at 1440/768/390px — see
`docs/tasks/TASK-0032-streams/QA-summary.md`); no QA run covers the remaining
`apps/web` pages, which is outstanding.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (FE-10) at `4c86a29b`.
- 2026-09-25 — TASK-0032 WP-08 added the `apps/admin` route-group loading/error
  pair (commit `9baf16e1`, merged `b967aae1`), closing the `apps/admin` half;
  the `apps/web` half (22 pages) remains unaddressed and this record stays
  `DEFERRED` for that scope.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[tenant-application]]

<!-- GRAPH:END -->
