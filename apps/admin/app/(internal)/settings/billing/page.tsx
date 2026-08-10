import {
  BillingDefaultsForm,
  type BillingDefaults,
} from "@/app/_components/billing-defaults-form";
import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { apiRequestJson } from "@/lib/server-api";

export default async function BillingSettingsPage() {
  const settings = await apiRequestJson<{
    billingDefaults?: Partial<BillingDefaults>;
  }>("/super-admin/platform-settings");

  return (
    <SettingsShell
      title="Billing defaults"
      description="Configure global billing behavior while keeping transaction and reporting currencies governed by platform defaults."
    >
      <SettingsFormCard
        title="Billing behavior"
        description="Defaults are applied to newly created commercial records and can be overridden where a workflow explicitly supports it."
      >
        <BillingDefaultsForm initialDefaults={settings.billingDefaults ?? {}} />
      </SettingsFormCard>
    </SettingsShell>
  );
}
