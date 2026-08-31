# Reports metric definitions

What each metric counts, where it comes from, and what it cannot tell you. This
is the canonical definition of every business metric the reporting platform
exposes; how the engine computes them is
[`reports-and-analytics.md`](reports-and-analytics.md).

A metric has exactly one definition. The dashboard, an analytics tile, a report
column, an export and a scheduled email must not be able to disagree about what
"headcount" means, so a caller names a metric and never supplies a calculation.
The registry lives at `services/api/src/modules/reporting/metrics/`, and
`metric-registry.spec.ts` proves every field a metric names actually exists.

---

## How to read the tables

- **Calculation** is the registry's own `ReportMetricCalculation`. `ratio` is a
  ratio of sums, never an average of per-row ratios — see below.
- **Caveats** are shipped with the metric and rendered next to it in the UI. They
  are part of the definition, not documentation: a number displayed without its
  caveat is a misleading number.

### The one rule worth stating twice

**A ratio is `SUM(numerator) / SUM(denominator)`.** Averaging a per-row
percentage across employees is a ratio of ratios and is a different, wrong
number. `DailyProductivitySummary.utilizationPercent` is the live example: the
average of ten employees' utilization percentages is not the team's active share,
because each employee's denominator differs.

---

## Workforce

Source `workforce` (`Employee`) for current state; `workforce_history`
(`WorkforceSnapshotDaily`) for anything time-sliced.

| Metric | Calculation | Notes |
|---|---|---|
| Headcount | `count` | Current population. **Not narrowed by the period** — `Employee`'s only date is `hireDate`, so narrowing would silently answer "hired in this window". |
| Active headcount | `filtered_count` on `employment_status = ACTIVE` | |
| On probation / Serving notice | `filtered_count` on the status | |
| Historical headcount | `count` on `workforce_history` | The as-of figure. This is the one to trend. |
| Joiners / Leavers | `filtered_count` on `is_joiner` / `is_leaver` | Derived per snapshot day. |
| Net change | `derived` | Joiners − leavers. |
| Turnover rate | `derived` | Leavers ÷ average headcount over the period. |
| Retention rate | `derived` | 1 − turnover. |
| Average tenure | `avg` of `tenure_days` | Frozen at termination for a leaver. |

**Every employee query excludes soft-deleted rows** (`isDeleted: false,
deletedAt: null`), expressed once as the source's `baseWhere`. The old
`/reports/headcount-summary` omitted it and disagreed with the Employees screen
(BUG-2625).

**Caveats.** Rows in `workforce_history` marked `derivation = BACKFILLED` were
reconstructed from hire and termination dates: they place an employee in their
*current* department, and cannot see a status that changed and changed back.
History begins the day the snapshot job was first enabled for the tenant.

**Not available, and why.** Turnover *by reason*, voluntary vs involuntary, and
regrettable vs not: `Employee` has `terminationDate` and a status and nothing
else — no reason, no exit type, no last working day, no exit interview anywhere
in the schema. Promotion and internal-mobility rates: there is no promotion
event; `EmployeeLevel.nextEmployeeLevelId` describes the ladder, not anyone's
movement on it.

---

## Attendance

Source `attendance` (`AttendanceDay`) — one row per employee per shift day, with
non-null minute columns and a real scheduled denominator.

| Metric | Calculation | Notes |
|---|---|---|
| Attendance rate | `ratio` worked ÷ scheduled minutes | |
| Present days | `filtered_count` on status in `PRESENT`, `PARTIAL` | |
| Absent days | `filtered_count` on `ABSENT` | |
| Late arrivals | `filtered_count` on `late_minutes > 0` | |
| Early departures | `filtered_count` on `early_departure_minutes > 0` | |
| Average worked minutes | `avg` of `worked_minutes` | |
| Total worked hours | `sum` of `worked_minutes` | |
| Approved overtime | `sum` of `approved_overtime_minutes` | |
| Extra minutes | `sum` of `extra_minutes` | **Not** overtime. |
| Open exceptions | `sum` of `open_exception_count` | |

**Approved overtime and extra time are different columns and different
questions.** Time worked beyond schedule is `extraMinutes`; overtime is time an
approver signed off. The schema comment is explicit, and collapsing them would
turn an unapproved long day into payable overtime.

**Caveats.** `AttendanceDay` exists only for days the reconciliation engine has
processed; older tenants may have `AttendanceEntry` rows with no matching day.
`AttendanceDayStatus.PENDING` means the engine has not finished, and is excluded
from every denominator — in the source's `baseWhere`, so no metric can forget.

---

## Leave

Sources `leave_requests`, `leave_consumption`, `leave_balances`.

| Metric | Calculation | Notes |
|---|---|---|
| Requests raised | `count` | By `startDate` within the period. |
| Approved / rejected / pending / cancelled | `filtered_count` on status | |
| Leave days taken | `sum` of `leave_consumption.days` | One consumption row per request, not per day. |
| Employees currently on leave | `filtered_count` using `$NOW` | An as-of-this-instant question, not a period one. |
| Upcoming leave | `filtered_count` using `$NOW` | |

**Not available.** Leave balance *as of a past date*, prior-year balances,
carry-forward actuals and an accrual ledger. `LeaveBalance` is a single
current-state row per employee and leave type with no year, period or cycle
column, overwritten in place, and no history table exists. Also unavailable:
which specific days a request covered, and which half of a half-day — there is no
`LeaveRequestDay` and no half-day-period column, only a date range and a
`Decimal` total. A three-day range spanning a weekend is indistinguishable from
three working days except through `AttendanceDay`.

---

## Recruitment

Sources `recruitment_openings`, `recruitment_candidates`,
`recruitment_applications`, `recruitment_stage_transitions`.

| Metric | Calculation | Notes |
|---|---|---|
| Open requisitions | `filtered_count` on `status = OPEN` | |
| Candidates / Applications | `count` | |
| Hires | `filtered_count` on `stage = HIRED` | |
| Funnel conversion | `derived` from stage transitions | Order stages by `RecruitmentPipelineStage.sortOrder`, never enum ordinal. |
| Time to hire | `derived` | `appliedAt` → the transition into `HIRED`. |
| Source effectiveness | `derived` | See the caveat. |

`ApplicationStageHistory` is what makes the funnel and time-to-hire real: it
records `fromStage`, `toStage` and `changedAt`, indexed for exactly this.

**Caveats.** `Candidate.source` is free text with no lookup table and no enum, so
source effectiveness groups on whatever was typed. `RecruitmentStage` mixes
linear stages with terminal states (`REJECTED`, `ON_HOLD`, `WITHDRAWN`), so funnel
logic must respect `RecruitmentPipelineStage.isTerminal`.

**Not available.** Offer accept/decline rates, offer amounts and decline reasons —
there is no `Offer` model at all; `OFFER` is a stage. Interview scheduling metrics
(no-show, reschedule, time-to-schedule) — there is no `Interview` model;
`CandidateEvaluation` is written after the fact. Requisition ageing, fill rate and
open-reqs-by-department — `JobOpening` has no opened-at, closed-at, headcount,
department or hiring manager, and its status changes are not logged.

---

## Desktop activity

Sources `desktop_activity` (`DailyProductivitySummary`) and `desktop_devices`
(`EmployeeDevice`). Visible to HR and administrators, and to each employee for
their own data. A manager receives no individual desktop telemetry — an owner
decision, recorded in EXECPLAN-0030.

| Metric | Calculation | Notes |
|---|---|---|
| Average active / idle / session seconds | `avg` | |
| Active share of agent uptime | `ratio` active ÷ logged-in | **Denominator is agent uptime, not scheduled hours.** |
| Employees reporting | `count_distinct` of employee | |
| Devices reporting / never connected | `filtered_count` on `last_seen_at` | |
| Outdated agent devices | `derived` via `compareSemver` | Reuses `tenant-apps.service.ts`. |
| Telemetry coverage | `derived` | Samples received vs expected in a session. |

**Language is neutral by design.** Active time, Idle time, Session time,
Telemetry coverage — never Productive, Efficiency or Productivity score. Someone
reading, in a meeting, presenting, or working on paper is not idle in any sense
the product is entitled to judge.

**Caveats, all four shipped with every desktop metric.**

1. The day boundary is **UTC**. `DailyProductivitySummary.date` is a UTC midnight
   and no tenant timezone is applied, so a "day" here does not line up with the
   tenant's attendance day.
2. Totals are **nominal**, not measured: samples × the configured heartbeat
   interval. Time when the agent was not running is absent, not zero, and a
   tenant that changes the interval changes the unit of every later total.
3. Rows written before the `ActivityEvent.dedupeKey` fix are **known-inflated**
   and were never corrected (ITEM-0032). A trend crossing that migration shows a
   step change that is an artifact.
4. The lookback is bounded by the tenant's
   `AgentTrackingSettings.historyRetentionDays`, 90 days by default, which is
   enforced by deletion. The platform deliberately keeps no longer-retention
   copy: that would circumvent the tenant's own retention policy.

**Not built, because the source data does not exist.** Application usage by
category, per-application duration and browser domains. `ActivityEvent` stores a
raw executable name and a window title; there is no category table, no duration
column, and no URL anywhere in the schema. Building them would mean inventing a
taxonomy and presenting inference as measurement.

**Never surfaced, though it exists.** `ClipboardCaptureEvent`,
`ScreenCaptureEvent` and `DlpAlert` are not joined into any reporting data
source. They are a separate authorization domain (`dlp.review`), default off in
every tenant, and a *count* of an employee's clipboard events is itself
surveillance output.

---

## Money

Any money metric must go through the reporting-currency contract in
[`platform-fx-reporting.md`](platform-fx-reporting.md). Only the nullable
`*Reporting` columns on `PayrollRunEmployee` and `PayrollRunLineItem` are
summable across employees; rows whose reporting amount is null are excluded, never
coalesced to the local amount. `PayrollCycle`/`PayrollRecord` is a second, legacy
fact table — summing it alongside `PayrollRunEmployee` double-counts. BUG-1745 is
precisely this failure.

---

## Three utilizations, three names

They are different questions and must never share a metric name:

| Name | Numerator ÷ denominator | Source |
|---|---|---|
| Active share of agent uptime | active ÷ logged-in seconds | `DailyProductivitySummary` |
| Attendance rate | worked ÷ scheduled minutes | `AttendanceDay` |
| Billable utilization | billable ÷ required hours | `Timesheet` |
