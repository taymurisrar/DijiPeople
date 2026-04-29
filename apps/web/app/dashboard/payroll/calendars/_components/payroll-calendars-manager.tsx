"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PayrollCalendarRecord } from "../../payroll-run-types";

const frequencies = ["MONTHLY", "SEMI_MONTHLY", "BIWEEKLY", "WEEKLY"] as const;

export function PayrollCalendarsManager({
  calendars,
  canManage,
}: {
  calendars: PayrollCalendarRecord[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PayrollCalendarRecord | null>(null);
  const [form, setForm] = useState({
    name: "",
    frequency: "MONTHLY",
    timezone: "UTC",
    currencyCode: "USD",
    isDefault: false,
    isActive: true,
  });
  const [error, setError] = useState<string | null>(null);

  function edit(calendar: PayrollCalendarRecord) {
    setEditing(calendar);
    setForm({
      name: calendar.name,
      frequency: calendar.frequency,
      timezone: calendar.timezone,
      currencyCode: calendar.currencyCode,
      isDefault: calendar.isDefault,
      isActive: calendar.isActive,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch(
      editing
        ? `/api/payroll/calendars/${editing.id}`
        : "/api/payroll/calendars",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to save payroll calendar.");
      return;
    }
    setEditing(null);
    setForm({
      name: "",
      frequency: "MONTHLY",
      timezone: "UTC",
      currencyCode: "USD",
      isDefault: false,
      isActive: true,
    });
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {canManage ? (
        <form
          className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-4"
          onSubmit={submit}
        >
          <TextInput
            label="Name"
            value={form.name}
            onChange={(name) => setForm((current) => ({ ...current, name }))}
          />
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">Frequency</span>
            <select
              className="rounded-2xl border border-border bg-white px-4 py-3"
              value={form.frequency}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  frequency: event.target.value,
                }))
              }
            >
              {frequencies.map((frequency) => (
                <option key={frequency}>{frequency}</option>
              ))}
            </select>
          </label>
          <TextInput
            label="Timezone"
            value={form.timezone}
            onChange={(timezone) =>
              setForm((current) => ({ ...current, timezone }))
            }
          />
          <TextInput
            label="Currency"
            value={form.currencyCode}
            onChange={(currencyCode) =>
              setForm((current) => ({ ...current, currencyCode }))
            }
          />
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isDefault: event.target.checked,
                }))
              }
            />{" "}
            Default
          </label>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
            />{" "}
            Active
          </label>
          <div className="md:col-span-4">
            {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
            <button
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white"
              type="submit"
            >
              {editing ? "Save calendar" : "Create calendar"}
            </button>
          </div>
        </form>
      ) : null}
      <div className="grid gap-3">
        {calendars.map((calendar) => (
          <article
            className="rounded-[20px] border border-border bg-surface p-5 shadow-sm"
            key={calendar.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">
                  {calendar.name}
                </h3>
                <p className="text-sm text-muted">
                  {calendar.frequency} / {calendar.currencyCode} /{" "}
                  {calendar.timezone}
                </p>
              </div>
              <div className="flex gap-2 text-sm text-muted">
                {calendar.isDefault ? <span>Default</span> : null}
                <span>{calendar.isActive ? "Active" : "Inactive"}</span>
                {canManage ? (
                  <button
                    className="text-accent"
                    onClick={() => edit(calendar)}
                    type="button"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="rounded-2xl border border-border bg-white px-4 py-3"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
