import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { formatDateWithTenantSettings } from "@/lib/date-format";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { LeavesCommandBar } from "../_components/leaves-command-bar";
import { LeaveRequestStatusBadge } from "../_components/leave-request-status-badge";
import { LeaveRequestRecord } from "../types";

type LeaveDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const dateFormatting = {
  dateFormat: "MM/dd/yyyy",
  locale: "en-US",
  timezone: "UTC",
};

export default async function LeaveDetailPage({
  params,
}: LeaveDetailPageProps) {
  const { id } = await params;
  const request = await loadLeaveRequest(id);

  if (!request) {
    notFound();
  }

  if (request === "ACCESS_DENIED") {
    return (
      <main className="dp-theme-scope dp-leaves-scope grid gap-6">
        <AccessDeniedState
          description="You no longer have access to this leave request."
          title="Leave request access denied."
        />
      </main>
    );
  }

  return (
    <main className="dp-theme-scope dp-leaves-scope grid gap-6">
      <LeavesCommandBar
        canApproveLeave={request.canCurrentUserApprove}
        canRejectLeave={request.canCurrentUserReject}
        context="detail"
        leaveRequestCode={request.id}
        leaveRequestId={request.id}
      />

      <section className="grid gap-4 rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted">
              Leave request
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              {request.employee.fullName}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {request.employee.employeeCode} · {request.leaveType.name}
            </p>
          </div>
          <LeaveRequestStatusBadge status={request.status} />
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem
            label="Start date"
            value={formatDateWithTenantSettings(
              request.startDate,
              dateFormatting,
            )}
          />
          <DetailItem
            label="End date"
            value={formatDateWithTenantSettings(request.endDate, dateFormatting)}
          />
          <DetailItem label="Total days" value={`${request.totalDays}`} />
          <DetailItem label="Leave category" value={request.leaveType.category} />
        </dl>

        <div className="grid gap-2">
          <h2 className="text-sm font-semibold text-foreground">Reason</h2>
          <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-muted">
            {request.reason || "No reason provided."}
          </p>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">
          Approval timeline
        </h2>
        <div className="grid gap-3">
          {request.approvalSteps.length > 0 ? (
            request.approvalSteps.map((step) => (
              <div
                className="rounded-xl border border-border bg-surface p-4"
                key={step.id}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Step {step.stepOrder}: {step.approverType}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {step.approverUser
                        ? `${step.approverUser.firstName} ${step.approverUser.lastName}`
                        : "Approver pending assignment"}
                    </p>
                  </div>
                  <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold uppercase text-muted">
                    {step.status}
                  </span>
                </div>
                {step.comments ? (
                  <p className="mt-3 text-sm text-muted">{step.comments}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">No approval steps recorded.</p>
          )}
        </div>
      </section>

      {request.documents?.length ? (
        <section className="grid gap-4 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Attachments</h2>
          <div className="grid gap-2">
            {request.documents.map((document) => (
              <Link
                className="text-sm font-medium text-accent transition hover:text-accent-strong"
                href={document.downloadPath}
                key={document.id}
                target="_blank"
              >
                {document.documentType?.name || "Attachment"}:{" "}
                {document.originalFileName}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

async function loadLeaveRequest(id: string) {
  try {
    return await apiRequestJson<LeaveRequestRecord>(`/leave-requests/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 403) return "ACCESS_DENIED" as const;
      if (error.status === 404) return null;
    }
    throw error;
  }
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <dt className="text-xs font-semibold uppercase text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
