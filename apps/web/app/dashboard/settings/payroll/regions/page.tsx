import { apiRequestJson } from "@/lib/server-api";
import { SimpleEnterpriseConfigManager } from "../../_components/simple-enterprise-config-manager";

export default async function PayrollRegionsPage() {
  const records = await apiRequestJson<Record<string, unknown>[]>(
    "/payroll-regions",
  ).catch(() => []);

  return (
    <SimpleEnterpriseConfigManager
      endpoint="/api/payroll-regions"
      records={records as never}
      title="Payroll Regions"
      createFields={[
        { name: "name", label: "Name", required: true },
        { name: "code", label: "Code", required: true },
        { name: "currencyCode", label: "Currency", required: true },
        { name: "timezone", label: "Timezone", placeholder: "UTC" },
        {
          name: "payCycle",
          label: "Pay cycle",
          type: "select",
          options: ["WEEKLY", "BI_WEEKLY", "SEMI_MONTHLY", "MONTHLY"],
        },
        { name: "taxRegion", label: "Tax region" },
      ]}
    />
  );
}
