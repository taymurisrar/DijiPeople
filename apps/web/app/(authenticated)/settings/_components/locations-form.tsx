"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  CheckboxField,
  LookupField,
  NumberField,
  TextField,
  type LookupOption,
} from "@/app/components/ui/form-control";

type LocationsFormProps = {
  initialValues: {
    name: string;
    code: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    timezone: string;
    latitude: string;
    longitude: string;
    allowedRadiusMeters: string;
    defaultWorkScheduleId: string;
    holidayCalendarId: string;
    isActive: boolean;
  };
  holidayCalendars: LookupOption[];
  locationId?: string;
  mode: "create" | "edit";
  workSchedules: LookupOption[];
};

export function LocationsForm({
  initialValues,
  holidayCalendars,
  locationId,
  mode,
  workSchedules,
}: LocationsFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (
      !form.name.trim() ||
      !form.city.trim() ||
      !form.state.trim() ||
      !form.country.trim()
    ) {
      setError("Name, city, state, and country are required.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(
      mode === "create" ? "/api/locations" : `/api/locations/${locationId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? `Unable to ${mode} location.`);
      setIsSubmitting(false);
      return;
    }

    router.push("/settings/locations");
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
        <TextField
          label="Location name"
          onChange={(name) => setForm((current) => ({ ...current, name }))}
          required
          value={form.name}
        />
        <TextField
          label="Code"
          onChange={(code) => setForm((current) => ({ ...current, code }))}
          value={form.code}
        />
        <TextField
          label="Address line 1"
          onChange={(addressLine1) =>
            setForm((current) => ({ ...current, addressLine1 }))
          }
          value={form.addressLine1}
        />
        <TextField
          label="Address line 2"
          onChange={(addressLine2) =>
            setForm((current) => ({ ...current, addressLine2 }))
          }
          value={form.addressLine2}
        />
        <TextField
          label="City"
          onChange={(city) => setForm((current) => ({ ...current, city }))}
          required
          value={form.city}
        />
        <TextField
          label="State"
          onChange={(state) => setForm((current) => ({ ...current, state }))}
          required
          value={form.state}
        />
        <TextField
          label="Country"
          onChange={(country) =>
            setForm((current) => ({ ...current, country }))
          }
          required
          value={form.country}
        />
        <TextField
          label="Zip code"
          onChange={(zipCode) =>
            setForm((current) => ({ ...current, zipCode }))
          }
          value={form.zipCode}
        />
        <TextField
          label="Timezone"
          onChange={(timezone) =>
            setForm((current) => ({ ...current, timezone }))
          }
          placeholder="Asia/Riyadh"
          value={form.timezone}
        />
        <NumberField
          label="Latitude"
          onChange={(latitude) =>
            setForm((current) => ({
              ...current,
              latitude: latitude === null ? "" : String(latitude),
            }))
          }
          value={form.latitude ? Number(form.latitude) : null}
        />
        <NumberField
          label="Longitude"
          onChange={(longitude) =>
            setForm((current) => ({
              ...current,
              longitude: longitude === null ? "" : String(longitude),
            }))
          }
          value={form.longitude ? Number(form.longitude) : null}
        />
        <NumberField
          label="Allowed radius (meters)"
          onChange={(allowedRadiusMeters) =>
            setForm((current) => ({
              ...current,
              allowedRadiusMeters:
                allowedRadiusMeters === null ? "" : String(allowedRadiusMeters),
            }))
          }
          value={
            form.allowedRadiusMeters ? Number(form.allowedRadiusMeters) : null
          }
        />
        <LookupField
          label="Default work schedule"
          onChange={(defaultWorkScheduleId) =>
            setForm((current) => ({ ...current, defaultWorkScheduleId }))
          }
          options={workSchedules}
          placeholder="Inherit tenant default"
          value={form.defaultWorkScheduleId}
        />
        <LookupField
          label="Holiday calendar"
          onChange={(holidayCalendarId) =>
            setForm((current) => ({ ...current, holidayCalendarId }))
          }
          options={holidayCalendars}
          placeholder="Use schedule calendar"
          value={form.holidayCalendarId}
        />
        <CheckboxField
          checked={form.isActive}
          label="Active work site"
          onChange={(isActive) =>
            setForm((current) => ({ ...current, isActive }))
          }
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-3">
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting
            ? "Saving..."
            : mode === "create"
              ? "Create location"
              : "Save changes"}
        </Button>
        <Button onClick={() => router.back()} type="button" variant="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
}
