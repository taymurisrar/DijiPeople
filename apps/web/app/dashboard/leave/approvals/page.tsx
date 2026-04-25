import Link from "next/link";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { getBusinessUnitAccessSummary, shouldEnforceSelfScope } from "../../_lib/business-unit-access";
import { LeaveRequestsTable } from "../_components/leave-requests-table";
import { LeaveRequestRecord } from "../types";

export default async function LeaveApprovalsPage() {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (shouldEnforceSelfScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Self scope active
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Team leave approvals are not available at your current business-unit access level.
          </h4>
          <p className="mt-3 text-muted">
            Your access is scoped to your own records only.
          </p>
        </section>
      </main>
    );
  }

  let requests: LeaveRequestRecord[] = [];
  let accessDenied = false;

  try {
    requests = await apiRequestJson<LeaveRequestRecord[]>(
      "/leave-requests/team?status=PENDING",
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      accessDenied = true;
    } else {
      throw error;
    }
  }

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(237,248,255,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Leave Approvals
          </p>
          <h3 className="font-serif text-4xl text-foreground">
            Review pending leave decisions for your team.
          </h3>
          <p className="max-w-3xl text-muted">
            Managers and HR can work from one queue while the approval steps stay
            configurable in the backend.
          </p>
        </div>
        <Link
          className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
          href="/dashboard/leave"
        >
          Back to my requests
        </Link>
      </section>

      {accessDenied ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Approval access required
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Your current role cannot review team leave requests.
          </h4>
          <p className="mt-3 text-muted">
            Ask an admin or HR lead to grant the appropriate leave approval
            permissions for this tenant.
          </p>
        </section>
      ) : (
        <LeaveRequestsTable
          emptyDescription="No pending leave approvals are waiting for you right now."
          emptyTitle="Your approval queue is clear."
          requests={requests}
        />
      )}
    </main>
  );
}
