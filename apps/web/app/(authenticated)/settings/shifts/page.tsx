import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { SimpleEnterpriseConfigManager } from "../_components/simple-enterprise-config-manager";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";

export default async function ShiftsPage() {
  await requireSettingsPermissions(["settings.read"]);
  const records = await apiRequestJson<Record<string, unknown>[]>(
    "/shift-templates",
  ).catch(() => []);

  return (
    <SettingsShell
      description="Manage reusable shift definitions consumed by employee schedules and attendance calculations."
      title="Shifts"
    >
      <SimpleEnterpriseConfigManager
        endpoint="/api/shift-templates"
        records={records as never}
        title="Shifts"
        createFields={[
          { name: "name", label: "Name", required: true },
          { name: "code", label: "Code", required: true },
          {
            name: "startTime",
            label: "Start time",
            required: true,
            type: "time",
          },
          {
            name: "endTime",
            label: "End time",
            required: true,
            type: "time",
          },
          { name: "breakMinutes", label: "Break minutes", type: "number" },
          { name: "expectedHours", label: "Expected hours", type: "number" },
          { name: "lateGraceMinutes", label: "Late grace", type: "number" },
          {
            name: "earlyExitGraceMinutes",
            label: "Early exit grace",
            type: "number",
          },
          { name: "timezone", label: "Timezone", placeholder: "Asia/Riyadh" },
          { name: "isNightShift", label: "Night shift", type: "checkbox" },
          { name: "isActive", label: "Active", type: "checkbox" },
        ]}
      />
    </SettingsShell>
  );
}
