import type { Metadata } from "next";
import {
  ErrorLogsTable,
  type ErrorLogFacets,
  type PlatformErrorEvent,
  type PlatformErrorLogsMeta,
  type PlatformErrorLogMetrics,
  type SupportOwnerOption,
} from "@/app/_components/monitoring/error-logs-table";
import { MonitoringNav } from "@/app/_components/monitoring/monitoring-nav";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import {
  buildErrorLogApiQuery,
  canonicalizeLegacyView,
} from "@/lib/error-log-console";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Error Logs",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ROUTE = "/settings/monitoring/error-logs";

export default async function PlatformErrorLogsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireSystemAdminUser(ROUTE);
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
  /*
   * The view selector this screen used to carry is gone — its five views were
   * the status and severity filters under a second name — but the operations
   * dashboard and old bookmarks still link with `viewId`. They are rewritten
   * into the visible filters rather than applied silently: the list is
   * fetched with the rewritten filters and the console replaces the URL to
   * match, so the filter bar shows what the list was filtered by. Not a
   * server redirect — a module's routeBase page must render the module
   * (`module-routes.invariant.spec.ts`, BUG-0019).
   */
  const canonical = canonicalizeLegacyView(resolvedSearchParams);
  const effectiveSearchParams =
    canonical === null
      ? resolvedSearchParams
      : Object.fromEntries(new URLSearchParams(canonical));

  const query = buildErrorLogApiQuery(effectiveSearchParams);
  const [response, facets, assignees] = await Promise.all([
    apiRequestJson<{
      items: PlatformErrorEvent[];
      meta: PlatformErrorLogsMeta;
      metrics: PlatformErrorLogMetrics;
    }>(`/platform/logs/events?${query}`),
    /*
     * The filter options. A failure here costs the dropdowns their options,
     * not the page: the incident list is the thing an operator came for.
     */
    apiRequestJson<ErrorLogFacets>("/platform/logs/events/facets").catch(
      () => null,
    ),
    apiRequestJson<SupportOwnerOption[]>(
      "/platform-users/owner-candidates",
    ).catch(() => [] as SupportOwnerOption[]),
  ]);

  return (
    <main className="space-y-4">
      <PageHeader
        eyebrow="Platform monitoring"
        title="Error logs"
        description="Failures captured from the tenant app, platform admin and API — what failed, for whom, and whether anyone is on it."
      />
      <MonitoringNav current={ROUTE} />
      <ErrorLogsTable
        assignees={assignees}
        canManage={hasPermission(user.permissionKeys, "monitoring.manage")}
        canonicalQuery={canonical}
        facets={facets}
        logs={response.items}
        meta={response.meta}
        metrics={response.metrics}
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
