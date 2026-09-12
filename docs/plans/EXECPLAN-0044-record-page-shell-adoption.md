CONTEXT_FILES_REQUIRED:
  - docs/architecture/record-page-layout-contract.md
  - .agent/context/agent-handoffs.md
  - docs/development/parallel-work.md

SPECIALIST_AGENTS_REQUIRED:
  - frontend                            — each wave's page migration
  - ui-ux                               — a11y/responsive check per wave (the tab strip and
                                           heading-level rules this plan depends on)
DELIBERATELY_NOT_USED:
  - backend-api                         — no backend contract changes; every wave reuses an
                                           existing endpoint through an existing or new
                                           `ModuleDataAdapter`, never a new route
  - database                            — no schema impact anywhere in this plan

SINGLE_WRITER_FILES:
  - apps/web/lib/runtime/modules/standard-module-specs.ts   (adding a spec per migrated module)

QA_REQUIRED: yes — per wave, not only at the end (ITEM-0167's own acceptance criterion)

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - none found under docs/qa/known-bug-patterns/ naming a record-page-migration pattern.

REGRESSION_ENTRIES_IN_SCOPE:
  - none yet — each wave that changes behavior (rather than adopting the shell 1:1) files its
    own REG entry alongside its bug/QA records when it lands.

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no (per wave, until a wave actually merges)
DEPLOYMENT_COMPONENTS:    web
DEPLOYMENT_ORDER:         n/a — frontend-only, no coordinated rollout
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  yes, per wave
MERGE_STRATEGY:           merge --no-ff, one merge per wave — never one merge for all waves
KNOWN_CONCURRENT_WORK:    SESSION-0103 runs several agents in parallel against the same develop
                          lineage. `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx`'s
                          LOOKUP CONSTRUCTION and LOOKUP_REFERENCE_ROUTES map are owned by a
                          concurrent agent — no wave in this plan needs to touch either region,
                          but a migrating agent should re-check ownership before editing that
                          file for any other reason.
ENVIRONMENT_DEPENDENCIES: none

# ExecPlan — Adopt the record-page shell across the pages that still hand-roll their own

## Objective

Every record-detail page in `apps/web` either renders through
`ModuleRecordPage` (directly, via `StandardModuleRecordPage`, or via a
wrapper that calls it, per
[[docs/architecture/record-page-layout-contract.md]]) or is a named,
reasoned exception — verified by an automated conformance check rather than
asserted from memory, and migrated in waves small enough that one reviewer
can hold each wave's domain behaviour in mind.

## Business requirement

[[ITEM-0167]] — the product owner named the employee record's layout —
status header, action bar, tab strip, sections — the reference every other
module's record page should look like, and asked for the pages that do not
to be brought in line.

## Existing behavior

**Already done, this session, and load-bearing for everything below:**

- [[BUG-3378]] is fixed (verified present in this worktree before any of
  this plan's other work started — `responsive-runtime-tabs.tsx` carries
  `inert` on its measurement copy and real `role="tablist"`/`role="tab"`/
  `role="tabpanel"` semantics). This plan would not be safe to execute
  without it, per ITEM-0167's own sequencing requirement.
- [[ITEM-0165]] and [[ITEM-0166]] are done — the employee reference page no
  longer mounts page-level panels outside its form, so what a migrated page
  copies is the corrected article, not the one with the two defects
  ITEM-0167's own Evidence section measured.
- [[docs/architecture/record-page-layout-contract.md]] exists, with a
  documented-exceptions table and MUST/MAY lists.
- The conformance check
  (`apps/web/app/(authenticated)/_components/record-page-shell.conformance.spec.ts`)
  exists and passes today, with every current record-detail route (outside
  `settings/` and `reports/`, outside `/edit/` and `/new/`) classified as
  either conforming or a named exception. It auto-discovers new routes, so a
  page added after this plan without being classified fails CI.

**Verified filesystem state (re-derive rather than trust if this plan is
read later — see `AGENTS.md`'s own warning about exactly this):**

16 record-detail routes already render through `StandardModuleRecordPage` or
`EmployeeRuntimeFormWrapper`: `approvals/[approvalId]`, `attendance/[entryId]`,
`benefits/assignments/[id]`, `customers/[customerId]`,
`employee-bank-accounts/[id]`, `employees/[employeeId]`, `leaves/[id]`,
`loans/[id]`, `payroll/calendars/[calendarId]`, `payroll/cycles/[cycleId]`,
`payroll/employee-compensation/[compensationId]`, `payroll/periods/[periodId]`,
`projects/[projectId]`, `recruitment/applications/[applicationId]`,
`recruitment/candidates/[candidateId]`, `recruitment/jobs/[jobId]`.

13 do not. 4 are structural exceptions (see the contract's table):
`attendance/corrections/[id]`, `attendance/exceptions/[id]`,
`me/payslips/[payslipId]` + `payroll/payslips/[payslipId]`,
`payroll/runs/[runId]`. 9 are migration targets, grouped into waves below:
`timesheets/[timesheetId]`, `claims/[claimId]` + `me/claims/[claimId]`,
`business-trips/[tripId]` + `me/business-trips/[tripId]`,
`onboarding/[onboardingId]`, `recruitment/employee-drafts/[employeeId]`,
`inbox/[notificationId]`.

**A related, out-of-scope finding from writing the conformance check:**
`recruitment/jobs/[jobId]/edit/page.tsx` is fully bespoke even though its
sibling detail route (`recruitment/jobs/[jobId]/page.tsx`) already renders
through `StandardModuleRecordPage` — an edit/detail inconsistency within one
module. Edit-mode routes are explicitly out of this plan's and the
conformance check's current scope (see the contract document), so this is
filed as its own record ([[ITEM-0178]]) rather than folded in here.

## Existing architecture

- `apps/web/lib/runtime/modules/standard-module-specs.ts` — where a migrated
  module's `moduleKey`/`routeBase`/form spec is declared.
- `apps/web/lib/runtime/modules/standard-module-route-helpers.ts` —
  `buildStandardRouteRuntime`, `resolveStandardActiveForm`.
- `apps/web/app/components/runtime/standard-module-record-page.tsx` — the
  page component every migrated page renders.
- `apps/web/lib/runtime/modules/standard-module-data.adapter.ts` — the
  generic adapter; already carries nine hardcoded `moduleKey` branches
  ([[ITEM-0036]]'s accretion concern) — a tenth migrated module should get
  its own adapter file (the employee/loan/benefit pattern) rather than
  extending this one further, per `apps/web/AGENTS.md`.
- Existing bespoke pages per target, each with its own domain logic to
  preserve — read individually per wave, not assumed from this plan.

## Requirements

1. Each wave migrates its named pages to render through
   `StandardModuleRecordPage`, with a `standard-module-specs.ts` entry (or a
   dedicated data adapter, per Existing architecture) per module.
2. A migrated page's existing domain behaviour is preserved: every command
   the bespoke page offered still exists (in the shared action bar, not
   scattered buttons), every permission check still applies, every field
   the bespoke page showed is still shown (as a metadata field or a system
   widget).
3. A migrated page's route, id parameter shape, and URL stay unchanged — this
   is a rendering-engine change, not a URL or IA change.
4. Each wave is verified (`check-types`, `test`, and a manual read-through of
   the diff against the bespoke page it replaces) **before** the next wave
   starts, and merges to `develop` on its own — never batched with another
   wave into one merge.
5. The conformance check is updated in the same commit as each wave: the
   migrated routes move from `JUSTIFIED_EXCEPTIONS` to `CONFORMING_ROUTES`.
6. If a wave turns out not to be safe to complete in the time available, ship
   fewer pages from that wave and leave the rest in `JUSTIFIED_EXCEPTIONS`
   with an honest "not yet migrated, attempted in <session>, see <note>"
   reason — never migrate a page thin (missing a permission check or a
   command) to hit a wave boundary.

## Dependencies

[[BUG-3378]] (done). [[docs/architecture/record-page-layout-contract.md]]
(done). Not blocked by [[ITEM-0165]]/[[ITEM-0166]] but sequenced after them
by ITEM-0167's own text, and both are done.

## Files / modules affected

Per wave — see Waves below. No file outside `apps/web` and this plan's own
docs is touched by any wave.

## Database impact

None. Every wave reads and writes through the same API endpoints the bespoke
page already used.

## Backend impact

None expected. If a wave's page reads a shape the standard adapter cannot
express without a new endpoint field, that is scope creep for this plan —
raise it as its own record rather than silently growing an API surface
inside a frontend-shell migration.

## Frontend impact

`apps/web` only. Each migrated page keeps its existing loading/error/empty/
access-denied states (inherited from the shell, verified per Requirement 4)
and gains the shared tab strip only where the record genuinely has more than
one section — a single-section record correctly stays a single panel with no
tab strip, per the layout contract.

## Permission / RBAC impact

No new permission keys. Requirement 2 is the whole of this concern: a
migrated page must not change who can see or do what. Verified per wave by
reading the bespoke page's guard clauses and command visibility rules and
confirming the migrated version's `resolveFieldEditable`/`isDisabled`/
`visibilityRules` express the same conditions.

## Tenant-isolation impact

None changed. Every wave's data still flows through the same
`apiRequestJson` / `ModuleDataAdapter` calls to the same tenant-scoped API
endpoints; this plan does not touch any backend query.

## Audit / event / logging impact

None changed — no wave adds or removes an audited action; migrating the
rendering layer does not touch `AuditService.log()` call sites.

## Integration impact

None.

## Migration / data compatibility

Each wave is a rendering-layer swap with no data shape change, so there is
no compatibility window to manage beyond the ordinary "deploy the frontend"
step — no API version skew is introduced.

## Parallel-safe tasks

Each wave is `PARALLEL_SAFE` against every other wave (disjoint page sets,
disjoint route files) — the only shared file is
`standard-module-specs.ts` (see Single-writer files), so waves append to it
rather than editing each other's entries, and a session should take a lease
on it before starting a wave if another session might be adding a spec at
the same time.

## Dependency-blocked tasks

None — all five waves below are independent of each other.

## Integration tasks

- `INTEGRATION` — after all waves land, a final `record-page-shell.conformance.spec.ts`
  run with an empty `JUSTIFIED_EXCEPTIONS` "not yet migrated" set (only the
  four structural exceptions remaining) confirms the record is fully closed.

## Waves

1. **Attendance and timesheets** — `timesheets/[timesheetId]`.
2. **Claims, loans and business trips** — `claims/[claimId]`,
   `me/claims/[claimId]`, `business-trips/[tripId]`,
   `me/business-trips/[tripId]`. (`loans/[id]` is already migrated — this
   wave is the two domains ITEM-0167 grouped it with that are not.)
3. **Payroll runs and payslips** — no migration task: both are structural
   exceptions (see the contract's table). This wave is a no-op by design,
   named here so a future reader does not wonder why "payroll runs and
   payslips" from ITEM-0167's own wave list produced no page changes.
4. **Onboarding and recruitment drafts** — `onboarding/[onboardingId]`,
   `recruitment/employee-drafts/[employeeId]`.
5. **Inbox** — `inbox/[notificationId]`.

**Status at the end of this session: waves not started.** The governance
this plan and the conformance check provide — the contract, the check, the
named and reasoned exception list — is complete and merged; the five waves
above are scoped and sequenced but not implemented. This is a deliberate
scope decision, not an oversight: SESSION-0103 was operating close to a
session boundary, and ITEM-0167 targets `develop` en route to `main` in the
same program as ten other work packages — a rushed migration of a
permission-sensitive page (a claim, a business trip, an onboarding record)
under time pressure is exactly the failure mode the task's own brief warned
against ("a migration that quietly drops a permission check... would reach
every tenant"). Shipping the contract and the enforcement mechanism, with
zero thin migrations, is the safer complete unit of work; the nine
page migrations are follow-up tasks this plan hands off cleanly; each
migration knows exactly which page, which wave, and what "done" means
before anyone starts it.

## Testing strategy

Per wave: `npm --workspace web run check-types`, `npm --workspace web run
test` (the conformance check's affected assertions plus the full suite),
`eslint --fix` on changed files. Manual read-through of each migrated page's
diff against `docs/architecture/record-page-layout-contract.md`'s MUST list.
No browser automation was available this session (Playwright MCP failed to
connect) — a live-browser QA pass per wave, checking the migrated page's
actual rendered behaviour, commands, and responsive layout, is required
before that wave reaches `main`.

## Risks

1. **A migration silently drops a permission check or a command** — highest
   risk, explicitly called out in this task's brief. Mitigation: Requirement
   2, verified per wave by reading the bespoke page's guard clauses before
   writing the migrated version, not after.
2. **A "simple" page turns out to have domain logic the standard adapter
   cannot express cleanly** (e.g. a claim's multi-currency amount field, a
   business trip's date-range validation) — likely for at least one page in
   Wave 2. Mitigation: a dedicated data adapter per module (Existing
   architecture), not a bent standard adapter; if the runtime genuinely
   cannot express something, that page becomes a new documented exception
   rather than a half-migrated page.
3. **Batching waves to save review overhead.** Mitigation: Requirement 4 and
   this plan's `MERGE_STRATEGY` — one merge per wave, always.

## Rollback considerations

`CODE_ONLY` per wave. Reverting a wave's commit restores the bespoke page
file and its conformance-check exception entry; no data or migration to
unwind, since no wave touches the backend or the database.

## Definition of Done

Per wave (all must be true before that wave's PR merges):
- [ ] The wave's pages render through `StandardModuleRecordPage`.
- [ ] `npm --workspace web run check-types` and `test` pass.
- [ ] `eslint --fix` clean on changed files.
- [ ] Every permission check and command the bespoke page had is verified
      present in the migrated page.
- [ ] The conformance check's `JUSTIFIED_EXCEPTIONS` entries for the wave's
      pages are removed and the pages added to `CONFORMING_ROUTES`.
- [ ] A live-browser QA pass is scheduled or completed before `main`.
- [ ] No unrelated changes in the diff.

For this plan as a whole (met at the end of this session):
- [x] The layout contract exists and is referenced from `apps/web/AGENTS.md`.
- [x] The conformance check exists, passes, and auto-discovers new routes.
- [x] Every currently non-conforming page is named with a reason (structural
      exception, or a specific wave/session note).
- [ ] All five waves complete — **not done this session; see Waves.**
