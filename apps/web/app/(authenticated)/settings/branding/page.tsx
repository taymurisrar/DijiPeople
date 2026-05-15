import { apiRequestJson } from "@/lib/server-api";
import { resolveBrandingSettings } from "@/lib/branding";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { TenantSettingsApiResponse, TenantSettingValue } from "../types";
import { BrandingSettingsForm } from "./_components/branding-settings-form";

export default async function BrandingSettingsPage() {
  await requireSettingsPermissions(["settings.read"]);

  const tenantSettings = await apiRequestJson<TenantSettingsApiResponse>(
    "/tenant-settings",
  );
  const initialValues = resolveBrandingSettings(
    toStringSettingsRecord(tenantSettings.settings.branding),
  );

  return (
    <SettingsShell
      eyebrow="Branding"
      title="Branding"
      description="Set your tenant brand tokens and font for sidebar, dashboard, and employee pages."
    >
      <BrandingSettingsForm initialValues={initialValues} />
    </SettingsShell>
  );
}

function toStringSettingsRecord(
  source: Record<string, TenantSettingValue> | undefined,
) {
  if (!source) {
    return undefined;
  }

  const output: Partial<Record<string, string | null>> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" || value === null) {
      output[key] = value;
    }
  }

  return output;
}
