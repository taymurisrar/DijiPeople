"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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
    isActive: boolean;
  };
  locationId?: string;
  mode: "create" | "edit";
};

export function LocationsForm({
  initialValues,
  locationId,
  mode,
}: LocationsFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.city.trim() || !form.state.trim() || !form.country.trim()) {
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

    router.push("/dashboard/settings/locations");
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
        <Field label="Location name" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
        <Field label="Code" value={form.code} onChange={(code) => setForm((current) => ({ ...current, code }))} />
        <Field label="Address line 1" value={form.addressLine1} onChange={(addressLine1) => setForm((current) => ({ ...current, addressLine1 }))} />
        <Field label="Address line 2" value={form.addressLine2} onChange={(addressLine2) => setForm((current) => ({ ...current, addressLine2 }))} />
        <Field label="City" required value={form.city} onChange={(city) => setForm((current) => ({ ...current, city }))} />
        <Field label="State" required value={form.state} onChange={(state) => setForm((current) => ({ ...current, state }))} />
        <Field label="Country" required value={form.country} onChange={(country) => setForm((current) => ({ ...current, country }))} />
        <Field label="Zip code" value={form.zipCode} onChange={(zipCode) => setForm((current) => ({ ...current, zipCode }))} />
        <Field label="Timezone" value={form.timezone} onChange={(timezone) => setForm((current) => ({ ...current, timezone }))} />
        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
          <input
            checked={form.isActive}
            className="h-4 w-4 rounded border-border"
            onChange={(event) =>
              setForm((current) => ({ ...current, isActive: event.target.checked }))
            }
            type="checkbox"
          />
          Active location
        </label>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-3">
        <button className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : mode === "create" ? "Create location" : "Save changes"}
        </button>
        <button
          className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted"
          onClick={() => router.back()}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  onChange,
  required,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
