import type { Metadata } from "next";
import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "New partners",
};


export default async function Page() {
  const settings = await apiRequestJson<{
    platformDefaults?: { reportingCurrency?: string; currency?: string };
  }>("/super-admin/platform-settings");
  return (
    <RuntimeRecordRoute
      moduleKey="partners"
      initialValues={{
        type: "COMPANY",
        status: "NEW_INQUIRY",
        defaultCommissionRate: 0,
        currencyCode:
          settings.platformDefaults?.reportingCurrency ??
          settings.platformDefaults?.currency ??
          "USD",
      }}
    />
  );
}
