import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { FeatureTogglesForm } from "../_components/tenant-settings/feature-toggles-form";
import { TenantFeaturesResponse } from "../types";

export default async function TenantFeaturesPage() {
  const tenantFeatures = await apiRequestJson<TenantFeaturesResponse>(
    "/tenant-settings/features",
  );

  return (
    <SettingsShell
      description="Feature toggles let each tenant enable the modules they need while keeping the codebase shared and product-oriented."
      eyebrow="Tenant Configuration"
      title="Feature Toggles"
    >
      <FeatureTogglesForm initialFeatures={tenantFeatures} />
    </SettingsShell>
  );
}

