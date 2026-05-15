import { DepartmentsForm } from "../../_components/departments-form";
import { SettingsShell } from "../../_components/settings-shell";

const initialValues = {
  name: "",
  code: "",
  description: "",
  isActive: true,
};

export default function NewDepartmentPage() {
  return (
    <SettingsShell
      description="Keep master data simple and durable so employee profiles and future modules can reference the same department records."
      eyebrow="Organization Settings"
      title="Create Department"
    >
      <DepartmentsForm initialValues={initialValues} mode="create" />
    </SettingsShell>
  );
}
