import { apiRequestJson } from "@/lib/server-api";
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
  latitude: "",
  longitude: "",
  allowedRadiusMeters: "",
  defaultWorkScheduleId: "",
  holidayCalendarId: "",
  isActive: true,
};

export default async function NewLocationPage() {
  const [workSchedules, holidayCalendars] = await Promise.all([
    apiRequestJson<Record<string, unknown>[]>("/work-schedules"),
    apiRequestJson<Record<string, unknown>[]>("/holiday-calendars"),
  ]);
  return (
    <SettingsShell
      description="Set up tenant locations once so employees, scheduling, and future attendance rules can rely on the same site records."
      eyebrow="Organization Settings"
      title="Create Location"
    >
      <LocationsForm
        holidayCalendars={toLookupOptions(holidayCalendars)}
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
