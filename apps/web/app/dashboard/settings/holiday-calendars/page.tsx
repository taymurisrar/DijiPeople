import { apiRequestJson } from "@/lib/server-api";
import { SimpleEnterpriseConfigManager } from "../_components/simple-enterprise-config-manager";

export default async function HolidayCalendarsPage() {
  const records = await apiRequestJson<Record<string, unknown>[]>(
    "/holiday-calendars",
  ).catch(() => []);

  return (
    <SimpleEnterpriseConfigManager
      endpoint="/api/holiday-calendars"
      records={records as never}
      title="Holiday Calendars"
      createFields={[
        { name: "name", label: "Name", required: true },
        { name: "code", label: "Code", required: true },
        { name: "countryCode", label: "Country", placeholder: "US" },
        { name: "timezone", label: "Timezone", placeholder: "UTC" },
        { name: "isDefault", label: "Default", type: "checkbox" },
      ]}
    />
  );
}
