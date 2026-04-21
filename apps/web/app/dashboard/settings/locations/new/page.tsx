import { LocationsForm } from "../../_components/locations-form";
import { SettingsShell } from "../../_components/settings-shell";

const initialValues = {
  name: "",
  code: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "United States",
  zipCode: "",
  timezone: "",
  isActive: true,
};

export default function NewLocationPage() {
  return (
    <SettingsShell
      description="Set up tenant locations once so employees, scheduling, and future attendance rules can rely on the same site records."
      eyebrow="Organization Settings"
      title="Create Location"
    >
      <LocationsForm initialValues={initialValues} mode="create" />
    </SettingsShell>
  );
}
