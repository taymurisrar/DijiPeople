import { apiRequestJson } from "@/lib/server-api";
import { ConfigSettingsForm } from "../_components/config-settings-form";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { documentSettingsSections } from "../_lib/settings-page-config";
import { TenantSettingsResponse } from "../types";

export default async function DocumentSettingsPage() {
  await requireSettingsPermissions(["settings.read", "documents.read"]);
  const tenantSettings = await apiRequestJson<TenantSettingsResponse>(
    "/tenant-settings",
  );

  return (
    <SettingsShell
      description="Set tenant-wide document validation and storage rules that can be reused across employees, leave, recruitment, and shared records."
      eyebrow="Documents"
      title="Document Rules"
    >
      <ConfigSettingsForm
        initialSettings={tenantSettings}
        saveLabel="Save document rules"
        sections={documentSettingsSections}
      />
    </SettingsShell>
  );
}
