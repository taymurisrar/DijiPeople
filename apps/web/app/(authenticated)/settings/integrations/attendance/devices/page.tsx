import Link from "next/link";

import { SectionCard } from "@/app/components/ui/section-card";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../../../_lib/require-settings-permission";
import type { DeviceListResponse } from "../_lib/types";
import { DevicesTable } from "./_components/devices-table";

export default async function AttendanceDevicesPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.ATTENDANCE_DEVICES_READ,
    PERMISSION_KEYS.ATTENDANCE_DEVICES_MANAGE,
  ]);

  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.ATTENDANCE_DEVICES_MANAGE,
  );

  const devices = await apiRequestJson<DeviceListResponse>(
    "/integrations/attendance/devices?pageSize=200",
  ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 }));

  return (
    <SettingsShell
      eyebrow="Integrations"
      title="Attendance devices"
      description="The terminals your employees clock in on, and the work sites they serve."
      actions={
        canManage ? (
          <Link
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/settings/integrations/attendance/devices/new"
          >
            Add device
          </Link>
        ) : null
      }
    >
      <SectionCard
        title={`${devices.total} device${devices.total === 1 ? "" : "s"}`}
        description="Device health is reported once a gateway can reach the terminal."
      >
        <DevicesTable devices={devices.items} canManage={canManage} />
      </SectionCard>
    </SettingsShell>
  );
}
