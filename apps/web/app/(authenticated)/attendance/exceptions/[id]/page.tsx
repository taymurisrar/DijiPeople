import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { ExceptionActions } from "../_components/exception-actions";
import { LocationEvidencePanel } from "../_components/location-evidence-panel";
import {
  exceptionStatusLabel,
  exceptionTypeLabel,
  severityLabel,
  severityTone,
  statusTone,
} from "../_lib/types";
import type { AttendanceExceptionDetail } from "../_lib/detail-types";

type PageProps = { params: Promise<{ id: string }> };

/**
 * One exception, with everything needed to decide what to do about it.
 *
 * A full page rather than a drawer because the attendance module already uses
 * detail routes for equivalent records — attendance entries and correction
 * requests both have them — and introducing a drawer here would add a second
 * pattern for the same job.
 *
 * The reviewer's question is "should this count, and why". Answering it needs the
 * reconciled day, the sessions behind it, the leave and shift context and any
 * correction already raised, so all of it arrives in one request.
 */
export default async function AttendanceExceptionDetailPage({
  params,
}: PageProps) {
  const [{ id }, user] = await Promise.all([params, requireSessionUser("/")]);

  if (!hasAnyPermission(user.permissionKeys, [PERMISSION_KEYS.ATTENDANCE_READ])) {
    return (
      <div className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your role does not include attendance access."
          title="This attendance exception is unavailable for your account."
        />
      </div>
    );
  }

  let detail: AttendanceExceptionDetail;
  try {
    detail = await apiRequestJson<AttendanceExceptionDetail>(
      `/attendance/engine/exceptions/${encodeURIComponent(id)}`,
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return (
        <div className="dp-theme-scope dp-attendance-scope grid gap-6">
          <AccessDeniedState
            description={error.message}
            title="You cannot view this attendance exception."
          />
        </div>
      );
    }
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  const canManage = hasAnyPermission(user.permissionKeys, [
    PERMISSION_KEYS.ATTENDANCE_MANAGE,
  ]);
  const day = detail.attendanceDay;

  return (
    <div className="dp-theme-scope dp-attendance-scope grid gap-6">
      <header className="grid gap-2">
        <Link
          className="text-sm text-muted hover:underline"
          href="/attendance/exceptions"
        >
          ← Back to exceptions
        </Link>
        <h2 className="text-2xl font-semibold text-foreground">
          {exceptionTypeLabel(detail.type)}
        </h2>
        <p className="text-sm text-muted">{detail.message}</p>
      </header>

      <SectionCard title="Summary" description="What was found, and where it stands.">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Employee">
            {detail.employee.name}
            {detail.employee.employeeCode ? (
              <span className="block text-xs text-muted">
                {detail.employee.employeeCode}
              </span>
            ) : null}
          </Row>
          <Row label="Attendance date">{formatDate(detail.attendanceDate)}</Row>
          <Row label="Severity">
            <StatusPill tone={severityTone(detail.severity)}>
              {severityLabel(detail.severity)}
            </StatusPill>
          </Row>
          <Row label="Status">
            <StatusPill tone={statusTone(detail.status)}>
              {exceptionStatusLabel(detail.status)}
            </StatusPill>
          </Row>
          <Row label="Detected">{formatDateTime(detail.detectedAt)}</Row>
          <Row label="Work site">{detail.workSite?.name ?? "—"}</Row>
          {detail.resolvedAt ? (
            <Row label="Resolved">{formatDateTime(detail.resolvedAt)}</Row>
          ) : null}
          {detail.resolutionNote ? (
            <Row label="Resolution note">{detail.resolutionNote}</Row>
          ) : null}
        </dl>

        {canManage ? (
          <div className="mt-5">
            <ExceptionActions
              exceptionId={detail.id}
              status={detail.status}
            />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Attendance for this day"
        description="The reconciled result, from the attendance engine."
      >
        {day ? (
          <>
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
                  Finalised{day.lockReason ? ` · ${day.lockReason}` : ""}
                </StatusPill>
              ) : null}
            </div>

            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Row label="Scheduled shift">
                {day.shift
                  ? `${day.shift.name} · ${day.shift.startTime}–${day.shift.endTime}`
                  : "None scheduled"}
              </Row>
              {day.shift ? (
                <Row label="Grace">
                  {day.shift.lateGraceMinutes} min late ·{" "}
                  {day.shift.earlyExitGraceMinutes} min early
                </Row>
              ) : null}
              <Row label="Worked">{formatDuration(day.workedMinutes)}</Row>
              <Row label="Scheduled">{formatDuration(day.scheduledMinutes)}</Row>
              <Row label="Late">{formatDuration(day.lateMinutes)}</Row>
              <Row label="Left early">
                {formatDuration(day.earlyDepartureMinutes)}
              </Row>
              <Row label="Beyond schedule">
                {formatDuration(day.extraMinutes)}
              </Row>
              <Row label="Approved overtime">
                {formatDuration(day.approvedOvertimeMinutes)}
              </Row>
            </dl>
          </>
        ) : (
          // Never a guessed total. A day with no reconciled record says so.
          <p className="text-sm text-muted">
            Attendance is still being processed for this day. Totals appear once
            reconciliation has run.
          </p>
        )}
      </SectionCard>

      {detail.sessions.length > 0 ? (
        <SectionCard
          title="Work periods"
          description="The sessions the engine built for this day."
        >
          <ul className="grid gap-3">
            {detail.sessions.map((session) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"
                key={session.id}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill tone="neutral">
                    {workModeLabel(session.workMode)}
                  </StatusPill>
                  <span className="text-sm font-medium text-foreground">
                    {formatTime(session.startedAt)} –{" "}
                    {session.endedAt
                      ? formatTime(session.endedAt)
                      : "not recorded"}
                  </span>
                  {session.workSiteName ? (
                    <span className="text-sm text-muted">
                      {session.workSiteName}
                    </span>
                  ) : null}
                  {session.isBreak ? (
                    <StatusPill tone="muted">Break</StatusPill>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted">
                    {sourceLabel(session.startSource)}
                    {session.endSource && session.endSource !== session.startSource
                      ? ` → ${sourceLabel(session.endSource)}`
                      : ""}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatDuration(session.durationMinutes)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {detail.leave || day?.isHoliday || day?.isWeekend ? (
        <SectionCard
          title="Calendar context"
          description="Why this day may not be an ordinary working day."
        >
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {detail.leave ? (
              <>
                <Row label="Approved leave">
                  {detail.leave.typeName ?? "Leave"}
                </Row>
                <Row label="Leave period">
                  {formatDate(detail.leave.startDate)} –{" "}
                  {formatDate(detail.leave.endDate)}
                </Row>
                <Row label="Days">{String(detail.leave.totalDays ?? "—")}</Row>
              </>
            ) : null}
            {day?.isHoliday ? <Row label="Holiday">Yes</Row> : null}
            {day?.isWeekend ? <Row label="Non-working day">Yes</Row> : null}
          </dl>
        </SectionCard>
      ) : null}

      {detail.locationEvidence.relevant ? (
        <LocationEvidencePanel
          attendanceDate={detail.attendanceDate}
          employeeId={detail.employee.id}
          viewable={detail.locationEvidence.viewable}
        />
      ) : null}

      {detail.linkedCorrection || detail.corrections.length > 0 ? (
        <SectionCard
          title="Corrections"
          description="Requests raised against this day."
        >
          {detail.linkedCorrection ? (
            <div className="mb-4 rounded-2xl border border-border px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Raised for this exception
              </p>
              <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Row label="Type">{detail.linkedCorrection.correctionType}</Row>
                <Row label="Requested by">
                  {detail.linkedCorrection.requestedBy ?? "—"}
                </Row>
                <Row label="Status">
                  {exceptionStatusLabel(detail.linkedCorrection.status)}
                </Row>
                <Row label="Reason">{detail.linkedCorrection.reason}</Row>
                {detail.linkedCorrection.approver ? (
                  <Row label="Approver">{detail.linkedCorrection.approver}</Row>
                ) : null}
                {detail.linkedCorrection.decisionNote ? (
                  <Row label="Decision">
                    {detail.linkedCorrection.decisionNote}
                  </Row>
                ) : null}
              </dl>
              {/* Approval happens in the existing correction view, which already
                  handles the workflow. Duplicating the actions here would be a
                  second place to get the approval rules wrong. */}
              <Link
                className="mt-3 inline-block text-sm font-semibold text-accent hover:underline"
                href={`/attendance/corrections/${detail.linkedCorrection.id}`}
              >
                Review this correction →
              </Link>
            </div>
          ) : null}

          {detail.corrections.length > 0 ? (
            <ul className="grid gap-2">
              {detail.corrections.map((correction) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                  key={correction.id}
                >
                  <Link
                    className="text-sm font-medium text-accent hover:underline"
                    href={`/attendance/corrections/${correction.id}`}
                  >
                    {correction.requestNumber}
                  </Link>
                  <span className="text-sm text-muted">
                    {correction.correctionType}
                  </span>
                  <StatusPill tone={statusTone(correction.status)}>
                    {exceptionStatusLabel(correction.status)}
                  </StatusPill>
                </li>
              ))}
            </ul>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard
        title="History"
        description="Recorded events only — nothing is inferred."
      >
        <ol className="grid gap-2">
          {detail.history.map((entry, index) => (
            <li
              className="flex flex-wrap items-baseline gap-3"
              key={`${entry.label}-${index}`}
            >
              <span className="text-sm text-muted">
                {formatDateTime(entry.at)}
              </span>
              <span className="text-sm font-medium text-foreground">
                {entry.label}
              </span>
              {entry.detail ? (
                <span className="text-sm text-muted">{entry.detail}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes === 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleTimeString(undefined, {
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

/** Plain words. An employee's day detail has no use for a vendor code. */
function sourceLabel(source: string): string {
  switch (source) {
    case "DEVICE":
      return "Device";
    case "WEB":
      return "Web";
    case "MOBILE":
      return "Mobile";
    case "MANUAL":
      return "HR adjustment";
    case "API":
      return "Integration";
    case "FILE":
      return "Imported";
    default:
      return source;
  }
}

function dayStatusLabel(status: string): string {
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
      return "Pending reconciliation";
  }
}

function dayStatusTone(
  status: string,
): "good" | "warning" | "danger" | "muted" | "neutral" {
  switch (status) {
    case "PRESENT":
      return "good";
    case "NEEDS_REVIEW":
    case "PARTIAL":
      return "warning";
    case "ABSENT":
      return "danger";
    case "PENDING":
      return "muted";
    default:
      return "neutral";
  }
}
