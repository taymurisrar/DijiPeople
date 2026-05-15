import { DesignationsForm } from "../../_components/designations-form";
import { SettingsShell } from "../../_components/settings-shell";

const initialValues = {
  name: "",
  level: "",
  description: "",
  isActive: true,
};

export default function NewDesignationPage() {
  return (
    <SettingsShell
      description="Create designation master data once so employee profiles and future policy modules can reference it consistently."
      eyebrow="Organization Settings"
      title="Create Designation"
    >
      <DesignationsForm initialValues={initialValues} mode="create" />
    </SettingsShell>
  );
}
