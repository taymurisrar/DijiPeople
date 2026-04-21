import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { redirect } from "next/navigation";
import { AuditLogFilters } from "../_components/audit-log-filters";
import { AuditLogTable } from "../_components/audit-log-table";
import { SettingsShell } from "../_components/settings-shell";
import { AuditLogsResponse } from "../types";

type AuditPageSearchParams = {
  action?: string;
  actorUserId?: string;
  entityType?: string;
  fromDate?: string;
  page?: string;
  toDate?: string;
};

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<AuditPageSearchParams>;
}) {
  const user = await getSessionUser();

  if (!user || !hasPermission(user.permissionKeys, "audit.read")) {
    redirect("/dashboard/settings/tenant");
  }

  const resolvedSearchParams = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (value && value.trim().length > 0) {
      query.set(key, value.trim());
    }
  }

  const auditLogs = await apiRequestJson<AuditLogsResponse>(
    `/audit-logs${query.size > 0 ? `?${query.toString()}` : ""}`,
  );

  return (
    <SettingsShell
      description="Audit logs capture high-signal admin and workflow changes so teams can investigate issues, support customers, and review sensitive operations."
      eyebrow="Governance"
      title="Audit Logs"
    >
      <div className="grid gap-6">
        <AuditLogFilters
          actions={auditLogs.filters.actions}
          actors={auditLogs.filters.actors}
          currentAction={resolvedSearchParams.action}
          currentActorUserId={resolvedSearchParams.actorUserId}
          currentEntityType={resolvedSearchParams.entityType}
          currentFromDate={resolvedSearchParams.fromDate}
          currentToDate={resolvedSearchParams.toDate}
          entityTypes={auditLogs.filters.entityTypes}
        />

        <section className="rounded-[24px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-2xl text-foreground">
                Change History
              </h3>
              <p className="mt-2 text-sm text-muted">
                Showing {auditLogs.items.length} entries on page{" "}
                {auditLogs.meta.page} of {auditLogs.meta.totalPages}.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-muted">
              Total events:{" "}
              <span className="font-semibold text-foreground">
                {auditLogs.meta.total}
              </span>
            </div>
          </div>
        </section>

        <AuditLogTable items={auditLogs.items} />
      </div>
    </SettingsShell>
  );
}
