import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { apiRequestJson } from "@/lib/server-api";

/**
 * The reconciled view of one attendance day.
 *
 * Shows what the engine derived and, just as importantly, WHY: the individual
 * work periods, where each happened, and anything it could not resolve. The
 * existing record page shows a single check-in and check-out, which is the whole
 * truth for most days and demonstrably not for a hybrid one.
 *
 * TRUTHFULNESS. Nothing here is shown until reconciliation has actually produced
 * it. A day the engine has not processed says so rather than presenting a
 * confident "8h worked" assembled in the browser — raw evidence arriving is not
 * the same as attendance being decided.
 */

type Session = {
  id: string;
  sequence: number;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  workMode: string;
  workSiteName: string | null;
  startSource: string;
  endSource: string | null;
  status: string;
  isBreak: boolean;
  isAdjusted: boolean;
};

type ExceptionRow = {
  id: string;
  type: string;
  status: string;
  severity: string;
  message: string;
};

type AttendanceDayResponse = {
  exists: boolean;
  status?: string;
  scheduledMinutes?: number;
  workedMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  fieldMinutes?: number;
  breakMinutes?: number;
  lateMinutes?: number;
  earlyArrivalMinutes?: number;
  earlyDepartureMinutes?: number;
  extraMinutes?: number;
  approvedOvertimeMinutes?: number;
  derivedWorkMode?: string | null;
  onLeave?: boolean;
  isHoliday?: boolean;
  isWeekend?: boolean;
  locked?: boolean;
  lockReason?: string | null;
  lastReconciledAt?: string | null;
  shift?: { name: string; startTime: string; endTime: string } | null;
  sessions: Session[];
  exceptions: ExceptionRow[];
};

export async function AttendanceDayPanel({
  employeeId,
  date,
}: {
  employeeId: string;
  /** The attendance date, YYYY-MM-DD. */
  date: string;
}) {
  let day: AttendanceDayResponse | null = null;

  try {
    day = await apiRequestJson<AttendanceDayResponse>(
      `/attendance/engine/days/${encodeURIComponent(employeeId)}/${encodeURIComponent(date)}`,
    );
  } catch {
    // A panel that cannot load must not take the record page down with it. The
    // page's own data is already rendered above; this is additional detail.
    return null;
  }

  if (!day?.exists) {
    return (
      <SectionCard
        title="Work periods"
        description="How this day was worked, once DijiPeople has reconciled it."
      >
        <p className="text-sm text-muted">
          This day has not been reconciled yet. Individual work periods appear
          here once the attendance sources for the day have been processed.
        </p>
      </SectionCard>
    );
  }

  const workSessions = day.sessions.filter((session) => !session.isBreak);
  const breaks = day.sessions.filter((session) => session.isBreak);
  const openExceptions = day.exceptions.filter(
    (exception) => exception.status === "OPEN",
  );

  return (
    <>
      <SectionCard
        title="Work periods"
        description={
          day.shift
            ? `Scheduled ${day.shift.startTime}–${day.shift.endTime} (${day.shift.name}).`
            : "No shift was scheduled for this day."
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <StatusPill tone={dayStatusTone(day.status)}>
            {dayStatusLabel(day.status)}
          </StatusPill>
          {day.derivedWorkMode ? (
            <StatusPill tone="neutral">
              {workModeLabel(day.derivedWorkMode)}
            </StatusPill>
          ) : null}
          {day.locked ? (
            <StatusPill tone="muted">
              Locked{day.lockReason ? ` · ${day.lockReason}` : ""}
            </StatusPill>
          ) : null}
          {day.onLeave ? <StatusPill tone="warning">On leave</StatusPill> : null}
          {day.isHoliday ? <StatusPill tone="neutral">Holiday</StatusPill> : null}
        </div>

        {workSessions.length === 0 ? (
          <p className="text-sm text-muted">
            No work periods were recorded for this day.
          </p>
        ) : (
          <ul className="grid gap-3">
            {workSessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill tone={workModeTone(session.workMode)}>
                    {workModeLabel(session.workMode)}
                  </StatusPill>
                  <span className="text-sm font-medium text-foreground">
                    {formatTime(session.startedAt)} –{" "}
                    {session.endedAt ? formatTime(session.endedAt) : "not recorded"}
                  </span>
                  {session.workSiteName ? (
                    <span className="text-sm text-muted">
                      {session.workSiteName}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted">
                    {sourceLabel(session.startSource)}
                  </span>
                  {session.isAdjusted ? (
                    <StatusPill tone="warning">Adjusted</StatusPill>
                  ) : null}
                  <span className="text-sm font-semibold text-foreground">
                    {formatDuration(session.durationMinutes)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Worked" value={formatDuration(day.workedMinutes)} />
          <Metric label="Scheduled" value={formatDuration(day.scheduledMinutes)} />
          {/* Shown only when they are non-zero: a row of dashes tells nobody
              anything, and a hybrid day is the only one where the split matters. */}
          {day.officeMinutes ? (
            <Metric label="Office" value={formatDuration(day.officeMinutes)} />
          ) : null}
          {day.remoteMinutes ? (
            <Metric label="Remote" value={formatDuration(day.remoteMinutes)} />
          ) : null}
          {day.fieldMinutes ? (
            <Metric label="Field" value={formatDuration(day.fieldMinutes)} />
          ) : null}
          {breaks.length > 0 ? (
            <Metric label="Breaks" value={formatDuration(day.breakMinutes)} />
          ) : null}
          {day.lateMinutes ? (
            <Metric
              label="Late"
              tone="warning"
              value={formatDuration(day.lateMinutes)}
            />
          ) : null}
          {day.earlyDepartureMinutes ? (
            <Metric
              label="Left early"
              tone="warning"
              value={formatDuration(day.earlyDepartureMinutes)}
            />
          ) : null}
          {day.earlyArrivalMinutes ? (
            <Metric
              label="Arrived early"
              value={formatDuration(day.earlyArrivalMinutes)}
            />
          ) : null}
          {day.extraMinutes ? (
            <Metric
              label="Beyond schedule"
              // Deliberately not called overtime: extra time becomes overtime
              // when it is approved, not when it is worked.
              value={formatDuration(day.extraMinutes)}
            />
          ) : null}
          {day.approvedOvertimeMinutes ? (
            <Metric
              label="Approved overtime"
              value={formatDuration(day.approvedOvertimeMinutes)}
            />
          ) : null}
        </dl>
      </SectionCard>

      {day.exceptions.length > 0 ? (
        <SectionCard
          title="Needs attention"
          description="Things DijiPeople could not resolve on its own for this day."
        >
          <ul className="grid gap-3">
            {day.exceptions.map((exception) => (
              <li
                key={exception.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border px-4 py-3"
              >
                <div className="grid gap-1">
                  <span className="text-sm font-medium text-foreground">
                    {exceptionLabel(exception.type)}
                  </span>
                  <span className="text-sm text-muted">{exception.message}</span>
                </div>
                <StatusPill
                  tone={exception.status === "OPEN" ? "warning" : "good"}
                >
                  {exceptionStatusLabel(exception.status)}
                </StatusPill>
              </li>
            ))}
          </ul>
          {openExceptions.length === 0 ? (
            <p className="mt-4 text-xs leading-5 text-muted">
              Everything here has been dealt with. Resolved items are kept so the
              record of what was corrected, and why, stays intact.
            </p>
          ) : null}
        </SectionCard>
      ) : null}
    </>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className={
          tone === "warning"
            ? "text-sm font-semibold text-amber-600"
            : "text-sm font-semibold text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** "8h 30m", the way a person says it. */
function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes === 0) return "0m";

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function workModeLabel(mode: string): string {
  switch (mode) {
    case "REMOTE":
      return "Remote";
    case "HYBRID":
      return "Hybrid";
    case "FIELD":
      return "Field";
    case "OFFICE":
    default:
      return "Office";
  }
}

function workModeTone(mode: string): "good" | "info" | "neutral" {
  switch (mode) {
    case "REMOTE":
      return "info";
    case "FIELD":
      return "neutral";
    case "OFFICE":
    default:
      return "good";
  }
}

/**
 * Where the punch came from, in plain words.
 *
 * "Device" rather than the raw capture source, and never a vendor code: an
 * employee looking at their own day has no use for `punchStateRaw`.
 */
function sourceLabel(source: string): string {
  switch (source) {
    case "DEVICE":
      return "Device";
    case "WEB":
      return "Web";
    case "MOBILE":
      return "Mobile";
    case "MANUAL":
      return "Added by HR";
    case "API":
      return "Integration";
    case "FILE":
      return "Imported";
    default:
      return source;
  }
}

function dayStatusLabel(status: string | undefined): string {
  switch (status) {
    case "PRESENT":
      return "Present";
    case "PARTIAL":
      return "Partly worked";
    case "ABSENT":
      return "Absent";
    case "ON_LEAVE":
      return "On leave";
    case "HOLIDAY":
      return "Holiday";
    case "WEEKEND":
      return "Non-working day";
    case "OFF_DAY":
      return "Off day";
    case "NEEDS_REVIEW":
      return "Needs review";
    case "PENDING":
    default:
      return "Not yet reconciled";
  }
}

function dayStatusTone(
  status: string | undefined,
): "good" | "warning" | "danger" | "muted" | "neutral" {
  switch (status) {
    case "PRESENT":
      return "good";
    case "NEEDS_REVIEW":
    case "PARTIAL":
      return "warning";
    case "ABSENT":
      return "danger";
    case "ON_LEAVE":
    case "HOLIDAY":
    case "WEEKEND":
    case "OFF_DAY":
      return "neutral";
    default:
      return "muted";
  }
}

function exceptionLabel(type: string): string {
  switch (type) {
    case "MISSING_CHECKIN":
      return "No check-in recorded";
    case "MISSING_CHECKOUT":
      return "No check-out recorded";
    case "OVERLAPPING_SESSION":
      return "Overlapping work periods";
    case "UNKNOWN_PUNCH_DIRECTION":
      return "Unclear punch";
    case "UNAUTHORIZED_WORK_SITE":
      return "Unexpected work site";
    case "ATTENDANCE_DURING_LEAVE":
      return "Attendance during approved leave";
    case "WORK_MODE_POLICY_CONFLICT":
      return "Work arrangement conflict";
    case "GEOFENCE_FAILURE":
      return "Location outside the work site";
    case "GPS_ACCURACY_FAILURE":
      return "Location not accurate enough";
    case "DEVICE_CLOCK_WARNING":
      return "Device clock drift";
    case "LATE_ARRIVING_EVENT":
      return "Attendance arrived late";
    case "LOCKED_PERIOD_EVENT":
      return "Arrived after the period was finalised";
    case "CROSS_SITE_SESSION":
      return "Started and ended at different sites";
    case "DUPLICATE_SEMANTIC_PUNCH":
      return "Repeated punch";
    case "ATTENDANCE_OUTSIDE_EMPLOYMENT":
      return "Outside the employment period";
    case "HOLIDAY_WORK":
      return "Worked on a holiday";
    case "WEEKEND_WORK":
      return "Worked on a non-working day";
    case "IMPOSSIBLE_TRAVEL":
      return "Implausible travel between sites";
    default:
      return type;
  }
}

function exceptionStatusLabel(status: string): string {
  switch (status) {
    case "RESOLVED":
      return "Resolved";
    case "IGNORED":
      return "Ignored";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "OPEN":
    default:
      return "Open";
  }
}
