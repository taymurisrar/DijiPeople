import type { Metadata } from "next";
import {
  AuditTrailTable,
  type PlatformAuditLogEntry,
  type PlatformAuditLogFilters,
  type PlatformAuditLogMeta,
} from "@/app/_components/monitoring/audit-trail-table";
import { MonitoringNav } from "@/app/_components/monitoring/monitoring-nav";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { buildAuditTrailQueryString } from "@/lib/audit-trail";

/* Each screen titles itself (BUG-1421). */
export const metadata: Metadata = {
  title: "Audit Trail",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/*
 * BUG-3564. The platform audit trail existed only as write-only rows in
 * `PlatformAuditLog` until this screen and `GET /platform/audit-logs`
 * (TASK-0032 WP-10). `monitoring.read` is the same permission the rest of
 * this monitoring area already gates on — every audit-facing role
 * (READ_ONLY_AUDITOR, SUPPORT_MANAGER/AGENT, MONITORING_OPERATOR,
 * PLATFORM_ADMIN/OPERATIONS, SUPER_ADMIN) holds it; no new grant was needed.
 */
export default async function PlatformAuditLogsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireSystemAdminUser("/settings/monitoring/audit-logs");
  if (!hasPermission(user.permissionKeys, "monitoring.read")) {
    return (
      <main className="space-y-5">
        <PageHeader
          eyebrow="Monitoring"
          title="Audit trail"
          description="Your platform role does not include monitoring access."
        />
      </main>
    );
  }

  const resolvedSearchParams = await searchParams;
  const query = buildAuditTrailQueryString(resolvedSearchParams);
  const response = await apiRequestJson<{
    items: PlatformAuditLogEntry[];
    meta: PlatformAuditLogMeta;
    filters: PlatformAuditLogFilters;
  }>(`/platform/audit-logs${query ? `?${query}` : ""}`);

  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="Platform monitoring"
        title="Audit trail"
        description="Every platform action — tenant edits, role changes, agreements, MFA resets — with who did it, when, and what changed."
      />
      <MonitoringNav current="/settings/monitoring/audit-logs" />
      <AuditTrailTable
        entries={response.items}
        meta={response.meta}
        filters={response.filters}
      />
    </main>
  );
}

function hasPermission(granted: string[], requested: string) {
  return granted.some(
    (permission) =>
      permission === "platform.*" ||
      permission === requested ||
      (permission.endsWith(".*") &&
        requested.startsWith(permission.slice(0, -1))),
  );
}
