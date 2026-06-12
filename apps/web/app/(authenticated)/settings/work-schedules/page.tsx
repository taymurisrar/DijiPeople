import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { SimpleEnterpriseConfigManager } from "../_components/simple-enterprise-config-manager";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";

export default async function WorkSchedulesPage() {
  await requireSettingsPermissions(["settings.read"]);
  const [records, holidayCalendars, shifts] = await Promise.all([
    apiRequestJson<Record<string, unknown>[]>("/work-schedules").catch(
      () => [],
    ),
    apiRequestJson<Record<string, unknown>[]>("/holiday-calendars").catch(
      () => [],
    ),
    apiRequestJson<Record<string, unknown>[]>("/shift-templates").catch(
      () => [],
    ),
  ]);

  return (
    <SettingsShell
      description="Define tenant working patterns, weekend days, default hours, effective dates, and the schedule used when an employee has no explicit assignment."
      title="Work Schedules"
    >
      <SimpleEnterpriseConfigManager
        endpoint="/api/work-schedules"
        records={records as never}
        title="Work Schedules"
        createFields={[
          { name: "name", label: "Name", required: true },
          { name: "code", label: "Code", required: true },
          { name: "timezone", label: "Timezone", placeholder: "Asia/Riyadh" },
          {
            name: "holidayCalendarId",
            label: "Holiday calendar",
            type: "lookup",
            options: toLookupOptions(holidayCalendars),
          },
          {
            name: "defaultShiftTemplateId",
            label: "Default shift",
            type: "lookup",
            options: toLookupOptions(shifts),
          },
          {
            name: "standardStartTime",
            label: "Start time",
            required: true,
            type: "time",
          },
          {
            name: "standardEndTime",
            label: "End time",
            required: true,
            type: "time",
          },
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
          {
            name: "weeklyWorkDays",
            label: "Working days",
            type: "multiselect",
            required: true,
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
          { name: "standardHoursPerWeek", label: "Hours/week", type: "number" },
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
          { name: "isDefault", label: "Default schedule", type: "checkbox" },
          { name: "isActive", label: "Active", type: "checkbox" },
        ]}
      />
    </SettingsShell>
  );
}

function toLookupOptions(records: Record<string, unknown>[]) {
  return records.flatMap((record) =>
    typeof record.id === "string" && typeof record.name === "string"
      ? [{ value: record.id, label: record.name }]
      : [],
  );
}
