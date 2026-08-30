import Link from "next/link";
import type { ReactNode } from "react";
import { AttendanceCorrectionActions } from "@/app/components/attendance-corrections/attendance-correction-actions";
import {
  label,
  statusTone,
} from "@/app/components/attendance-corrections/attendance-corrections-table";
import type { AttendanceCorrectionRequest } from "@/app/components/attendance-corrections/attendance-correction-types";
import { StatusPill } from "@/app/components/ui/status-pill";
import { requireSessionUser } from "@/lib/auth";
import { hasElevatedTenantRole } from "@/lib/elevated-roles";
import { hasAnyPermission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/formatting-context";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS, ROLE_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../../_components/access-denied-state";

type AttendanceCorrectionDetailPageProps = {
  params: Promise<{ id: string }>;
};

const READ_PERMISSION_KEYS = [
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_READ,
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_READ_OWN,
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_READ_TEAM,
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_APPROVE,
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_REJECT,
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_MANAGE,
];

export default async function AttendanceCorrectionDetailPage({
  params,
}: AttendanceCorrectionDetailPageProps) {
  const user = await requireSessionUser("/");
  if (!canUseCorrectionWorkflow(user)) {
    return (
      <div className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your role does not include attendance correction workflow access."
          title="Attendance correction is unavailable for your account."
        />
      </div>
    );
  }

  const { id } = await params;
  const response = await apiRequestJson<{ item: AttendanceCorrectionRequest }>(
    `/attendance/correction-requests/${id}`,
  );
  const request = response.item;

  return (
    <div className="dp-theme-scope dp-attendance-scope space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            className="text-sm font-medium text-accent transition hover:text-accent-strong"
            href="/attendance/corrections"
          >
            Back to corrections
          </Link>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            Correction request
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            {request.requestNumber}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            {request.employeeName} requested {label(request.correctionType)}.
          </p>
        </div>
        <div className="space-y-3">
          <StatusPill tone={statusTone(request.status)}>
            {label(request.status)}
          </StatusPill>
          <AttendanceCorrectionActions
            canApprove={request.canApprove}
            canEdit={request.canEdit}
            canReject={request.canReject}
            requestId={request.id}
            requestedCheckInAtUtc={request.requestedCheckInAtUtc}
            requestedCheckOutAtUtc={request.requestedCheckOutAtUtc}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <DetailCard title="Request Summary">
          <DetailRow labelText="Employee" value={request.employeeName} />
          <DetailRow labelText="Employee code" value={request.employee.employeeCode ?? "No code"} />
          <DetailRow labelText="Submitted" value={formatDateTime(request.submittedAtUtc ?? request.createdAtUtc)} />
          <DetailRow labelText="Requested by" value={formatPerson(request.requestedByUser)} />
          <DetailRow labelText="Actioned by" value={request.actionedByUser ? formatPerson(request.actionedByUser) : "Not actioned"} />
        </DetailCard>

        <DetailCard title="Original Values">
          <DetailRow labelText="Original check-in" value={formatOptionalDate(request.originalCheckInAtUtc)} />
          <DetailRow labelText="Original check-out" value={formatOptionalDate(request.originalCheckOutAtUtc)} />
          <DetailRow labelText="Source entry" value={request.attendanceEntryId ?? "New attendance entry"} />
        </DetailCard>

        <DetailCard title="Requested Values">
          <DetailRow labelText="Requested check-in" value={formatOptionalDate(request.requestedCheckInAtUtc)} />
          <DetailRow labelText="Requested check-out" value={formatOptionalDate(request.requestedCheckOutAtUtc)} />
          <DetailRow labelText="Decision comment" value={request.actionComment ?? "No decision comment"} />
        </DetailCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <DetailCard title="Reason">
          <p className="text-sm leading-6 text-foreground">{request.reason}</p>
        </DetailCard>
        <DetailCard title="Related Records">
          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
              href={`/employees/${request.employeeId}`}
            >
              Open employee
            </Link>
            {request.attendanceEntryId ? (
              <Link
                className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                href={`/attendance?recordId=${encodeURIComponent(request.attendanceEntryId)}`}
              >
                Open attendance record
              </Link>
            ) : null}
          </div>
        </DetailCard>
      </section>

      <DetailCard title="Approval Timeline">
        {request.approval?.steps.length ? (
          <div className="space-y-4">
            {request.approval.steps.map((step) => (
              <div
                className="rounded-xl border border-border bg-white px-4 py-3"
                key={step.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {step.stepOrder}. {step.stepName}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Due {step.dueAtUtc ? formatDateTime(step.dueAtUtc) : "not configured"} · SLA {label(step.slaStatus)}
                    </p>
                  </div>
                  <StatusPill tone={statusTone(step.status)}>
                    {label(step.status)}
                  </StatusPill>
                </div>
                <div className="mt-3 space-y-2 text-sm text-muted">
                  {step.assignments.map((assignment) => (
                    <p key={assignment.id}>
                      {assignment.assignedToUser
                        ? formatPerson(assignment.assignedToUser)
                        : "Unassigned"}{" "}
                      · {label(assignment.status)}
                    </p>
                  ))}
                </div>
              </div>
            ))}
            <div className="space-y-2">
              {(request.approval.actions ?? []).map((action) => (
                <p className="text-sm text-muted" key={action.id}>
                  {formatDateTime(action.actionAtUtc)} · {label(action.actionType)} by{" "}
                  {formatPerson(action.actionByUser)}
                  {action.comment ? `: ${action.comment}` : ""}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Approval tracking has not been created yet.</p>
        )}
      </DetailCard>
    </div>
  );
}

function canUseCorrectionWorkflow(user: {
  permissionKeys: string[];
  roleKeys?: string[] | null;
}) {
  return (
    hasAnyPermission(user.permissionKeys, READ_PERMISSION_KEYS) ||
    hasElevatedTenantRole(user.roleKeys) ||
    (user.roleKeys ?? []).some(
      (roleKey) => roleKey === ROLE_KEYS.MANAGER || roleKey === ROLE_KEYS.HR,
    )
  );
}

function DetailCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function DetailRow({
  labelText,
  value,
}: {
  labelText: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {labelText}
      </p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function formatOptionalDate(value: string | null) {
  return value ? formatDateTime(value) : "Not set";
}

function formatPerson(person: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const fullName = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return fullName || person.email;
}
