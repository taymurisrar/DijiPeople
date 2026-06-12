import { apiRequestJson } from "@/lib/server-api";
import { DepartmentsForm } from "../../../_components/departments-form";
import { SettingsShell } from "../../../_components/settings-shell";
import { DepartmentRecord } from "../../../types";

type EditDepartmentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditDepartmentPage({
  params,
}: EditDepartmentPageProps) {
  const { id } = await params;
  const [department, workSchedules] = await Promise.all([
    apiRequestJson<DepartmentRecord>(`/departments/${id}`),
    apiRequestJson<Record<string, unknown>[]>("/work-schedules"),
  ]);

  return (
    <SettingsShell
      description="Update department metadata without affecting the tenant boundaries that employee records rely on."
      eyebrow="Organization Settings"
      title={`Edit ${department.name}`}
    >
      <DepartmentsForm
        departmentId={department.id}
        initialValues={{
          name: department.name,
          code: department.code || "",
          description: department.description || "",
          defaultWorkScheduleId: department.defaultWorkScheduleId ?? "",
          isActive: department.isActive,
        }}
        mode="edit"
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
