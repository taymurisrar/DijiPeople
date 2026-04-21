import { apiRequestJson } from "@/lib/server-api";
import { ConfigSettingsForm } from "../_components/config-settings-form";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { brandingSettingsSections } from "../_lib/settings-page-config";
import { TenantSettingsResponse } from "../types";

export default async function BrandingSettingsPage() {
  await requireSettingsPermissions(["settings.read"]);

  const tenantSettings = await apiRequestJson<TenantSettingsResponse>(
    "/tenant-settings",
  );

  return (
    <SettingsShell
      eyebrow="Tenant Personalization"
      title="Branding, Theme & Workspace Identity"
      description="Let tenants shape how their workspace looks and feels across logos, colors, email identity, support touchpoints, and employee-facing experience so the platform feels aligned with their organization."
    >
      <ConfigSettingsForm
        initialSettings={tenantSettings}
        saveLabel="Save personalization settings"
        sections={brandingSettingsSections}
      />
    </SettingsShell>
  );
}