import Link from "next/link";
import { AccessDeniedState } from "../../_components/access-denied-state";
import type { ApprovalRequestItem } from "@/app/components/approvals/approval-types";
import { requireSessionUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/formatting-context";
import { hasAnyPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";

type ApprovalDetailProps = {
  params: Promise<{ approvalId: string }>;
};

const APPROVAL_PERMISSIONS = [
  PERMISSION_KEYS.APPROVALS_READ,
  PERMISSION_KEYS.APPROVALS_READ_OWN,
  PERMISSION_KEYS.APPROVALS_READ_ASSIGNED,
  PERMISSION_KEYS.APPROVALS_READ_TEAM,
  PERMISSION_KEYS.APPROVALS_MANAGE,
];

export default async function ApprovalDetailPage({ params }: ApprovalDetailProps) {
  const user = await requireSessionUser("/");
  if (!hasAnyPermission(user.permissionKeys, APPROVAL_PERMISSIONS)) {
    return <AccessDeniedState />;
  }

  const { approvalId } = await params;
  const { item } = await apiRequestJson<{ item: ApprovalRequestItem }>(
    `/approvals/${approvalId}`,
  );

  return (
    <main className="space-y-6">
      <Link className="text-sm font-medium text-accent" href="/approvals">
        Back to approvals
      </Link>
      <section className="rounded-[24px] border border-border bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          {item.moduleKey}
        </p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-foreground">{item.title}</h2>
            <p className="mt-2 text-sm text-muted">{item.requestNumber ?? item.entityId}</p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href={item.relatedRecordUrl}
          >
            Open record
          </Link>
        </div>
      </section>

      <section className="grid gap-4">
        {item.steps.map((step) => (
          <article className="rounded-[22px] border border-border bg-white p-5 shadow-sm" key={step.id}>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Step {step.stepOrder}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">{step.stepName}</h3>
              </div>
              <p className="text-sm text-muted">
                Due {step.dueAtUtc ? formatDateTime(step.dueAtUtc) : "not set"}
              </p>
            </div>
            <div className="mt-4 grid gap-2">
              {step.assignments.length ? (
                step.assignments.map((assignment) => (
                  <div className="rounded-xl bg-surface px-3 py-2 text-sm text-foreground" key={assignment.id}>
                    {assignment.assignedToUser
                      ? `${assignment.assignedToUser.firstName} ${assignment.assignedToUser.lastName}`
                      : assignment.assignedToRole?.name ?? "Resolver pending"}{" "}
                    <span className="text-muted">({assignment.status})</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">No assignments recorded.</p>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
