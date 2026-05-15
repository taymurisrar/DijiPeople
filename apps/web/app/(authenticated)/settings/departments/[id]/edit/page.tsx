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
  const department = await apiRequestJson<DepartmentRecord>(`/departments/${id}`);

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
          isActive: department.isActive,
        }}
        mode="edit"
      />
    </SettingsShell>
  );
}
