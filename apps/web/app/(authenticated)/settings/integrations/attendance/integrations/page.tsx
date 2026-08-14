import Link from "next/link";

import { SectionCard } from "@/app/components/ui/section-card";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../../../_lib/require-settings-permission";
import type {
  ConnectorSummary,
  IntegrationListResponse,
} from "../_lib/types";
import { IntegrationsTable } from "./_components/integrations-table";

export default async function AttendanceIntegrationsListPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.INTEGRATIONS_READ,
    PERMISSION_KEYS.INTEGRATIONS_MANAGE,
  ]);

  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.INTEGRATIONS_MANAGE,
  );

  const [integrations, connectors] = await Promise.all([
    apiRequestJson<IntegrationListResponse>(
      "/integrations/attendance/integrations?pageSize=200",
    ).catch(() => ({
      items: [],
      page: 1,
      pageSize: 200,
      total: 0,
    })),
    // Connector metadata supplies the display names. A failure here degrades to
    // showing the raw connector key rather than blanking the list.
    apiRequestJson<{ connectors: ConnectorSummary[] }>(
      "/integrations/attendance/connectors",
    ).catch(() => ({ connectors: [] })),
  ]);

  return (
    <SettingsShell
      eyebrow="Integrations"
      title="Attendance integrations"
      description="Attendance sources configured for your organisation, and how ready each one is to start collecting attendance."
      actions={
        canManage ? (
          <Link
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/settings/integrations/attendance/integrations/new"
          >
            Add integration
          </Link>
        ) : null
      }
    >
      <SectionCard
        title={`${integrations.total} integration${integrations.total === 1 ? "" : "s"}`}
        description="Configuration, gateway availability and device verification are shown separately, because they are satisfied independently."
      >
        <IntegrationsTable
          integrations={integrations.items}
          connectors={connectors.connectors}
          canManage={canManage}
        />
      </SectionCard>
    </SettingsShell>
  );
}
