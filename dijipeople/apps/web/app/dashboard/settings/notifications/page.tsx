import { apiRequestJson } from "@/lib/server-api";
import { ConfigSettingsForm } from "../_components/config-settings-form";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { notificationSettingsSections } from "../_lib/settings-page-config";
import { TenantSettingsResponse } from "../types";

export default async function NotificationSettingsPage() {
  await requireSettingsPermissions(["settings.read"]);
  const tenantSettings = await apiRequestJson<TenantSettingsResponse>(
    "/tenant-settings",
  );

  return (
    <SettingsShell
      description="Control in-app and email notification behavior for operational workflows without scattering communication logic across modules."
      eyebrow="Notifications"
      title="Notification Settings"
    >
      <ConfigSettingsForm
        initialSettings={tenantSettings}
        saveLabel="Save notification settings"
        sections={notificationSettingsSections}
      />
    </SettingsShell>
  );
}
