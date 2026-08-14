import { notFound } from "next/navigation";

import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../../_lib/require-settings-permission";
import type {
  DeviceDetail,
  GatewayListResponse,
  IntegrationListResponse,
} from "../../../_lib/types";
import { DeviceForm } from "../../_components/device-form";

export default async function EditAttendanceDevicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  await requireSettingsPermissions(
    [PERMISSION_KEYS.ATTENDANCE_DEVICES_MANAGE],
    "/settings/integrations/attendance/devices",
  );

  let device: DeviceDetail;
  try {
    device = await apiRequestJson<DeviceDetail>(
      `/integrations/attendance/devices/${id}`,
    );
  } catch {
    notFound();
  }

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

  const workSiteItems = Array.isArray(workSites)
    ? workSites
    : (workSites.items ?? []);

  return (
    <SettingsShell
      eyebrow="Integrations"
      title={`Edit ${device.name}`}
      description="Update how DijiPeople reaches this device and where it sits."
    >
      <DeviceForm
        device={device}
        integrations={integrations.items}
        workSites={workSiteItems}
        gateways={gateways.items}
      />
    </SettingsShell>
  );
}
