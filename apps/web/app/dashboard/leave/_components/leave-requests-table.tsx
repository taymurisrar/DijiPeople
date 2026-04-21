import Link from "next/link";
import { LeaveRequestRecord } from "../types";
import { LeaveRequestActionButtons } from "./leave-request-action-buttons";
import { LeaveRequestStatusBadge } from "./leave-request-status-badge";

type LeaveRequestsTableProps = {
  requests: LeaveRequestRecord[];
  emptyDescription: string;
  emptyTitle: string;
  emptyActionHref?: string;
  emptyActionLabel?: string;
};

export function LeaveRequestsTable({
  requests,
  emptyActionHref,
  emptyActionLabel,
  emptyDescription,
  emptyTitle,
}: LeaveRequestsTableProps) {
  if (requests.length === 0) {
    return (
      <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          No leave requests
        </p>
        <h4 className="mt-3 text-2xl font-semibold text-foreground">
          {emptyTitle}
        </h4>
        <p className="mt-3 text-muted">{emptyDescription}</p>
        {emptyActionHref && emptyActionLabel ? (
          <div className="mt-6 flex justify-center">
            <Link
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
              href={emptyActionHref}
            >
              {emptyActionLabel}
            </Link>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-surface-strong text-left text-muted">
            <tr>
              <th className="px-5 py-4 font-medium">Employee</th>
              <th className="px-5 py-4 font-medium">Leave Type</th>
              <th className="px-5 py-4 font-medium">Dates</th>
              <th className="px-5 py-4 font-medium">Status</th>
              <th className="px-5 py-4 font-medium">Attachments</th>
              <th className="px-5 py-4 font-medium">Approval Flow</th>
              <th className="px-5 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white/90">
            {requests.map((request) => (
              <tr key={request.id} className="hover:bg-accent-soft/30">
                <td className="px-5 py-4 align-top">
                  <p className="font-semibold text-foreground">
                    {request.employee.fullName}
                  </p>
                  <p className="mt-1 text-muted">
                    {request.employee.employeeCode}
                  </p>
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  <p className="font-medium text-foreground">
                    {request.leaveType.name}
                  </p>
                  <p className="mt-1">{request.leaveType.category}</p>
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  <p>
                    {new Date(request.startDate).toLocaleDateString()} to{" "}
                    {new Date(request.endDate).toLocaleDateString()}
                  </p>
                  <p className="mt-1">{request.totalDays} day(s)</p>
                </td>
                <td className="px-5 py-4 align-top">
                  <LeaveRequestStatusBadge status={request.status} />
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {request.documents && request.documents.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {request.documents.map((document) => (
                        <a
                          key={document.id}
                          className="text-sm font-medium text-accent transition hover:text-accent-strong"
                          href={document.downloadPath}
                          target="_blank"
                        >
                          {document.documentType?.name || "Attachment"}:{" "}
                          {document.originalFileName}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p>No attachments</p>
                  )}
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {request.pendingStep ? (
                    <p>
                      Pending step {request.pendingStep.stepOrder}:{" "}
                      {request.pendingStep.approverType}
                    </p>
                  ) : (
                    <p>No pending step</p>
                  )}
                  {request.reason ? (
                    <p className="mt-2 max-w-xs">{request.reason}</p>
                  ) : null}
                </td>
                <td className="px-5 py-4 align-top">
                  <LeaveRequestActionButtons request={request} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
