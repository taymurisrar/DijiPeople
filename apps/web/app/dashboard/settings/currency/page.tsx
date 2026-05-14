import { apiRequestJson } from "@/lib/server-api";
import { SimpleEnterpriseConfigManager } from "../_components/simple-enterprise-config-manager";

export default async function CurrencySettingsPage() {
  const records = await apiRequestJson<Record<string, unknown>[]>(
    "/currency-configurations",
  ).catch(() => []);

  return (
    <SimpleEnterpriseConfigManager
      endpoint="/api/currency-configurations"
      records={records as never}
      title="Currency Configuration"
      createFields={[
        {
          name: "transactionalCurrency",
          label: "Transactional",
          required: true,
          placeholder: "ISO currency code",
        },
        {
          name: "reportingCurrency",
          label: "Reporting",
          required: true,
          placeholder: "ISO currency code",
        },
        {
          name: "effectiveStartDate",
          label: "Effective from",
          type: "date",
          required: true,
        },
        { name: "effectiveEndDate", label: "Effective to", type: "date" },
      ]}
    />
  );
}
