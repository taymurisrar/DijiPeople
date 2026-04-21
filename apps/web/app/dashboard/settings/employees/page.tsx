import { apiRequestJson } from "@/lib/server-api";
import { ConfigSettingsForm } from "../_components/config-settings-form";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { employeeSettingsSections } from "../_lib/settings-page-config";
import { TenantSettingsResponse } from "../types";

export default async function EmployeeSettingsPage() {
  await requireSettingsPermissions(["settings.read", "employees.read"]);
  const tenantSettings = await apiRequestJson<TenantSettingsResponse>(
    "/tenant-settings",
  );

  return (
    <SettingsShell
      description="Configure employee master data rules, default profile behavior, and reporting structure guidance for the tenant."
      eyebrow="Employees"
      title="Employee Settings"
    >
      <ConfigSettingsForm
        initialSettings={tenantSettings}
        saveLabel="Save employee settings"
        sections={employeeSettingsSections}
      />
    </SettingsShell>
  );
}
