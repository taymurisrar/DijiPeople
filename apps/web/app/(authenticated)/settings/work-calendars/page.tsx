import { apiRequestJson } from "@/lib/server-api";
import { SimpleEnterpriseConfigManager } from "../_components/simple-enterprise-config-manager";

export default async function WorkCalendarsPage() {
  const records = await apiRequestJson<Record<string, unknown>[]>(
    "/work-schedules",
  ).catch(() => []);

  return (
    <SimpleEnterpriseConfigManager
      endpoint="/api/work-schedules"
      records={records as never}
      title="Work Calendars"
      createFields={[
        { name: "name", label: "Name", required: true },
        { name: "code", label: "Code", required: true },
        { name: "timezone", label: "Timezone", placeholder: "UTC" },
        {
          name: "workWeekModel",
          label: "Work week",
          type: "select",
          options: [
            "FIVE_DAY",
            "FIVE_AND_HALF_DAY",
            "SIX_DAY",
            "ROTATING",
            "FLEXIBLE",
            "SHIFT_BASED",
          ],
        },
        { name: "standardHoursPerWeek", label: "Hours/week", type: "number" },
        { name: "isDefault", label: "Default", type: "checkbox" },
      ]}
    />
  );
}
