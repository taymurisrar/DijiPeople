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
  ProvisioningListResponse,
} from "../_lib/types";
import { ProvisioningTable } from "./_components/provisioning-table";

export default async function AttendanceProvisioningPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.ATTENDANCE_PROVISIONING_READ,
    PERMISSION_KEYS.ATTENDANCE_PROVISIONING_MANAGE,
  ]);

  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.ATTENDANCE_PROVISIONING_MANAGE,
  );

  const [jobs, connectors] = await Promise.all([
    apiRequestJson<ProvisioningListResponse>(
      "/integrations/attendance/provisioning-jobs?pageSize=200",
    ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 })),
    apiRequestJson<{ connectors: ConnectorSummary[] }>(
      "/integrations/attendance/connectors",
    ).catch(() => ({ connectors: [] })),
  ]);

  /*
   * Connectors that can write users but are not yet certified for unattended
   * use. The platform will not queue automatic jobs for these, and the page says
   * so rather than leaving an administrator waiting for something that will
   * never arrive.
   */
  const awaitingCertification = connectors.connectors.filter(
    (connector) =>
      connector.capabilities.includes("WRITE_USERS") &&
      !connector.automaticallySupportedCapabilities.includes("WRITE_USERS"),
  );

  return (
    <SettingsShell
      eyebrow="Integrations"
      title="Device provisioning"
      description="Employee records being sent to your attendance devices, one job per device."
    >
      <div className="grid gap-6">
        {awaitingCertification.length > 0 ? (
          <div
            className="rounded-[22px] border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-900"
            data-testid="provisioning-awaiting-certification"
          >
            <p className="font-semibold">
              User provisioning: awaiting production device validation
            </p>
            <p className="mt-1">
              {awaitingCertification
                .map((connector) => connector.displayName)
                .join(", ")}{" "}
              can write employees to a device, but this has not been validated
              against production hardware yet. DijiPeople will not send employees
              to these devices automatically until it has been.
            </p>
          </div>
        ) : null}

        <SectionCard
          title={`${jobs.total} job${jobs.total === 1 ? "" : "s"}`}
          description="Jobs are picked up by the gateway. Retrying puts a job back in the queue rather than contacting the device from here."
        >
          <ProvisioningTable jobs={jobs.items} canManage={canManage} />
        </SectionCard>
      </div>
    </SettingsShell>
  );
}
