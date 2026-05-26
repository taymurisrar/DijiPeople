import { AccessDeniedState } from "../_components/access-denied-state";
import { ApprovalsTable } from "@/app/components/approvals/approvals-table";
import type { ApprovalsResponse } from "@/app/components/approvals/approval-types";
import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";

type ApprovalsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const APPROVAL_PERMISSIONS = [
  PERMISSION_KEYS.APPROVALS_READ,
  PERMISSION_KEYS.APPROVALS_READ_OWN,
  PERMISSION_KEYS.APPROVALS_READ_ASSIGNED,
  PERMISSION_KEYS.APPROVALS_READ_TEAM,
  PERMISSION_KEYS.APPROVALS_MANAGE,
];

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  const user = await requireSessionUser("/");
  if (!hasAnyPermission(user.permissionKeys, APPROVAL_PERMISSIONS)) {
    return <AccessDeniedState />;
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = buildQuery(resolvedSearchParams);
  const response = await apiRequestJson<ApprovalsResponse>(
    `/approvals${query ? `?${query}` : ""}`,
  );

  return (
    <main className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Approval tracking
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Approvals
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Review approval requests, current steps, assignments, SLA state, and audit history.
        </p>
      </section>
      <ApprovalViewTabs />
      <ApprovalsTable response={response} />
    </main>
  );
}

function ApprovalViewTabs() {
  const views = [
    ["pending", "My Pending Approvals"],
    ["submitted", "Submitted By Me"],
    ["team", "My Team"],
    ["approved", "Approved"],
    ["rejected", "Rejected"],
    ["escalated", "Escalated"],
    ["all", "All Relevant"],
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {views.map(([view, label]) => (
        <a
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
          href={view === "all" ? "/approvals" : `/approvals?view=${view}`}
          key={view}
        >
          {label}
        </a>
      ))}
    </div>
  );
}

function buildQuery(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }
  return search.toString();
}
