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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function countActiveFilters(searchParams: AuditPageSearchParams) {
  return [
    searchParams.action,
    searchParams.actorUserId,
    searchParams.entityType,
    searchParams.fromDate,
    searchParams.toDate,
  ].filter((value) => value && value.trim().length > 0).length;
}

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

  const activeFilters = countActiveFilters(resolvedSearchParams);
  const hasRows = auditLogs.items.length > 0;

  return (
    <SettingsShell
      description="Review administrative activity, workflow changes, and sensitive system events across the tenant."
      eyebrow="Governance"
      title="Audit Logs"
    >
      <div className="grid min-w-0 max-w-full gap-6 overflow-hidden">
        <section className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] p-4 shadow-sm sm:p-6">
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-2xl">
              <h2 className="truncate font-serif text-2xl text-foreground">
                Change History
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Track who changed what, when it happened, and which business
                record was affected. Use filters to narrow the timeline for
                investigation or review.
              </p>
            </div>

            <div className="grid min-w-0 w-full grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto lg:min-w-[420px]">
              <div className="min-w-0 rounded-2xl border border-border bg-white px-4 py-3">
                <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">
                  Total Events
                </p>
                <p className="mt-1 truncate text-xl font-semibold text-foreground">
                  {formatNumber(auditLogs.meta.total)}
                </p>
              </div>

              <div className="min-w-0 rounded-2xl border border-border bg-white px-4 py-3">
                <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">
                  This Page
                </p>
                <p className="mt-1 truncate text-xl font-semibold text-foreground">
                  {formatNumber(auditLogs.items.length)}
                </p>
              </div>

              <div className="min-w-0 rounded-2xl border border-border bg-white px-4 py-3">
                <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">
                  Filters
                </p>
                <p className="mt-1 truncate text-xl font-semibold text-foreground">
                  {activeFilters}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted">
            <span className="max-w-full truncate rounded-full border border-border bg-white px-3 py-1">
              Page {auditLogs.meta.page} of {auditLogs.meta.totalPages}
            </span>

            <span className="max-w-full truncate rounded-full border border-border bg-white px-3 py-1">
              {activeFilters > 0
                ? "Filtered result set"
                : "Showing all available events"}
            </span>
          </div>
        </section>

        <section className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex min-w-0 flex-col gap-1">
            <h3 className="truncate font-serif text-xl text-foreground">
              Filters
            </h3>
            <p className="text-sm text-muted">
              Search audit events by action, actor, entity, or date range.
            </p>
          </div>

          <div className="min-w-0 max-w-full overflow-hidden">
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
          </div>
        </section>

        <section className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-border bg-white shadow-sm">
          <div className="flex min-w-0 flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <h3 className="truncate font-serif text-xl text-foreground">
                Event Timeline
              </h3>
              <p className="mt-1 text-sm text-muted">
                {hasRows
                  ? `Showing ${auditLogs.items.length} audit entries.`
                  : "No audit entries matched the selected filters."}
              </p>
            </div>

            {auditLogs.meta.total > 0 && (
              <div className="shrink-0 rounded-2xl border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] px-4 py-2 text-sm text-muted">
                {formatNumber(auditLogs.meta.total)} total
              </div>
            )}
          </div>

          <div className="min-w-0 max-w-full overflow-hidden">
            {hasRows ? (
              <AuditLogTable items={auditLogs.items} />
            ) : (
              <div className="px-6 py-12 text-center">
                <h4 className="font-serif text-xl text-foreground">
                  No audit logs found
                </h4>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                  Adjust the filters or clear the date range to view more audit
                  activity.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </SettingsShell>
  );
}