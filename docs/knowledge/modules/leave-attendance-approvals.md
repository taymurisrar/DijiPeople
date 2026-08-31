# Leave, Attendance and Approvals

> Derived from repository evidence at `eb457d9d` on 2026-08-29, and corrected
> against a live run on the production API at `949f461c` the same day. Two
> claims in the original desk analysis were wrong and are marked below as
> corrected — the corrections are the most useful part of this note. Line
> numbers drift; re-derive on your branch (`doc-code-drift`).

An operator's map of the three modules that interlock. Read it before
configuring a tenant for leave or attendance, and before concluding that any of
them is broken — several of the surprises here are designed behaviour, and
several of the things that look designed are not.

All paths are prefixed `/api` (`main.ts:77`). The global `ValidationPipe` runs
`whitelist + forbidNonWhitelisted` (`main.ts:133`), so **any field not in the
DTO is a 400** — including a field the UI sends.

---

## The four things that will block you first

**1. There is no leave accrual engine, and no API to grant a balance.**
`LeaveBalance` has exactly three writers: consumption on approve
(`leave.service.ts:1857`, **decrement only**) and two seed scripts. There is no
`LeaveAccrualTransaction` model, no job, no cron. `LeavePolicyRule.entitlementDays`,
`accrualType`, `accrualFrequency`, `accrualAmount` and every `carryForward*` field
are stored, validated for internal consistency, and **never executed**.
[[BUG-1967]].

`LeaveType.consumesBalance` defaults `true`, and
`validateLeaveRequestAgainstPolicy` (`:578-596`) defaults a missing balance row
to `0` and throws `400 Insufficient leave balance for this request.` So **every
employee without a seeded balance row is blocked from submitting any leave at
all.** Two API-only workarounds: `PATCH /leave-types/{id} {"consumesBalance": false}`
(returns early at `:576`), or a policy rule with `negativeBalanceAllowed: true`.

**2. `seed-demo` seeds almost none of the leave configuration.** Four leave
types with schema defaults, one `LeaveBalance` row for one employee, and **no**
`LeavePolicy`, `LeavePolicyRule`, `LeavePolicyAssignment` or `ApprovalMatrix`.

**3. An approved leave request can never be cancelled.** `cancelLeaveRequest`
(`:890-894`) throws `409` for anything but `PENDING`, no other endpoint moves an
`APPROVED` request, and no code anywhere restores a balance. The overlap guard
counts `PENDING` **and** `APPROVED`, so an employee who books the wrong dates is
**permanently locked out of those dates** with no self-service or admin remedy.

**4. Attendance check-in requires a full GPS location payload** and the policy
that would relax that is hardcoded. See "Location capture" below.

---

## Leave

### Setup, in dependency order

| # | What | Required? |
|---|---|---|
| 1 | An `Employee` row linked to your user | **Mandatory** — `submitLeaveRequest` throws `400 No employee record is linked to the current user.` (`:391-399`) |
| 2 | Leave type (`POST /leave-types`) | **Mandatory** |
| 3 | Leave policy (`POST /leave-policies`) | Optional |
| 4 | Policy rule per type | Optional* |
| 5 | Policy assignment | Optional |
| 6 | Balance | **No API** |
| 7 | Approval matrix | Optional |

\* **Assigning a policy narrows what can be requested.** Once a policy resolves,
`resolveLeavePolicyRuleForRequest` (`:504-521`) throws
`400 Selected leave type is not configured in the assigned leave policy.` for any
type the policy has no active rule for.

Assignment precedence (`:1965-1986`), highest wins then `priority` desc then
`effectiveFrom` desc: `EMPLOYEE > EMPLOYEE_LEVEL > DEPARTMENT > BUSINESS_UNIT >
ORGANIZATION > TENANT`. A `TENANT`-scoped assignment matches without comparing
`scopeId`. No match is a **valid, unblocked** state.

Of the ~30 fields on `CreateLeavePolicyRuleDto`, only seven change runtime
behaviour: `approvalRequired`, `negativeBalanceAllowed`, `maximumNegativeBalance`,
`maxConsecutiveDays`, `minimumConsecutiveDays`, `requiresDocumentAfterDays`, and
`approvalMatrixId` (stored but **not read** — routing goes through
`ApprovalMatrixResolverService`). Notably **`minimumNoticeDays`,
`allowBackdatedRequests`, `maxBackdatedDays`, `allowFutureRequests` and
`maxFutureDays` are not enforced.** Backdated leave for any past date is accepted.

### State machine

```
POST /leave-requests → buildApprovalSteps()
   steps.length > 0  → PENDING
   steps.length == 0 → APPROVED immediately + balance deducted
PENDING → approve (last step) → APPROVED + balance deducted
        → reject (any step)   → REJECTED   (never touches the balance)
        → cancel              → CANCELLED  (PENDING only)
```

A **single rejection kills the whole request** regardless of remaining steps
(`:1580-1590`). Under `ANY_ONE`, one approval skips siblings sharing an
`approvalGroupKey`; under `ALL`, advancement is gated on a `hasMorePendingSteps`
count that counts **every** pending step across all orders, not just the current
one.

`recordApprovedLeaveConsumption` (`:1826-1878`) is the only runtime code that
touches a balance. Double-deduction is guarded twice (an early return and
`@@unique([tenantId, leaveRequestId])`), both inside the transaction — this part
is correct. But `totalRemaining` is a stored column that is only ever
`decrement`ed, never recomputed from `totalAllocated - totalUsed`, and there is
no reconciliation job, so **any drift is permanent**.

### The arithmetic

`validateAndCalculateRange` (`:2024-2050`) has four separate problems:

1. **Calendar days, not working days.** No holiday-calendar lookup, no
   work-schedule lookup, nothing — grep `leave.service.ts` for `holiday`,
   `workSchedule`, `shift` and you get zero hits. **A Friday→Monday request
   deducts 4 days.** The most visible arithmetic finding in the module.
2. `setHours(0,0,0,0)` is **server-local** on a value `new Date()` parsed as UTC
   midnight. Both endpoints shift equally so the subtraction usually survives —
   except across a DST boundary, where `Math.floor` drops a day.
3. `setHours` mutates, which is why the return re-parses the raw strings. Stored
   dates are therefore UTC midnight, and render as the previous day in a
   non-UTC display timezone.
4. `@IsDateString()` accepts a full datetime with an offset; nothing normalises
   to date-only.

**Half-day and hourly leave do not exist on the request path.**
`LeaveType.allowHalfDay` defaults true and is returned to the UI, but
`SubmitLeaveRequestDto` has five fields and none of them is a session or hours
field, and `totalDays` is always a whole integer. If the UI offers a half-day
toggle it is inert or will 400 on `forbidNonWhitelisted`. [[BUG-1965]] is the
same class of defect on the same form.

**`LeaveType.requiresApproval` is not consulted on submit.** Approval is gated on
`leavePolicyRule?.approvalRequired !== false`. With no policy assigned, `rule` is
`null`, `undefined !== false` is true, and approval is always attempted.

---

## Approvals

### `/api/approvals` decides by delegating — corrected 2026-08-31

**This section described the state before [[BUG-2718]].** It read: "`ApprovalsController`
declares two routes, both `GET` … the Approve/Reject buttons on `/approvals` are
declared disabled. That is intended, not a defect." The first half was true; the
second half was a judgement, and the owner overruled it — a screen that lists
work it cannot act on is not finished.

There are now three more routes, all `POST`:
`/approvals/{id}/approve|reject|cancel`.

**They do not write the approval row.** `ApprovalRequest` is a mirror for leave
and attendance, and moving the mirror would report APPROVED on the inbox while
the leave request stayed PENDING with no balance consumed. Instead
`ApprovalsService.decide` resolves an `ApprovalDecisionDelegate` from
`ApprovalDecisionRegistry` and calls the same method the owning module's own
controller calls, so the record, its mirror, its audit row and its notifications
all move together.

Two things about that path are worth knowing before changing it:

- **Registration runs owning-module → approvals**, the same direction as
  `createWorkflow`, so no `forwardRef` is involved. Each module contributes an
  `OnModuleInit` provider; `AttendanceModule` had to start importing
  `ApprovalsModule`, which it previously did not.
- **Dispatching in-process skips the owning controller, so it skips
  `PermissionsGuard`.** The delegate therefore declares the permission its own
  route demands, and `decide` evaluates it with `satisfiesPermissionRequirement`
  — the function extracted *out of* `PermissionsGuard`, which now calls it too.
  Reimplementing the check instead of sharing it is the [[BUG-2015]] shape,
  where approve turned out to be gated on read.

**Only leave and attendance have delegates.** Timesheets, payroll, benefits,
claims and loans deliberately do not: each needs input a one-line inbox row
cannot show — `ApproveLoanDto` *requires* `approvedAmount`, a timesheet week is
a grid of hours, a payroll run is a payroll run. For those the inbox reports
which module decides them and links to its screen, which is a capability the API
computes per record rather than a disabled button with a developer-facing
caption. Adding one later is a small delegate class.

[[BUG-2004]] covers the New action on the same screen, which was never intended.

Two parallel systems exist and they are **mirrors, not one system**:
`LeaveApprovalStep` is authoritative and written inside the submit transaction;
`ApprovalRequest`/`Step`/`Assignment` is the generic inbox, written by
`syncGenericLeaveApproval` **after and outside** the transaction, with no retry
and no outbox. If the mirror throws, leave is committed and the inbox is
silently wrong. After final approval `currentStepId` is never cleared, so the
inbox surfaces a completed step as "current".

### Route resolution — corrected

The original desk analysis said "a configured approval matrix does not override
the reporting-manager requirement / the matrix is simply not consulted."
**That was wrong**, and the correct mechanism is worse:

> **The approval router requires EVERY active matched rule in the chain to
> resolve to at least one active approver at submission time. If any single step
> cannot resolve, the whole submission is rejected with a 400. There is no skip,
> no degradation, no fallback.**

Established live by peeling a seeded two-step chain one rule at a time and
re-submitting the same request:

| Chain state | Result |
|---|---|
| seq1 `LINE_MANAGER` active, seq2 `ROLE(hr)` active | 400 `Approval route requires a reporting manager with a linked active user.` |
| seq1 `LINE_MANAGER` **deactivated**, seq2 `ROLE(hr)` active | 400 `Approval route role has no active users assigned.` |
| both deactivated, one resolvable `USER` rule left | **201 CREATED**, `PENDING`, `totalDays: 3` |

The middle row is decisive: with `LINE_MANAGER` off, a perfectly resolvable
`seq=1 USER` rule existed and the router still failed — on the `seq=2 ROLE` rule.
It is not "first resolvable rule wins"; it is "all rules must resolve".

**A freshly provisioned tenant has neither** a reporting manager with an
activated user nor any active user in the `hr` role, and the seeded chain
requires both. **Leave is therefore dead on arrival for every new customer**
until an administrator builds the reporting hierarchy with activated accounts
*and* populates the HR role. Nothing tells them that; the employee gets a 400,
and through the UI, silence. [[BUG-1968]].

Every `approverType` that cannot resolve throws a `400` and fails the whole
submit: `LINE_MANAGER`/`MANAGER`/`REQUEST_OWNER_MANAGER` (no manager with a
linked active user), `DEPARTMENT_HEAD`, `BUSINESS_UNIT_HEAD`, `USER` (no
`approverUserId`), `ROLE`/`HR` (no active users), and `POLICY_OWNER` — which is a
valid enum member the resolver **always** rejects as "not supported by the active
workflow resolver". Mixed `ANY_ONE`/`ALL` at one sequence also throws.

When no matrix matches, `buildApprovalSteps` passes a fallback of
`[REPORTING_MANAGER, ROLE 'hr']` and takes the first that resolves. **If neither
resolves it returns `[]` — and zero steps means the request is created
`APPROVED` with the balance deducted and no approval at all**, with no
`LEAVE_REQUEST_APPROVED` audit row, because the audit call is on the decision
path only. An employee who is the only active `hr` user and has no manager gets
the deadlock case instead: a step assigned to themselves that they cannot action.

Matrix matching gotchas (`matches()`, `:74-129`) — every one is a real
configuration trap:

- A **null** matrix field matches everything; a set field must match exactly.
- `recordType` must be `'leaveRequest'` or null.
- If `minimumDuration`/`maximumDuration` is set and the value is null,
  `matchesRange` returns **false** — the matrix does not match.
- `matchesJsonConditions` requires `conditionContext.values`, which
  `buildApprovalSteps` **never sets**. **Any matrix with a non-null `conditions`
  object can never match a leave request.**

### Workflows and SLA are not part of this

`modules/workflows/` is a **notification-triggered automation engine**, not the
approval router — its only consumer is `NotificationsService`. Its design
invariant is stated in its own header: *"A workflow must never break the action
that triggered it"*, i.e. failures are swallowed.

`modules/sla/` exposes one read endpoint and **nothing in the running system
ever starts a tracking row** — `SlaService.startTracking` has no caller outside
the module. `/api/sla/trackings` returns an empty list.

Both `/api/approvals` and `/api/sla/trackings` take
`@Query() query: Record<string, string>` with **no DTO and no validation**, and
cast straight to a Prisma enum. An invalid `?status=FOO` reaches Prisma
unvalidated — expect a 500, not a 400.

---

## Attendance

### Setup, in dependency order

Shift template → (holiday calendar) → work schedule → employee-schedule
assignment → attendance policy → `attendance.allowedModes` → work site. The four
master-data endpoints live on `EnterpriseConfigurationController`, which is
`@Controller()` with **no prefix**, so they are `/api/shift-templates`,
`/api/work-schedules`, `/api/holiday-calendars`, `/api/employee-schedule-assignments`.
**All four take `@Body() body: Record<string, unknown>` — no DTO, no
`class-validator`, unknown fields not rejected**, unlike everywhere else in the
API.

Three setup traps:

- **Omit `days[]` *and* `defaultShiftTemplateId`** on a work schedule and seven
  `WorkScheduleDay` rows are generated with `shiftTemplateId: null`. Check-in
  then fails `400 The resolved work schedule does not provide a shift for today.`
- `HolidayCalendar.weekendDays` defaults to **`[FRIDAY, SATURDAY]`** — a Gulf
  assumption that will surprise a Sat/Sun tenant. Set it explicitly.
- `attendance.allowedModes` defaults to `[OFFICE, REMOTE]`. **`HYBRID` is not
  allowed by default** and a HYBRID punch 400s.

`PATCH /attendance/policy` has **nine fields with no `@IsOptional()`** — a PATCH
omitting any one is a 400. And eight of the fields you can save are then ignored
at runtime because `resolvePolicy` hardcodes them. Saving them and observing no
change is expected. [[BUG-1980]], [[BUG-1981]].

**Run `GET /api/attendance/configuration` first.** It returns
`{ status: 'AVAILABLE' | 'INVALID', policy, issues[], source }`. Then, as the
employee, `GET /api/attendance/runtime-context` — and **assert against its
`attendanceDate`, never against your own clock.**

A schedule that is `isActive: true` but `status: 'INACTIVE'` is **silently
skipped** by the resolver, which then falls through with no error. That is a
likely source of "why is my schedule not applying".

Work-configuration precedence (`work-configuration-hierarchy.ts`):
schedule is `EMPLOYEE_ASSIGNMENT > EMPLOYEE_DEFAULT > TEAM > DEPARTMENT >
BUSINESS_UNIT > ORGANIZATION > TENANT_DEFAULT`; calendar is the same chain
**without** the employee-assignment layer, with the schedule's own calendar
sitting *below* the org layers. **Work Site participates in neither** —
`Location.defaultWorkScheduleId` and `Location.holidayCalendarId` still exist and
nothing reads them.

### Check-in refusal order

First match wins, so the message tells you which gate you hit
(`attendance.service.ts:250-276`): already checked in → approved leave covering
today → configuration error → scheduled off day → holiday → no shift resolved.
The approved-leave gate is **the only genuine coupling between leave and
attendance** in the product, and it is checked before off-day and holiday, so
leave wins the error message.

### Location capture — the biggest blocker

`validateAttendanceLocationPayload` runs on every self-service punch against the
hardcoded policy. Missing lat/long, an unrecognised `locationSource`, a missing
`locationCapturedAt`, out-of-range coordinates or excess accuracy all throw 422;
`PERMISSION_DENIED` throws **403**; and `manualLocationExceptionRequested` is
**always refused**, because `allowManualLocationException` is hardcoded `false`.
`locationCapturedAt` older than 5 minutes (or more than 60 s in the future) is
rejected as stale, so any script must generate it at request time. A failed
geofence check throws 422 — **after** writing location evidence.

### Two competing date engines

The single biggest source of flaky attendance behaviour. `attendance-time.util.ts`
is correct and tenant-timezone-aware (`businessDateAtUtcMidnight` is the
canonical `AttendanceEntry.date` key). Alongside it, `toStartOfDay`,
`combineDateAndTime`, `currentDateKey` and the repository's `normalizeDate` all
use **server-local** `setHours`, and all are still live.

Three places where the legacy engine leaks into **writes**, not just display:

1. `resolveLateCheckIn` / `resolveLateCheckOut` build the expected shift start
   server-local while the shift window is built tenant-local — so
   `isLateCheckIn` and `lateCheckInMinutes` are wrong by the offset.
2. `applyApprovedCorrection` for a missing day dates the new entry at
   server-local midnight, which will not match the canonical key, so
   `@@unique([tenantId, employeeId, date])` will not catch the real duplicate.
   It also **ignores `request.attendanceDate`**, the field that exists to name
   the day.
3. `importRow` uses the legacy combiner while `createManualEntry` uses the
   correct one — **an imported row and a manual row for the same wall time
   disagree.**

Note also `WorkSchedule.timezone` and `ShiftTemplate.timezone` are **not** in the
timezone resolution chain. Configure a shift in `Asia/Karachi` and the business
date still comes from the org/user timezone.

### Status derivation oddities

- **Every REMOTE entry is marked `LATE`**, punctual or not
  (`if (mode === REMOTE || isLateCheckIn) return LATE`).
- `resolveLateCheckOut` is misnamed: `isLate: now < endAt` is true when you
  leave **early**, so the column `isLateCheckOut` means "early exit".
- The policy grace is unreachable whenever a shift resolves, because
  `ShiftTemplate.lateGraceMinutes` is `Int @default(0)` and non-nullable, so
  `shift.lateGraceMinutes ?? policy.lateCheckInGraceMinutes` never falls through.
- `HALF_DAY` is never written by this module and `ON_LEAVE` is written nowhere
  at all.
- `findOpenAttendanceEntry` has **no date bound**, so a stale open entry from
  weeks ago will be closed by today's check-out, producing a multi-day duration.

### Corrections

Only `PENDING_APPROVAL` is actionable; `DRAFT`, `SUBMITTED`, `RETURNED` and
`CANCELLED` are unreachable through the API. **There is no cancel/withdraw
endpoint**, despite `attendance.correction.cancel` being granted to the Employee
role — the `defined-but-unwired-permission` pattern, and the same shape as the
leave cancellation hole. The approver may silently rewrite the requested times
on the approve call. Request numbers come from `count(*) + 1` against a unique
constraint, so two concurrent submissions collide.

---

## Authorization: the asymmetry worth knowing

The repository's `self-approval` bug pattern holds the leave module up as the
good example, citing `canOverrideLeaveDecision`, which checks the self condition
**before** the elevated-role bypass. That is true of that function. It is not
true of the other one, which runs first.

| Function | Order | Outcome |
|---|---|---|
| `attendance.service.ts:1820` `assertCanActionCorrection` | self-check before everything | correct — elevated roles barred too |
| `leave.service.ts:2156` `canOverrideLeaveDecision` | self before elevated | correct, but only consulted **second** |
| `leave.service.ts:2123` `canUserActOnStep` | **elevated bypass before self** | elevated roles can self-approve |

`processLeaveRequestDecision` (`:1533-1543`) consults `canOverrideLeaveDecision`
only when `canUserActOnStep` already said no — so for a `global-admin` or
`system-admin` the correctly-ordered check is never reached. [[BUG-1970]].

**Status of this finding: code-confirmed, live-unverified.** A live attempt did
produce a 201 on self-approval, but the matrix rule explicitly named the
requester as approver — self-approval *by configuration*, which a tenant is
entitled to set up. What it does show is that the product does not independently
refuse `requester == approver`. Proving the bypass needs a matrix naming a
different approver plus a second activated user. **Close it with a unit test,
not a live probe.**

`hasElevatedTenantRole` covers exactly `global-admin` and `system-admin`. `hr`
and `manager` are **not** elevated, so the self-check fires correctly for them.
The exposure is scoped to the two admin roles — which is exactly who you are
logged in as on a demo tenant.

Two further authorization notes:

- **Approval reach is governed by the `employees` entity, not `leave-requests`.**
  `canOverrideLeaveDecision` intersects with the caller's `employees` READ scope,
  deliberately.
- **`canViewAllTenantLeaveRequests` checks two permission keys that do not
  exist.** `leave-requests.manage` and `leaves.manage` appear only at these call
  sites and in `inbox.service.ts:411-412`; neither is defined in
  `common/constants/permissions.ts`, so no role can hold them. The function
  reduces to `hasElevatedTenantRole`, which means **an `hr`-role user has no
  tenant-wide leave visibility** — `GET /leave-requests/team` returns only their
  own reporting line. That is `defined-but-unwired-permission`, inverted.

Attendance does not use `buildScopedAccessWhere` at all and rolls its own
scoping. Five places in it look thin, in descending order of value:
`overrideAttendanceEntry` scope-checks the entry and then delegates to
`updateManualEntry`, which accepts `dto.employeeId` — **pass an in-scope entry id
with an out-of-scope `employeeId` and the write lands**; `createManualEntry` and
`updateManualEntry` check tenant membership only; `deleteAttendanceEntry` and
`importAttendance` are tenant-wide for anyone satisfying
`canManageTenantAttendance`.

## Cross-module scenarios worth running

1. Approve leave covering tomorrow, then check in tomorrow → `409`. The only
   genuine leave↔attendance coupling.
2. Leave self-approval as an elevated user → expect `200` where the pattern doc
   says `403`; run it back to back with attendance correction self-approval,
   which correctly returns `403`. The contrast is the report.
3. Override an in-scope attendance entry onto an out-of-scope employee.
4. Leave spanning a weekend → `totalDays` counts calendar days.
5. Submit leave where one step of the chain cannot resolve → `400`, whole
   submission rejected.
6. Cancel an approved leave request → `409`, then confirm the dates stay
   permanently blocked.
7. Check in, skip check-out, wait a day, check out → multi-day duration.

## Related

[[attendance]] · [[approvals]] · [[employees]] · [[organization]] ·
[[settings-and-configuration]] · [[starter-plan-scope]] · [[rbac]] ·
[[notifications]]
