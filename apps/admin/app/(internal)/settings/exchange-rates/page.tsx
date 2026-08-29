import type { Metadata } from "next";
import { ExchangeRatesManager } from "@/app/_components/settings/exchange-rates-manager";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { DEFAULT_PLATFORM_DEFAULTS } from "@/lib/reference-data/platform-reference-data";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Exchange Rates",
};

export default async function ExchangeRatesPage() {
  await requireSystemAdminUser("/settings/exchange-rates");

  /*
   * The reporting currency is read here so the heading names it before any
   * client fetch resolves. The rates themselves load client-side, because the
   * screen refreshes them in place and a server render would go stale the
   * moment the operator pressed the button.
   */
  const settings = await apiRequestJson<{
    platformDefaults?: { currency?: string; reportingCurrency?: string };
  }>("/super-admin/platform-settings").catch(() => null);

  const base =
    settings?.platformDefaults?.reportingCurrency ??
    settings?.platformDefaults?.currency ??
    DEFAULT_PLATFORM_DEFAULTS.reportingCurrency;

  return (
    <SettingsShell
      description="Rates used to express money collected in other currencies as one reporting figure on the dashboard. Live rates refresh daily; a rate set by hand stays until you return it to the live one."
      title="Exchange rates"
    >
      <ExchangeRatesManager base={base} />
    </SettingsShell>
  );
}
