import { SectionCard } from "@/app/components/ui/section-card";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import type { RunListResponse } from "../_lib/types";
import { SyncHistoryTable } from "./_components/sync-history-table";

/**
 * Scope parameters accepted from contextual links elsewhere in the product
 * ("View sync history" on a device or gateway). Narrowing happens on the API so
 * a deep link returns the right rows rather than filtering a truncated page in
 * the browser.
 */
const SCOPE_PARAMS = [
  "integrationId",
  "deviceId",
  "gatewayId",
  "runType",
  "status",
  "from",
  "to",
] as const;

type SyncHistoryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AttendanceSyncHistoryPage({
  searchParams,
}: SyncHistoryPageProps) {
  await requireSettingsPermissions([
    PERMISSION_KEYS.INTEGRATIONS_READ,
    PERMISSION_KEYS.INTEGRATIONS_MANAGE,
  ]);

  const resolved = searchParams ? await searchParams : {};
  const query = new URLSearchParams({ pageSize: "200" });

  for (const key of SCOPE_PARAMS) {
    const value = resolved[key];
    if (typeof value === "string" && value.length > 0) {
      query.set(key, value);
    }
  }

  const isScoped = SCOPE_PARAMS.some((key) => query.has(key));

  const runs = await apiRequestJson<RunListResponse>(
    `/integrations/attendance/runs?${query.toString()}`,
  ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 }));

  return (
    <SettingsShell
      eyebrow="Integrations"
      title="Sync history"
      description="Every synchronisation run, what it collected, and anything that failed."
    >
      <SectionCard
        title={`${runs.total} run${runs.total === 1 ? "" : "s"}`}
        description={
          isScoped
            ? "Showing runs for the item you came from. Clear the link to see everything."
            : "Filter by integration, device, gateway, type or result."
        }
      >
        <SyncHistoryTable runs={runs.items} />
      </SectionCard>
    </SettingsShell>
  );
}
