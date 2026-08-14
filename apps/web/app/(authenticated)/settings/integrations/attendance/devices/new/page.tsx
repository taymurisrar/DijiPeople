import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../_lib/require-settings-permission";
import type {
  GatewayListResponse,
  IntegrationListResponse,
} from "../../_lib/types";
import { DeviceForm } from "../_components/device-form";

export default async function NewAttendanceDevicePage() {
  await requireSettingsPermissions(
    [PERMISSION_KEYS.ATTENDANCE_DEVICES_MANAGE],
    "/settings/integrations/attendance/devices",
  );

  const [integrations, workSites, gateways] = await Promise.all([
    apiRequestJson<IntegrationListResponse>(
      "/integrations/attendance/integrations?pageSize=200",
    ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 })),
    apiRequestJson<{ items?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>>(
      "/locations",
    ).catch(() => ({ items: [] })),
    apiRequestJson<GatewayListResponse>(
      "/integrations/gateways?pageSize=200",
    ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 })),
  ]);

  // The locations endpoint returns either a bare array or a paged envelope
  // depending on the query; normalise rather than assuming one shape.
  const workSiteItems = Array.isArray(workSites)
    ? workSites
    : (workSites.items ?? []);

  return (
    <SettingsShell
      eyebrow="Integrations"
      title="Add attendance device"
      description="Register a terminal so DijiPeople can collect attendance from it."
    >
      <DeviceForm
        integrations={integrations.items}
        workSites={workSiteItems}
        gateways={gateways.items}
      />
    </SettingsShell>
  );
}
