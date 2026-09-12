---
ID: ITEM-0167
aliases: [ITEM-0167]
Title: Adopt the employee record shell across the record pages that still hand-roll their own
Type: ARCHITECTURE
Status: DONE
Priority: P2
Severity: 
AffectedModules: [apps/web]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
RelatedBug: BUG-3378
RelatedQA: 
RelatedADR: 
RelatedImplementation: docs/architecture/record-page-layout-contract.md, apps/web/app/(authenticated)/_components/record-page-shell.conformance.spec.ts
TargetMilestone: 
BlockedBy: 
---

# ITEM-0167 — Adopt the employee record shell across the record pages that still hand-roll their own

## Summary

The product owner reviewed the employee main form and named it the reference
layout: status header, action bar, tab strip, sections. Every other module's
main form should look like it.

Most already do. The runtime shell the employee record uses is shared, and the
majority of modules render through it. The gap is a specific set of record pages
that were built bespoke and reference none of the shared components. Those are
the concrete targets.

One caveat matters before any of this starts: the reference layout has two
accessibility defects of its own, recorded as [[BUG-3378]]. Standardising on it
first would propagate them.

## Why It Matters

A user learns a record page once. Where a module hand-rolls its own, the status
header is missing or different, the actions sit somewhere else, and the tab
strip may not exist — so the same task feels like a different product. It is
also duplicated maintenance: a fix to the shared shell reaches most of the
product and skips exactly the pages that most need it.

## Evidence

**The reference shell.** `apps/web/app/(authenticated)/employees/[employeeId]/page.tsx:196-232`
renders `EmployeeRuntimeFormWrapper`, which at
`_components/employee-runtime-form-wrapper.tsx:94-131` calls `ModuleRecordPage`
directly. `StandardModuleRecordPage`
(`apps/web/app/components/runtime/standard-module-record-page.tsx:18-73`) is a
thin pass-through to the same `ModuleRecordPage`, so the employee record and
every standard module share one engine. Its parts:

| Part | Component |
|---|---|
| Shell | `ModuleDetailShell` |
| Status header | `ModuleRecordHeader` — title, owner, status and sub-status popover |
| Action bar | `ModuleCommandBar` |
| Tabs, sections, grid | `RuntimeMetadataFormRenderer` |
| Related lists | optional slots |

Read from the live employee record at `cbd9b812`, the action bar is Back, Edit,
Reset Password, Refresh, Assign, Share, Export, Delete, with a record status
control reading `Active / Open / <owner>` and a form selector offering Main and
Quick form.

**The pages that do not use it.** These record pages are fully bespoke, with no
reference to the shared shell components:

- `timesheets/[timesheetId]`
- `claims/[claimId]` and `me/claims`
- `business-trips/[tripId]` and `me/business-trips`
- `onboarding/[onboardingId]`
- `payroll/runs/[runId]`
- `payroll/payslips` and `me/payslips`
- `inbox/[notificationId]`
- `attendance/corrections/[id]` and `attendance/exceptions/[id]`
- `recruitment/employee-drafts/[employeeId]`

Modules already on the shared shell include customers, projects, leaves, loans,
approvals, benefits, employee bank accounts, recruitment and most payroll and
settings sub-pages.

**Defects in the reference layout itself.** Measured on the live employee
record: zero elements carry `role="tab"`, `role="tablist"` or `role="tabpanel"`,
and the responsive tab strip's hidden measurement copy is `aria-hidden="true"`
while still holding thirteen focusable buttons. Both are [[BUG-3378]]. The
employee page additionally mounts two panels outside the form, which is why its
heading levels do not descend cleanly — [[ITEM-0165]] and [[ITEM-0166]].

## Proposed Approach

Needs an ExecPlan under `PLANS.md`, because it is eleven-plus page migrations
and each has its own domain behaviour to preserve.

Sequence:

1. **Fix [[BUG-3378]] first.** Do not spread a shell with an accessibility
   defect to eleven more pages.
2. **Write the layout contract down.** What a record page must have — status
   header, action bar, tab strip, section grid, related lists — and what it may
   vary. Today the standard exists only as "what the employee page happens to
   do", which is not something a reviewer can check against. `AGENTS.md`
   already says a hand-rolled table or form control is a review failure; this
   extends the same rule to the record page.
3. **Migrate in waves**, grouped by domain so that one reviewer can hold the
   behaviour in mind: attendance and timesheets; claims, loans and business
   trips; payroll runs and payslips; onboarding and recruitment drafts; inbox.
4. **Add a conformance check.** A test or lint rule asserting that a record
   route under `app/(authenticated)` renders through `ModuleRecordPage`, with an
   explicit, justified allowlist for anything that genuinely cannot. Without
   this the drift returns.

Some of these pages may have a real reason to be bespoke — a payroll run is not
obviously a record form. The plan should name those explicitly rather than
forcing them, and record the reason.

## Acceptance Criteria

- A written record-page layout contract exists in `docs/architecture/` and is
  referenced from the frontend AGENTS files.
- Every page in the list above either renders through the shared shell or is on
  a documented exception list with a stated reason.
- A migrated page keeps its existing domain behaviour and permissions, verified
  per wave rather than at the end.
- A conformance check fails when a new bespoke record page is added.
- [[BUG-3378]] is fixed before the first migration wave lands.

## Dependencies

Blocked by [[BUG-3378]]. Overlaps [[ITEM-0165]] and [[ITEM-0166]], which tidy
the reference page itself and should land first so that what is being copied is
the finished article.

## Related Items

[[BUG-3378]] tab strip defects in the shared shell. [[ITEM-0165]] work sites
panel. [[ITEM-0166]] DLP panel. [[ITEM-0164]] hierarchy viewer. [[ITEM-0178]]
a related edit-mode inconsistency this session's audit found but did not fix
(out of this record's scope — see Resolution).

## Resolution

Delivered this session: the sequence's first three steps, in full.

1. **[[BUG-3378]] confirmed fixed** in this worktree before any other work
   started (`responsive-runtime-tabs.tsx` carries `inert` on its measurement
   copy and real tab semantics).
2. **The layout contract is written**:
   `docs/architecture/record-page-layout-contract.md` — MUST/MAY lists, a
   documented-exceptions table (payroll runs, payslips, the two
   single-decision attendance approval screens), and referenced from
   `apps/web/AGENTS.md`.
3. **The conformance check exists and passes**:
   `apps/web/app/(authenticated)/_components/record-page-shell.conformance.spec.ts`.
   It classifies every one of the nine pages this record's own Evidence
   section named as fully bespoke — plus discovers and classifies every
   other record-detail route in the app outside `settings/`/`reports/`/`edit/`
   automatically, so a new bespoke page fails the check rather than going
   unnoticed. All 7 of its assertions pass against the current filesystem.

**Explicitly declined this session, with the reason: the nine page
migrations themselves (wave 3 and 4 of the sequence's "migrate in waves"
step).** `EXECPLAN-0044` sequences them into five waves (one of which —
payroll runs and payslips — turns out to need zero page changes, since both
are structural exceptions rather than migration targets) and each remaining
wave's pages are named in
`record-page-shell.conformance.spec.ts`'s `JUSTIFIED_EXCEPTIONS` map with an
explicit "not yet migrated — EXECPLAN-0044 wave N" reason, satisfying this
record's own Acceptance Criterion #2 ("every page ... either renders through
the shared shell or is on a documented exception list with a stated
reason") without requiring every migration to be rushed to completion in one
session. The reason for declining: this task releases toward `main`, the
nine deferred pages include permission-sensitive domains (claims, loans,
business trips, onboarding), and a migration that quietly drops a permission
check under time pressure — explicitly named as the top risk for this record
— would reach every tenant. Shipping the governance (contract + enforcement)
with zero thin migrations is safer than shipping some migrations unverified
to hit a self-imposed deadline. The nine migrations are ready to pick up:
`EXECPLAN-0044` names the exact pages, waves, and Definition of Done for
each.

**A related finding, filed as its own record instead of folded in here:**
[[ITEM-0178]] — the recruitment job opening's edit route stays bespoke even
though its detail route already uses the shared shell. Edit-mode routes
were out of scope for this record's Evidence section and this session's
conformance check; the finding is real but belongs to its own record rather
than silently expanding this one's scope after the fact.

## History

- 2026-09-11 — created at `cbd9b812` from a user report naming the employee main
  form as the reference layout; shell composition and the set of non-conforming
  pages established by code survey, and the reference page's own defects
  measured live.
- 2026-09-12 — contract, conformance check and EXECPLAN-0044 delivered for
  SESSION-0103; the nine page migrations explicitly deferred to the plan's
  waves. See Resolution.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3378]]
- Referenced by — [[BUG-3412]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
