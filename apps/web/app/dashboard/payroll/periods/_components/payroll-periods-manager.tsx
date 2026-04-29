"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PayrollCalendarRecord,
  PayrollPeriodRecord,
} from "../../payroll-run-types";

const statuses = [
  "OPEN",
  "INPUT_CLOSED",
  "PROCESSING",
  "APPROVED",
  "PAID",
  "LOCKED",
] as const;

export function PayrollPeriodsManager({
  calendars,
  canManage,
  periods,
}: {
  calendars: PayrollCalendarRecord[];
  canManage: boolean;
  periods: PayrollPeriodRecord[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PayrollPeriodRecord | null>(null);
  const [form, setForm] = useState({
    payrollCalendarId: calendars[0]?.id ?? "",
    name: "",
    periodStart: "",
    periodEnd: "",
    cutoffDate: "",
    paymentDate: "",
    status: "OPEN",
  });
  const [error, setError] = useState<string | null>(null);

  function edit(period: PayrollPeriodRecord) {
    setEditing(period);
    setForm({
      payrollCalendarId: period.payrollCalendarId,
      name: period.name,
      periodStart: period.periodStart.slice(0, 10),
      periodEnd: period.periodEnd.slice(0, 10),
      cutoffDate: period.cutoffDate?.slice(0, 10) ?? "",
      paymentDate: period.paymentDate?.slice(0, 10) ?? "",
      status: period.status,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch(
      editing ? `/api/payroll/periods/${editing.id}` : "/api/payroll/periods",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cutoffDate: form.cutoffDate || undefined,
          paymentDate: form.paymentDate || undefined,
        }),
      },
    );
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to save payroll period.");
      return;
    }
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {canManage ? (
        <form
          className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-3"
          onSubmit={submit}
        >
          <Select
            label="Calendar"
            value={form.payrollCalendarId}
            values={calendars.map((calendar) => calendar.id)}
            getLabel={(id) =>
              calendars.find((calendar) => calendar.id === id)?.name ?? id
            }
            onChange={(payrollCalendarId) =>
              setForm((current) => ({ ...current, payrollCalendarId }))
            }
          />
          <Input
            label="Name"
            value={form.name}
            onChange={(name) => setForm((current) => ({ ...current, name }))}
          />
          <Select
            label="Status"
            value={form.status}
            values={statuses}
            onChange={(status) =>
              setForm((current) => ({ ...current, status }))
            }
          />
          <Input
            label="Period start"
            type="date"
            value={form.periodStart}
            onChange={(periodStart) =>
              setForm((current) => ({ ...current, periodStart }))
            }
          />
          <Input
            label="Period end"
            type="date"
            value={form.periodEnd}
            onChange={(periodEnd) =>
              setForm((current) => ({ ...current, periodEnd }))
            }
          />
          <Input
            label="Payment date"
            type="date"
            value={form.paymentDate}
            onChange={(paymentDate) =>
              setForm((current) => ({ ...current, paymentDate }))
            }
          />
          <Input
            label="Cutoff date"
            type="date"
            value={form.cutoffDate}
            onChange={(cutoffDate) =>
              setForm((current) => ({ ...current, cutoffDate }))
            }
          />
          <div className="md:col-span-3">
            {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
            <button
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white"
              type="submit"
            >
              {editing ? "Save period" : "Create period"}
            </button>
          </div>
        </form>
      ) : null}
      <div className="grid gap-3">
        {periods.map((period) => (
          <article
            className="rounded-[20px] border border-border bg-surface p-5 shadow-sm"
            key={period.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">{period.name}</h3>
                <p className="text-sm text-muted">
                  {period.payrollCalendar?.name ?? "Calendar"} /{" "}
                  {formatDate(period.periodStart)} to{" "}
                  {formatDate(period.periodEnd)}
                </p>
              </div>
              <div className="flex gap-3 text-sm text-muted">
                <span>{period.status}</span>
                {canManage && period.status !== "LOCKED" ? (
                  <button
                    className="text-accent"
                    onClick={() => edit(period)}
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

function Input({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="rounded-2xl border border-border bg-white px-4 py-3"
        required={label !== "Payment date" && label !== "Cutoff date"}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function Select({
  getLabel,
  label,
  onChange,
  value,
  values,
}: {
  getLabel?: (value: string) => string;
  label: string;
  onChange: (value: string) => void;
  value: string;
  values: readonly string[];
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <select
        className="rounded-2xl border border-border bg-white px-4 py-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {getLabel ? getLabel(item) : item}
          </option>
        ))}
      </select>
    </label>
  );
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
