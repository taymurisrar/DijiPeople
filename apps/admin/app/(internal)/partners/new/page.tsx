import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";
import { apiRequestJson } from "@/lib/server-api";

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
