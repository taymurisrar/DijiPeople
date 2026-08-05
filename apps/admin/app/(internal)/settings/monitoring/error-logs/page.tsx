import {
  ErrorLogsTable,
  type PlatformErrorEvent,
  type PlatformErrorLogsMeta,
  type PlatformErrorLogMetrics,
  type SupportOwnerOption,
} from "@/app/_components/monitoring/error-logs-table";
import { PageHeader } from "@/app/_components/ui/page-header";
import { RuntimeViewSelector } from "@/app/_components/runtime/runtime-view-selector";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlatformErrorLogsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireSystemAdminUser("/settings/monitoring/error-logs");
  if (!hasPermission(user.permissionKeys, "monitoring.read")) {
    return (
      <main className="space-y-5">
        <PageHeader
          eyebrow="Monitoring"
          title="Error logs"
          description="Your platform role does not include monitoring access."
        />
      </main>
    );
  }

  const resolvedSearchParams = await searchParams;
  const query = buildQueryString(resolvedSearchParams);
  const [response, assignees, preference] = await Promise.all([apiRequestJson<{
    items: PlatformErrorEvent[];
    meta: PlatformErrorLogsMeta;
    metrics: PlatformErrorLogMetrics;
  }>(
    `/platform/logs/events${query ? `?${query}` : ""}`,
  ), apiRequestJson<SupportOwnerOption[]>("/platform-users/owner-candidates"), apiRequestJson<{ defaultViewKey?: string | null }>("/platform-users/me/module-preferences?moduleKey=monitoring-incidents")]);
  const moduleDefinition = getPlatformModuleDefinition("monitoring-incidents");

  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="Platform monitoring"
        title="Error logs"
        description="Support customers from a sanitized incident queue: trace web, admin, and API failures, record investigation progress, and maintain customer-ready updates."
        actions={<RuntimeViewSelector moduleKey="monitoring-incidents" views={moduleDefinition.views} defaultViewKey={preference.defaultViewKey} roleKeys={[user.role, ...(user.roleKeys ?? [])]} />}
      />
      <ErrorLogsTable logs={response.items} meta={response.meta} metrics={response.metrics} assignees={assignees} />
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

function buildQueryString(searchParams: Record<string, string | string[] | undefined>) {
  const allowed = new Set([
    "page",
    "pageSize",
    "sortBy",
    "sortDirection",
    "search",
    "reference",
    "severity",
    "status",
    "sourceApp",
    "environment",
    "tenantId",
    "userId",
    "category",
    "route",
    "method",
    "from",
    "to",
  ]);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (!allowed.has(key)) continue;
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized) params.set(key, normalized);
  }
  const viewId = Array.isArray(searchParams.viewId)
    ? searchParams.viewId[0]
    : searchParams.viewId;
  if (viewId === "critical" && !params.has("severity")) params.set("severity", "ERROR");
  if (["new", "investigating", "resolved"].includes(viewId ?? "") && !params.has("status")) {
    params.set("status", String(viewId).toUpperCase());
  }
  if (!params.has("pageSize")) params.set("pageSize", "25");
  return params.toString();
}
