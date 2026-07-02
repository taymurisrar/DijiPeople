import {
  ErrorLogsTable,
  type PlatformErrorEvent,
  type PlatformErrorLogsMeta,
} from "@/app/_components/monitoring/error-logs-table";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlatformErrorLogsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireSystemAdminUser("/settings/monitoring/error-logs");
  if (user.role !== "SUPER_ADMIN") {
    return (
      <main className="space-y-5">
        <PageHeader
          eyebrow="Monitoring"
          title="Error logs"
          description="Only Platform Super Admin can access platform monitoring."
        />
      </main>
    );
  }

  const resolvedSearchParams = await searchParams;
  const query = buildQueryString(resolvedSearchParams);
  const response = await apiRequestJson<{
    items: PlatformErrorEvent[];
    meta: PlatformErrorLogsMeta;
  }>(
    `/platform/logs/events${query ? `?${query}` : ""}`,
  );

  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="Platform monitoring"
        title="Error logs"
        description="Trace sanitized web and API incidents by reference number, tenant, source, and severity."
      />
      <ErrorLogsTable logs={response.items} meta={response.meta} />
    </main>
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
  if (!params.has("pageSize")) params.set("pageSize", "25");
  return params.toString();
}
