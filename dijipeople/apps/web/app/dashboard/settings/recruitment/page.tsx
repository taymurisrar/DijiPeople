import { apiRequestJson } from "@/lib/server-api";
import { ConfigSettingsForm } from "../_components/config-settings-form";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { recruitmentSettingsSections } from "../_lib/settings-page-config";
import { TenantSettingsResponse } from "../types";

export default async function RecruitmentSettingsPage() {
  await requireSettingsPermissions(["settings.read", "recruitment.read", "onboarding.read"]);
  const tenantSettings = await apiRequestJson<TenantSettingsResponse>(
    "/tenant-settings",
  );

  return (
    <SettingsShell
      description="Shape the candidate pipeline and onboarding defaults so hiring workflows match how this tenant actually operates."
      eyebrow="Recruitment & Onboarding"
      title="Recruitment & Onboarding"
    >
      <ConfigSettingsForm
        initialSettings={tenantSettings}
        saveLabel="Save recruitment settings"
        sections={recruitmentSettingsSections}
      />
    </SettingsShell>
  );
}
