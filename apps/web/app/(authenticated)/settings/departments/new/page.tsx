import { DepartmentsForm } from "../../_components/departments-form";
import { SettingsShell } from "../../_components/settings-shell";

const initialValues = {
  name: "",
  code: "",
  description: "",
  defaultWorkScheduleId: "",
  isActive: true,
};

export default async function NewDepartmentPage() {
  const workSchedules =
    await apiRequestJson<Record<string, unknown>[]>("/work-schedules");
  return (
    <SettingsShell
      description="Keep master data simple and durable so employee profiles and future modules can reference the same department records."
      eyebrow="Organization Settings"
      title="Create Department"
    >
      <DepartmentsForm
        initialValues={initialValues}
        mode="create"
        workSchedules={toLookupOptions(workSchedules)}
      />
    </SettingsShell>
  );
}

function toLookupOptions(records: Record<string, unknown>[]) {
  return records.flatMap((record) =>
    typeof record.id === "string" && typeof record.name === "string"
      ? [{ id: record.id, name: record.name }]
      : [],
  );
}
import { apiRequestJson } from "@/lib/server-api";
