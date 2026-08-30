---
ID: PLAN-032
aliases: [PLAN-032, EXECPLAN-0029]
Title: Attendance correction raised from the record the employee is looking at
Status: APPROVED
Session: SESSION-0084
Type: FEATURE
Size: LARGE
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
---

# EXECPLAN-0029 — Attendance correction raised from the record the employee is looking at

```
CONTEXT_FILES_REQUIRED:
  - .agent/context/task-completion-contract.md
  - .agent/context/branch-model.md
  - .agent/context/test-resource-policy.md

SPECIALIST_AGENTS_REQUIRED:
  - Frontend                           — the record-page panel, the prefill, the
                                         manager's diff
  - QA                                 — the correction round trip, and the auth
                                         validation of item 2
  - Security                           — the panel must not become a second way to
                                         write an attendance row
DELIBERATELY_NOT_USED:
  - Database                           — no schema change; every value the diff
                                         needs is already stored and already returned
  - Backend/API                        — the endpoints, the approval routing and both
                                         notification emits already exist and are wired

SINGLE_WRITER_FILES:
  - none

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/doc-code-drift.md

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-002 — nobody approves a correction they are a party to

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       PRODUCTION
DEPLOYMENT_REQUIRED:      yes
DEPLOYMENT_COMPONENTS:    api | web
DEPLOYMENT_ORDER:         api -> web
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  yes
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           rebase
KNOWN_CONCURRENT_WORK:    agent/prod-monitoring-triage is this branch's base and
                          ships in the same release
ENVIRONMENT_DEPENDENCIES: none
```

## Objective

Let an employee correct the attendance record they are already looking at,
without leaving it and retyping the day from memory — and let the manager see
what actually moved.

## Business requirement

The repository owner, 2026-08-30:

> It is applied to a single attendance record only. When a user is on an
> attendance record detail page, they click on the 'Correction request' button,
> the same record becomes editable. Once the user clicks on the submit request
> button on the top, then a request goes to their line manager. They get a
> notification as well as records shows on the attendance list of records page
> in a dedicated view. When the manager opens the records, they see what things
> got updated, they can either approve it or reject it. If approved then changes
> on the attendance record is updated and if rejected then do nothing on the
> attendance record.

## Existing behavior

**FACT, verified at `ade1fea7`.** Seven of the nine behaviours the owner
described are already built and wired: the model, the endpoints, the approval
routing to `REPORTING_MANAGER`, the manager notification, the employee
notification, the `PENDING_CORRECTIONS` view on the attendance list, and the
approve/reject semantics. None of that is rebuilt here.

Three things are missing, and all three are on the employee's or the manager's
screen rather than in the domain:

1. **There is no correction entry point on the attendance record page at all.**
   `attendanceCorrectionCommand()` is declared `placement: "list-command-bar"`,
   and `command-runtime.resolver.ts:41` renders only `detail-command-bar` and
   `detail-status-group` on a detail page. The button exists on the *list*, and
   its handler redirects to `/attendance/corrections/new` with no record id. The
   earlier handoff described this button as present on the record page; it is
   not.

2. **The form is never seeded from a record.** `AttendanceCorrectionForm` does
   read `attendanceEntryId`, `correctionType` and `attendanceDate` from the query
   string — that much the handoff got wrong in the other direction — but nothing
   ever passes them, and the times, work mode and site are not seeded at all. The
   record id is collected from the employee through a free-text box labelled
   "Attendance record ID (optional)".

3. **The manager cannot see four of the eight kinds of change.**
   `requestedWorkMode`, `requestedWorkSiteId`, `requestedOvertimeMinutes` and
   `fallbackReason` are written by the API and returned by it — the serializer
   spreads the whole row — but `AttendanceCorrectionRequest` in the web app does
   not declare them and the detail page does not render them. An employee who
   submits `TIME_ADJUSTMENT` ("my work location or mode is wrong") or
   `OVERTIME_APPROVAL` gives their manager a decision surface on which literally
   nothing appears to have changed.

## Existing architecture

- Employee form: `apps/web/app/components/attendance-corrections/attendance-correction-form.tsx`
- Field rules, pure and directly tested: `.../correction-form-fields.ts` + `.spec.ts`
- Manager surface: `apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx`
- Record page: `apps/web/app/(authenticated)/attendance/[entryId]/page.tsx`
- API: `attendance.controller.ts:209-251`, `attendance.service.ts` (create `:~800-890`,
  action `:1517`, apply `:1674`, serialize `:2270-2290`)

The house pattern for this area is that decision logic lives in a pure module
next to the component, because `apps/web` tests run in a node environment with no
jsdom and no testing library. This plan follows it: everything new that can be
decided without a DOM goes into `correction-form-fields.ts` and is asserted
directly.

## Requirements

1. A **Correction request** control on the attendance record detail page, visible
   only to someone who may raise one for that record.
2. Activating it turns the record's own fields into an editable panel, seeded
   from the record, with the submit control at the top of that panel.
3. The attendance row is **not** written. Submitting posts an
   `AttendanceCorrectionRequest` exactly as the existing form does.
4. The correction type is inferred from the record's state and remains
   changeable.
5. The manager's screen shows **only what moved**, old value struck through, over
   times, work mode, work site, overtime minutes and the fallback reason.
6. The existing blank-form path keeps working, because `attendanceEntryId` is
   nullable by design so a wholly missing day can still be corrected.

## Dependencies

Ships on top of `agent/prod-monitoring-triage`, whose BUG-2458 refresh-budget fix
is a precondition for item 2's auth validation being measured against fixed code.

## Files / modules affected

- `apps/web/app/components/attendance-corrections/correction-form-fields.ts` — seed,
  inference and diff, all pure
- `apps/web/app/components/attendance-corrections/correction-form-fields.spec.ts` — coverage for them
- `apps/web/app/components/attendance-corrections/attendance-correction-form.tsx` — accept a seed
- `apps/web/app/components/attendance-corrections/attendance-correction-panel.tsx` — new
- `apps/web/app/components/attendance-corrections/attendance-correction-types.ts` — the four undeclared fields
- `apps/web/app/(authenticated)/attendance/[entryId]/page.tsx` — mount the panel
- `apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx` — the diff
- `apps/web/app/(authenticated)/attendance/corrections/new/page.tsx` — keep the blank path honest
- `services/api/src/modules/auth/**` and `services/api/test/**` — item 2 coverage only

## Database impact

None. No model, no migration, no backfill. Every value the diff renders is
already persisted and already returned.

## Backend impact

None for item 1. Item 2 adds test coverage only, no production code change beyond
what `agent/prod-monitoring-triage` already carries.

## Frontend impact

`apps/web` only. No change to any shared runtime registry contract; the panel is
mounted alongside `StandardModuleRecordPage` the same way `AttendanceDayPanel`
already is, rather than by adding a `detail-command-bar` command, because the
panel needs the fetched record and the runtime command bar does not carry it.

## Permission / RBAC impact

No new keys. The panel is gated on the same keys the `corrections/new` page
already checks, and on `record.isCurrentUsersEntry`. **The server remains the
authority** — the panel is a UX affordance, and every rule it appears to enforce
is re-decided in `AttendanceService.createCorrectionRequest`.

## Tenant-isolation impact

None. No new query. The record is fetched by the existing
`GET /attendance/:id`, which is tenant-scoped server-side.

## Audit / event / logging impact

Unchanged. The same `POST /attendance/correction-requests` is called, so the same
audit rows, the same approval routing and the same two notification emits fire.

## Integration impact

None.

## Migration / data compatibility

None. Adding four fields to a TypeScript type that the API already returns is
backward compatible in both directions.

## Parallel-safe tasks

- `PARALLEL_SAFE` — the pure seed/infer/diff module and its spec
- `PARALLEL_SAFE` — the auth validation coverage of item 2

## Dependency-blocked tasks

- The panel component is blocked on the seed module
- The record page wiring is blocked on the panel
- **Live auth validation is blocked on the deploy**, per BUG-2458

## Integration tasks

- Rebase on `origin/develop`, ref-push to `develop`, PR to `main`, verify
  `/api/health` reports the merged commit

## Testing strategy

- Unit, pure: seed from an entry, type inference, the diff, and the
  no-entry path, in `correction-form-fields.spec.ts`
- Unit, api: the auth budget and session-lifetime assertions of item 2
- Live, after deploy: the correction round trip on the demo tenant, and the
  login/logout/refresh/expiry/remember-me sweep
- Repository typecheck, because the change crosses no workspace boundary but the
  type it widens is consumed by two pages

## Risks

- **The panel becomes a second write path.** Mitigated by it never calling any
  attendance write endpoint; it posts a correction request and nothing else.
- **A seeded value is submitted unchanged and silently becomes a "request".**
  Mitigated by the diff: an unchanged field is not rendered as a change, and a
  request with no change at all is refused before it is sent.
- **The manager's diff shows a change that is not real** because the original side
  of a mode or site change is read from the linked entry rather than from a stored
  original. Accepted: the entry is the current truth, and the manager is deciding
  against current truth. Recorded here rather than solved with a migration.

## Rollback considerations

`CODE_ONLY`. Reverting the commit restores the previous entry point exactly;
nothing persisted changes shape, and correction requests raised through the panel
are indistinguishable from ones raised through the blank form.

## Definition of Done

- The record page offers the control, the panel seeds, and submit routes to the
  line manager as it does today
- The manager sees only what moved, across all five change kinds
- The blank-form path still submits a correction for a day with no record
- `npm --workspace web run test`, `check-types`, `lint`, and the api suite pass
- Deployed, and `/api/health` reports the merged commit
- Every finding this task produced is a durable record, and none is
  `TRIAGE_REQUIRED`
