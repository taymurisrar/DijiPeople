import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { SimpleEnterpriseConfigManager } from "../_components/simple-enterprise-config-manager";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";

export default async function WorkCalendarsPage() {
  await requireSettingsPermissions(["settings.read"]);
  const [records, countries] = await Promise.all([
    apiRequestJson<Record<string, unknown>[]>("/holiday-calendars").catch(
      () => [],
    ),
    apiRequestJson<Record<string, unknown>[]>("/lookups/countries").catch(
      () => [],
    ),
  ]);

  const countryOptions = countries.flatMap((country) => {
    const value =
      typeof country.code === "string"
        ? country.code
        : typeof country.key === "string"
          ? country.key
          : null;
    return value && typeof country.name === "string"
      ? [{ value, label: country.name }]
      : [];
  });

  return (
    <SettingsShell
      description="Define reusable work calendars and weekend conventions for schedules, work sites, and holiday-aware attendance."
      title="Work Calendars"
    >
      <SimpleEnterpriseConfigManager
        endpoint="/api/holiday-calendars"
        records={records as never}
        title="Work Calendars"
        createFields={[
          { name: "name", label: "Name", required: true },
          { name: "code", label: "Code", required: true },
          {
            name: "countryCode",
            label: "Country",
            type: "lookup",
            options: countryOptions,
          },
          { name: "timezone", label: "Timezone", placeholder: "Asia/Riyadh" },
          {
            name: "weekendDays",
            label: "Weekend days",
            type: "multiselect",
            options: [
              "SUNDAY",
              "MONDAY",
              "TUESDAY",
              "WEDNESDAY",
              "THURSDAY",
              "FRIDAY",
              "SATURDAY",
            ],
          },
          {
            name: "effectiveStartDate",
            label: "Effective from",
            type: "date",
          },
          {
            name: "effectiveEndDate",
            label: "Effective to",
            type: "date",
          },
          { name: "isDefault", label: "Default", type: "checkbox" },
        ]}
      />
    </SettingsShell>
  );
}
