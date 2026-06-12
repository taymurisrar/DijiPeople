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
  const [location, workSchedules, holidayCalendars] = await Promise.all([
    apiRequestJson<LocationRecord>(`/locations/${id}`),
    apiRequestJson<Record<string, unknown>[]>("/work-schedules"),
    apiRequestJson<Record<string, unknown>[]>("/holiday-calendars"),
  ]);

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
          latitude: location.latitude?.toString() ?? "",
          longitude: location.longitude?.toString() ?? "",
          allowedRadiusMeters: location.allowedRadiusMeters?.toString() ?? "",
          defaultWorkScheduleId: location.defaultWorkScheduleId ?? "",
          holidayCalendarId: location.holidayCalendarId ?? "",
          isActive: location.isActive,
        }}
        holidayCalendars={toLookupOptions(holidayCalendars)}
        locationId={location.id}
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
