import { apiRequestJson } from "@/lib/server-api";
import { LocationsForm } from "../../../_components/locations-form";
import { SettingsShell } from "../../../_components/settings-shell";
import { LocationRecord } from "../../../types";

type EditLocationPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLocationPage({
  params,
}: EditLocationPageProps) {
  const { id } = await params;
  const location = await apiRequestJson<LocationRecord>(`/locations/${id}`);

  return (
    <SettingsShell
      description="Update location metadata while keeping tenant-safe master data available to employee management and future modules."
      eyebrow="Organization Settings"
      title={`Edit ${location.name}`}
    >
      <LocationsForm
        initialValues={{
          name: location.name,
          code: location.code || "",
          addressLine1: location.addressLine1 || "",
          addressLine2: location.addressLine2 || "",
          city: location.city,
          state: location.state,
          country: location.country,
          zipCode: location.zipCode || "",
          timezone: location.timezone || "",
          isActive: location.isActive,
        }}
        locationId={location.id}
        mode="edit"
      />
    </SettingsShell>
  );
}
