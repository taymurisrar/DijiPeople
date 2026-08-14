import Link from "next/link";

import { SectionCard } from "@/app/components/ui/section-card";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../../../_lib/require-settings-permission";
import type { GatewayListResponse } from "../_lib/types";
import { GatewaysTable } from "./_components/gateways-table";

export default async function AttendanceGatewaysPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.GATEWAYS_READ,
    PERMISSION_KEYS.GATEWAYS_MANAGE,
  ]);

  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.GATEWAYS_MANAGE,
  );

  const gateways = await apiRequestJson<GatewayListResponse>(
    "/integrations/gateways?pageSize=200",
  ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 }));

  return (
    <SettingsShell
      eyebrow="Integrations"
      title="Integration gateways"
      description="A gateway runs on a machine inside your network and lets DijiPeople reach attendance devices that are not exposed to the internet."
      actions={
        canManage ? (
          <Link
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/settings/integrations/attendance/gateways/new"
          >
            Set up gateway
          </Link>
        ) : null
      }
    >
      <SectionCard
        title={`${gateways.total} gateway${gateways.total === 1 ? "" : "s"}`}
        description="A gateway shows as offline until it contacts DijiPeople."
      >
        <GatewaysTable gateways={gateways.items} canManage={canManage} />
      </SectionCard>
    </SettingsShell>
  );
}
