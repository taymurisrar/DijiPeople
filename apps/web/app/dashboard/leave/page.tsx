import Link from "next/link";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import { getBusinessUnitAccessSummary, hasBusinessUnitScope } from "../_lib/business-unit-access";
import { LeaveRequestsTable } from "./_components/leave-requests-table";
import { LeaveRequestRecord } from "./types";

export default async function LeavePage() {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include leave module records."
          title="Leave module is unavailable for your current business unit access."
        />
      </main>
    );
  }

  const [requests, teamRequests] = await Promise.all([
    apiRequestJson<LeaveRequestRecord[]>("/leave-requests/mine"),
    getTeamRequestsCount(),
  ]);

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(232,248,242,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Leave Requests
          </p>
          <h3 className="font-serif text-4xl text-foreground">
            Submit time off and track approval progress.
          </h3>
          <p className="max-w-3xl text-muted">
            This first version keeps the workflow practical: employees request
            leave, managers or HR review it, and the approval path stays
            tenant-configurable.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/dashboard/leave/approvals"
          >
            Pending approvals: {teamRequests}
          </Link>
          <Link
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/dashboard/leave/new"
          >
            Request leave
          </Link>
        </div>
      </section>

      <LeaveRequestsTable
        emptyActionHref="/dashboard/leave/new"
        emptyActionLabel="Create request"
        emptyDescription="Start with your first leave request to test the configured approval flow."
        emptyTitle="You have not submitted any leave requests yet."
        requests={requests}
      />
    </main>
  );
}

async function getTeamRequestsCount() {
  try {
    const teamRequests = await apiRequestJson<LeaveRequestRecord[]>(
      "/leave-requests/team?status=PENDING",
    );

    return teamRequests.length;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return 0;
    }

    throw error;
  }
}
