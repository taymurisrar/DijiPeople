import { apiRequestJson } from "@/lib/server-api";
import { ConfigSettingsForm } from "../../_components/config-settings-form";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { payrollSettingsSections } from "../../_lib/settings-page-config";
import type { TenantSettingsResponse } from "../../types";

export default async function PayrollSettingsPage() {
  await requireSettingsPermissions(["settings.read", "payroll.settings.read"]);
  const tenantSettings =
    await apiRequestJson<TenantSettingsResponse>("/tenant-settings");
  return (
    <SettingsShell
      description="Configure payroll defaults, compensation behavior, and cycle preferences."
      title="Payroll Settings"
    >
      <ConfigSettingsForm
        initialSettings={tenantSettings}
        saveLabel="Save payroll settings"
        sections={payrollSettingsSections}
      />
    </SettingsShell>
  );
}
