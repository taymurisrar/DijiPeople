import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../_lib/require-settings-permission";
import type {
  ConnectorSummary,
  GatewaySummary,
  SyncPolicySummary,
} from "../../_lib/types";
import { IntegrationWizard } from "./_components/integration-wizard";

/**
 * New integration setup.
 *
 * Requires manage permission, not just read: this route creates records.
 */
export default async function NewAttendanceIntegrationPage() {
  await requireSettingsPermissions(
    [PERMISSION_KEYS.INTEGRATIONS_MANAGE],
    "/settings/integrations/attendance/integrations",
  );

  const [connectors, syncPolicies, gateways] = await Promise.all([
    apiRequestJson<{ connectors: ConnectorSummary[] }>(
      "/integrations/attendance/connectors",
    ).catch(() => ({ connectors: [] })),
    apiRequestJson<{ items: SyncPolicySummary[] }>(
      "/integrations/attendance/sync-policies",
    ).catch(() => ({ items: [] })),
    apiRequestJson<{ items: GatewaySummary[] }>(
      "/integrations/gateways?pageSize=200",
    ).catch(() => ({ items: [] })),
  ]);

  return (
    <SettingsShell
      eyebrow="Integrations"
      title="Add attendance integration"
      description="Connect an attendance terminal or attendance platform to DijiPeople."
    >
      <IntegrationWizard
        connectors={connectors.connectors}
        syncPolicies={syncPolicies.items}
        gateways={gateways.items}
      />
    </SettingsShell>
  );
}
