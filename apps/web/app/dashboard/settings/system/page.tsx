import { apiRequestJson } from "@/lib/server-api";
import { ConfigSettingsForm } from "../_components/config-settings-form";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { systemSettingsSections } from "../_lib/settings-page-config";
import { TenantSettingsResponse } from "../types";

export default async function SystemSettingsPage() {
  await requireSettingsPermissions(["settings.read"]);
  const tenantSettings = await apiRequestJson<TenantSettingsResponse>(
    "/tenant-settings",
  );

  return (
    <SettingsShell
      description="Set tenant-wide display formats and system preferences that keep the workspace predictable for every user."
      eyebrow="Advanced / System"
      title="System Preferences"
    >
      <ConfigSettingsForm
        initialSettings={tenantSettings}
        saveLabel="Save system preferences"
        sections={systemSettingsSections}
      />
    </SettingsShell>
  );
}
