"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PermissionGate } from "../../_components/permission-gate";

type PayrollCycleFormProps = {
  businessUnits?: Array<{ id: string; name: string; type?: string }>;
  initialValues?: {
    businessUnitId: string;
    periodStart: string;
    periodEnd: string;
    runDate: string;
  };
};

export function PayrollCycleForm({
  businessUnits = [],
  initialValues = {
    businessUnitId: "",
    periodStart: "",
    periodEnd: "",
    runDate: "",
  },
}: PayrollCycleFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.periodStart || !form.periodEnd) {
      setError("Period start and end dates are required.");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
      ...(form.businessUnitId ? { businessUnitId: form.businessUnitId } : {}),
      ...(form.runDate ? { runDate: form.runDate } : {}),
    };

    const response = await fetch("/api/payroll/cycles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to create payroll cycle.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setForm({ businessUnitId: "", periodStart: "", periodEnd: "", runDate: "" });
    setIsSubmitting(false);
  }

  return (
    <PermissionGate permission="payroll.write">
      <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-4" onSubmit={handleSubmit}>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">Business unit</span>
          <select
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) =>
              setForm((current) => ({ ...current, businessUnitId: event.target.value }))
            }
            value={form.businessUnitId}
          >
            <option value="">Tenant-wide payroll</option>
            {businessUnits.map((businessUnit) => (
              <option key={businessUnit.id} value={businessUnit.id}>
                {businessUnit.name}
              </option>
            ))}
          </select>
        </label>
        <Field label="Period start" type="date" value={form.periodStart} onChange={(periodStart) => setForm((current) => ({ ...current, periodStart }))} />
        <Field label="Period end" type="date" value={form.periodEnd} onChange={(periodEnd) => setForm((current) => ({ ...current, periodEnd }))} />
        <Field label="Planned run date" type="date" value={form.runDate} onChange={(runDate) => setForm((current) => ({ ...current, runDate }))} />
        <div className="md:col-span-4 flex flex-wrap items-center gap-3">
          <button className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Creating..." : "Create payroll cycle"}
          </button>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </form>
    </PermissionGate>
  );
}

function Field({
  label,
  onChange,
  type,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type: "date" | "text";
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}
