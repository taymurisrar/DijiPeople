import type { Metadata } from "next";
import {
  BillingDefaultsForm,
  type BillingDefaults,
} from "@/app/_components/billing-defaults-form";
import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Billing",
};


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
