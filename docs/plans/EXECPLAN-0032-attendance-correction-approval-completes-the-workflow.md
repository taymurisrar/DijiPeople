---
ID: PLAN-036
aliases: [PLAN-036, EXECPLAN-0032]
Title: Attendance correction approval actually applies, the site selector is populated, and a request can be withdrawn
Status: IMPLEMENTED
Session: N/A — single-agent task, no multi-session framework invoked
Type: BUG
Size: MEDIUM
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
---

# EXECPLAN-0032 — Attendance correction approval completes the workflow

```
CONTEXT_FILES_REQUIRED:
  - .agent/context/task-completion-contract.md

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API                        — all three fixes are attendance.service.ts /
                                         attendance.controller.ts / attendance-engine
                                         changes, plus the minimal frontend wiring
                                         each bug's acceptance criteria requires
DELIBERATELY_NOT_USED:
  - Database                           — no schema change. `AttendanceEntry`,
                                         `AttendanceCorrectionRequest` and
                                         `AttendanceDay` already carry every column
                                         this plan writes to.
  - Security                           — no new permission key. Every new route
                                         reuses `attendance.correction.create`,
                                         the permission set the requester already
                                         holds to file the request being acted on.

SINGLE_WRITER_FILES:
  - none

QA_REQUIRED: no                        — fixed and verified by targeted regression
                                         specs in this pass; no QA session was
                                         convened for this task.

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - none new — see Related Items in each source bug record

REGRESSION_ENTRIES_IN_SCOPE:
  - None registered as REG-nnn in this pass. Coverage is the new spec files listed
    under Testing strategy; promoting any of them to the durable regression
    register is left to the Architect's normal QA intake, not invented here.

TARGET_BRANCH:            agent/cs-s7-planbugs (task branch; not pushed by this task)
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no — not part of this task
DEPLOYMENT_COMPONENTS:    api | web
DEPLOYMENT_ORDER:         api -> web
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes — mandatory per AGENTS.md once tracked files change,
                          though this task does not push/merge/finalize
RELEASE_DEVOPS_REQUIRED:  no — not part of this task
POST_DEPLOY_QA_REQUIRED:  no — not part of this task
MERGE_STRATEGY:           rebase
KNOWN_CONCURRENT_WORK:    BUG-2494 (check-out re-validating check-in preconditions)
                          is being fixed by another agent in another worktree
                          against the same file, `attendance.service.ts`. This
                          plan's edits are confined to the correction-request
                          methods (`applyApprovedCorrection`,
                          `cancelCorrectionRequest`, `listMyWorkSites` and their
                          call sites) and do not touch `checkOut` or
                          `validateModeAndLocation`, which is BUG-2494's area.
ENVIRONMENT_DEPENDENCIES: none
```

## Objective

Three defects in the attendance correction workflow, fixed together because they
share the same code path and the same forms: approving a correction actually
writes the work site and work mode it asked for (or refuses to, rather than
silently doing nothing); an employee filing a correction can name a work site at
all; and the person who filed a correction can take it back before a manager
acts on it.

## Business requirement

The owner's own description of the workflow (recorded in
[[EXECPLAN-0029-attendance-correction-from-the-record-page]]): *"If approved
then changes on the attendance record is updated."* BUG-2504, BUG-2508 and
BUG-2573 are the three ways that promise was not kept, found during the
verification of that same feature.

## Existing behavior

**FACT**, verified by reading `services/api/src/modules/attendance/attendance.service.ts`
at the branch point of this task:

- `applyApprovedCorrection` (previously lines 1676-1761) wrote only `checkIn`,
  `checkOut`, `status`, `source`, `notes`, `updatedById`. `requestedWorkMode`
  and `requestedWorkSiteId` are persisted on the request at creation
  (`createCorrectionRequest`, ~line 858) and were never read back at approval.
  `deriveManualStatus` was called with `existing.attendanceMode` — the value
  the correction asked to replace.
- The correction form (`apps/web/app/components/attendance-corrections/attendance-correction-form.tsx`)
  already accepted a `workSites` prop and rendered it as the "Which work
  site?" selector. Nothing passed it: neither
  `corrections/new/page.tsx` nor `attendance-correction-panel.tsx` supplied
  one, so the prop's default `[]` meant every employee saw only "Not
  applicable". The one pre-existing endpoint,
  `GET /integrations/attendance/employees/:employeeId/work-sites`
  (`attendance-operations.controller.ts:97`), is gated on
  `attendanceDevices.read` — a device-management permission, not a
  self-service one.
- The correction controller (`attendance.controller.ts:211-261`) exposed
  exactly `POST /correction-requests`, `POST /:id/approve`,
  `POST /:id/reject`, plus the two `GET`s. There was no cancel route.
  `AttendanceCorrectionStatus.CANCELLED` exists in the schema, and
  `mapCorrectionApprovalStatus` / `mapCorrectionStepStatus` /
  `mapCorrectionAssignmentStatus` (attendance.service.ts, ~lines 5107-5154)
  already map it on all three of the generic approval's status enums — built
  anticipating this path, never wired to a route.

**INFERENCE, checked and confirmed as FACT.** The attendance reconciliation
engine (`services/api/src/modules/attendance-engine/attendance-reconciliation.service.ts`)
already reads approved `OVERTIME_APPROVAL` corrections fresh on every
reconciliation run (`loadApprovedAdjustments`, `sumApprovedOvertime`) and
writes the total to `AttendanceDay.approvedOvertimeMinutes`
(`persist`, ~line 1285). `queueCorrectionReconciliation` is already called
unconditionally after every correction approval and rejection
(`attendance.service.ts`, previously ~line 1620, now inside
`actionCorrectionRequest`). This is a pre-existing, independently-built
mechanism — not something this plan adds — and it is why BUG-2504's overtime
half needs no entry-level schema change: it is already a recorded, findable
value, sourced live from the request rather than copied once.

## Existing architecture

- `services/api/src/modules/attendance/attendance.service.ts` — correction
  create/approve/reject/apply, the generic approval sync, the notification
  emits, the read-model mapping (`mapCorrectionRequest`)
- `services/api/src/modules/attendance/attendance.controller.ts` — the
  `correction-requests` route group
- `services/api/src/modules/attendance-engine/attendance-policy-resolver.service.ts`
  — the tenant/organization/work-site policy authority; already resolves an
  employee's authorised work sites for the engine's own use
  (`resolveAuthorizedWorkSites`, ids only)
- `apps/web/app/components/attendance-corrections/` — the form, the panel, the
  actions component, the shared types
- `apps/web/app/(authenticated)/attendance/corrections/` and
  `apps/web/app/(authenticated)/attendance/[entryId]/page.tsx` — the two
  mount points for the form/panel

## Requirements

1. Approving a correction that names a work site sets the entry's
   `officeLocationId` to it.
2. Approving a correction that names a work mode (`OFFICE`/`REMOTE`) sets the
   entry's `attendanceMode` to the mapped value, and the status re-derivation
   uses that new mode.
3. Approving a correction that names `FIELD` is refused with a stated reason
   — `AttendanceMode` has no `FIELD` member — rather than silently applying
   nothing while still reporting success.
4. An employee filing a correction can choose from the sites they are
   themselves authorised for, without holding `attendanceDevices.read`.
5. The requester of a still-pending correction can withdraw it. Nobody else
   can, including the assigned approver. A decided request cannot be
   withdrawn.
6. Withdrawing closes the generic `ApprovalRequest`/`ApprovalStep`/
   `ApprovalAssignment` alongside it, and notifies the approver.

## Dependencies

None blocking. BUG-2504 depended on BUG-2505 (already fixed) to be
exercisable through the product at all; not a dependency of this plan's code.

## Files / modules affected

Backend:
- `services/api/src/modules/attendance/attendance.service.ts`
- `services/api/src/modules/attendance/attendance.controller.ts`
- `services/api/src/modules/attendance/dto/attendance-correction-cancel.dto.ts` (new)
- `services/api/src/modules/attendance-engine/attendance-policy-resolver.service.ts`
- `services/api/src/modules/notifications/notification-events.catalog.ts`

Frontend:
- `apps/web/app/components/attendance-corrections/attendance-correction-types.ts`
- `apps/web/app/components/attendance-corrections/attendance-correction-actions.tsx`
- `apps/web/app/components/attendance-corrections/attendance-correction-panel.tsx`
- `apps/web/app/(authenticated)/attendance/corrections/new/page.tsx`
- `apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx`
- `apps/web/app/(authenticated)/attendance/[entryId]/page.tsx`
- `apps/web/app/api/attendance/correction-requests/[id]/cancel/route.ts` (new)

Tests:
- `services/api/src/modules/attendance/attendance-correction-apply.spec.ts` (new)
- `services/api/src/modules/attendance/attendance-correction-work-sites.spec.ts` (new)
- `services/api/src/modules/attendance/attendance-correction-cancel.spec.ts` (new)

## Database impact

None. No model, no migration, no backfill. `officeLocationId`,
`attendanceMode`, `AttendanceCorrectionStatus.CANCELLED` and
`AttendanceDay.approvedOvertimeMinutes` all already exist.

## Backend impact

- `applyApprovedCorrection`: resolves `requestedWorkMode` to an
  `AttendanceMode` via a new pure function, `resolveApprovedAttendanceMode`
  (OFFICE/REMOTE/HYBRID map directly; FIELD throws
  `UnprocessableEntityException` before any write). Applies
  `requestedWorkSiteId` to `officeLocationId` on both the existing-entry and
  the create-new-entry branches. Passes the resolved mode, not the stale one,
  into `deriveManualStatus`.
- New endpoint `GET /attendance/correction-requests/work-sites` ->
  `AttendanceService.listMyWorkSites`, gated on the same permission set as
  `createCorrectionRequest`. Declared before `GET /correction-requests/:id`
  in the controller so Nest's declaration-order route matching does not send
  the literal segment `work-sites` into the UUID-validated `:id` param.
- `AttendancePolicyResolverService.resolveAuthorizedWorkSiteOptions`: a new
  method returning `{id, name}[]`, alongside the existing ids-only
  `resolveAuthorizedWorkSites` used internally by the engine. Not a
  replacement — every existing caller wants ids only, and widening that
  method's return shape would ripple into the punch interpreter and the
  reconciliation service for no reason.
- New endpoint `POST /attendance/correction-requests/:id/cancel` ->
  `AttendanceService.cancelCorrectionRequest`. Requester-only, pending-only,
  reuses the existing generic approval sync
  (`syncGenericAttendanceCorrectionApproval`) with
  `ApprovalActionType.CANCELLED`. Does not enqueue reconciliation — a pending
  request was never in `loadApprovedAdjustments`' `status: 'APPROVED'` filter,
  so there is nothing for the engine to undo.
- New notification event `attendance.correction.cancelled.approver`,
  registered in the catalog (picked up by `seed:config` automatically; no
  separate seed step).

Overtime is deliberately **not** given an `AttendanceEntry` field in this
plan. It is already a recorded, findable value on `AttendanceDay.approvedOvertimeMinutes`,
computed fresh from approved `OVERTIME_APPROVAL` corrections by the existing
reconciliation engine, which is already invoked on every correction action.
Adding a second, entry-level copy would create the exact "two writers on one
column" problem BUG-2504's own root-cause section warned against, this time
for payroll input rather than mode.

## Frontend impact

`apps/web` only, no runtime registry contract change:

- `corrections/new/page.tsx` and `attendance/[entryId]/page.tsx` (server
  components) fetch the caller's own work sites and pass them to
  `AttendanceCorrectionForm` / `AttendanceCorrectionPanel`. Both fetches are
  wrapped so a failure falls back to `[]` — a correction could always be
  filed without naming a site, and a secondary read must not break the page.
- `AttendanceCorrectionActions` gains a `canCancel` prop and a "Withdraw
  request" control, gated identically to how `canApprove`/`canReject` already
  gate the approve/reject controls — cosmetic, since `POST .../cancel`
  re-decides the rule server-side.
- No jsdom-based component tests are added; `apps/web`'s jest config is
  scoped to `*.spec.ts` (pure logic) because there is no testing-library
  install, per `apps/web/jest.config.js`'s own header comment. Frontend
  correctness here is covered by `npm --workspace web run check-types`.

## Permission / RBAC impact

No new permission key in either system. `GET .../work-sites` and
`POST .../cancel` both reuse `@Permissions('attendance.correction.create')` +
`@RequirePermission(ENTITY_KEYS.ATTENDANCE, 'create')` — the same pair
`POST /correction-requests` already requires. Nothing is granted that the
requester did not already hold to file the request in the first place.
`apps/web/lib/security-keys.ts` needed no new entry.

## Tenant-isolation impact

- `listMyWorkSites` takes no id from the client at all — the only input is
  `AuthenticatedUser`, and the employee record is resolved via
  `getCurrentEmployee(currentUser)`, which is keyed on
  `(currentUser.tenantId, currentUser.userId)`. There is no argument through
  which a caller could name another employee.
- `cancelCorrectionRequest` reuses `findCorrectionRequestForUser`, which is
  already tenant-scoped and already applies `correctionRelevantScope`
  (includes the caller's own `requestedByUserId`).
- `applyApprovedCorrection`'s new reads/writes stay inside the existing
  `tx.attendanceEntry.findFirst({ id, tenantId })` / `.update({ where: { id } })`
  shape — no new query was added, only new fields in an existing `data:` block.

## Audit / event / logging impact

- `cancelCorrectionRequest` calls `AuditService.log()` with action
  `attendance.correction.cancelled`, before/after snapshot on `status`,
  matching the existing approve/reject audit shape.
- Approving a mode/site correction was already audited via the same call the
  approve path already makes; no new audit call needed, only more accurate
  `afterSnapshot` data than before (unchanged shape, `status`/`actionComment`).
- New notification event `attendance.correction.cancelled.approver`, IN_APP
  channel, following the existing attendance-correction event shape exactly.

## Integration impact

None. No gateway, agent or Stripe surface touched.

## Migration / data compatibility

None. A tenant that never used `requestedWorkMode`/`requestedWorkSiteId` sees
no behavior change — those fields stay `null` and the new code paths are
no-ops (`resolvedMode ?? existing.attendanceMode`,
`requestedWorkSiteId ?? existing.officeLocationId`). An in-flight,
already-`PENDING_APPROVAL` request approved after this deploys now actually
applies its site/mode where it silently did not before — a behavior fix, not
a breaking change, and the one this record exists to make.

## Parallel-safe tasks

- `PARALLEL_SAFE` — BUG-2508 (work-sites endpoint + frontend wiring) has no
  file overlap with BUG-2573 (cancel route) beyond the shared controller file,
  and both are additive insertions at different points in it.

## Dependency-blocked tasks

- None. All three fixes landed together in one pass because they share
  `attendance.service.ts` and the task explicitly asked for one coherent fix
  rather than three sequential ones touching the same file.

## Integration tasks

None beyond the normal commit/push this task's completion contract requires.
No PR, merge or deploy is performed by this task.

## Testing strategy

- `npm --workspace api run test -- src/modules/attendance` — the three new
  spec files plus the full existing attendance suite, to prove no regression.
- `npm --workspace api run test -- src/modules/billing` — unaffected by this
  plan; run as part of the same pass because BUG-2462 shares the commit
  session (separate ExecPlan, EXECPLAN-0033).
- New specs:
  - `attendance-correction-apply.spec.ts` — work site applied, mode mapped,
    status re-derived from the approved mode, FIELD refused before any write,
    unset fields fall back to the existing value, the no-linked-entry branch
    applies mode/site too.
  - `attendance-correction-work-sites.spec.ts` — returns the caller's own
    sites, refuses a caller with none of the correction/read permissions,
    and a text-level check that the controller route does not carry
    `attendanceDevices.read`.
  - `attendance-correction-cancel.spec.ts` — requester can cancel a pending
    request; the approver cannot; an unrelated user cannot; an already
    decided or already cancelled request refuses with `ConflictException`.
- `npm --workspace web run check-types` — the only practical check available
  for the frontend wiring, per this app's jest scope.
- Manual verification was not performed against a live tenant in this pass;
  the fix is verified at the service-method and route-declaration level only.

## Risks

1. **FIELD-mode corrections now fail approval instead of silently
   succeeding.** Likelihood: certain, by design. Impact: a manager approving
   a "my work location or mode is wrong" correction to FIELD now sees an
   error rather than a false success. Mitigation: this is the acceptance
   criterion, not a regression — the previous behavior was a manager being
   told an approval worked when it changed nothing. The error message states
   the reason and the two things that can still be done (approve site/time
   separately, or raise a request to widen `AttendanceMode`).
2. **The self-service work-sites endpoint returns the tenant's active sites
   even for an employee with no `EmployeeWorkSite` assignment rows**, via the
   existing primary-location fallback baked into
   `resolveAuthorizedWorkSiteOptions` (mirroring
   `EmployeeWorkSiteResolver`'s documented behavior in
   `attendance-integrations`). Likelihood: only for employees provisioned
   before work-site assignment existed. Impact: low — it is the same
   fallback the rest of the platform already trusts for this exact reason.
3. **Concurrent edit risk with BUG-2494's fix**, both touching
   `attendance.service.ts`. Mitigation: this plan's diff is confined to the
   correction-request methods; BUG-2494 is scoped to `checkOut` and
   `validateModeAndLocation`. No overlapping lines; a merge should be
   mechanical.

## Rollback considerations

`CODE_ONLY`. Reverting the commit restores the previous (broken) behavior
exactly — no persisted data changes shape, since every new write target
(`officeLocationId`, `attendanceMode`, `AttendanceCorrectionStatus.CANCELLED`)
already existed and was already nullable/valid. A correction cancelled after
this ships stays `CANCELLED` if the commit is later reverted; that is a
correct historical record, not a state the old code needs to understand.

## Definition of Done

- `npm --workspace api run test`, `check-types`, `lint` pass
- `npm --workspace web run check-types` passes
- `npm run backlog:check` passes
- BUG-2504, BUG-2508, BUG-2573 records updated to `Status: FIXED` with a
  `## Resolution` section each
- No unrelated file touched; `attendance.service.ts` diff confined to the
  correction-request methods
