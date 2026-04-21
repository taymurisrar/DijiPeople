"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { EmployeeListItem } from "@/app/dashboard/employees/types";
import { EmployeeCompensationRecord, PayFrequency } from "../types";

const payFrequencies: PayFrequency[] = [
  "MONTHLY",
  "SEMI_MONTHLY",
  "BI_WEEKLY",
  "WEEKLY",
];

export function EmployeeCompensationForm({
  compensations,
  employees,
}: {
  compensations: EmployeeCompensationRecord[];
  employees: EmployeeListItem[];
}) {
  const router = useRouter();
  const [selectedCompensationId, setSelectedCompensationId] = useState("");
  const [form, setForm] = useState({
    employeeId: "",
    basicSalary: "",
    payFrequency: "MONTHLY" as PayFrequency,
    effectiveDate: "",
    endDate: "",
    currency: "USD",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCompensationSelect(compensationId: string) {
    setSelectedCompensationId(compensationId);
    const existing = compensations.find((item) => item.id === compensationId);

    if (!existing) {
      setForm({
        employeeId: "",
        basicSalary: "",
        payFrequency: "MONTHLY",
        effectiveDate: "",
        endDate: "",
        currency: "USD",
      });
      return;
    }

    setForm({
      employeeId: existing.employeeId,
      basicSalary: existing.basicSalary,
      payFrequency: existing.payFrequency,
      effectiveDate: existing.effectiveDate.slice(0, 10),
      endDate: existing.endDate?.slice(0, 10) ?? "",
      currency: existing.currency,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.employeeId || !form.basicSalary || !form.effectiveDate) {
      setError("Employee, basic salary, and effective date are required.");
      return;
    }

    setIsSubmitting(true);

    const endpoint = selectedCompensationId
      ? `/api/payroll/compensations/${selectedCompensationId}`
      : "/api/payroll/compensations";
    const method = selectedCompensationId ? "PATCH" : "POST";
    const payload = {
      employeeId: form.employeeId,
      basicSalary: form.basicSalary,
      payFrequency: form.payFrequency,
      effectiveDate: form.effectiveDate,
      ...(form.endDate ? { endDate: form.endDate } : {}),
      currency: form.currency,
    };

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to save employee compensation.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2" onSubmit={handleSubmit}>
      <label className="space-y-2 text-sm md:col-span-2">
        <span className="font-medium text-foreground">Edit existing compensation</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => handleCompensationSelect(event.target.value)}
          value={selectedCompensationId}
        >
          <option value="">Create a new compensation profile</option>
          {compensations.map((compensation) => (
            <option key={compensation.id} value={compensation.id}>
              {compensation.employee.fullName} · {compensation.currency} {compensation.basicSalary}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">Employee</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}
          value={form.employeeId}
        >
          <option value="">Select employee</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName} · {employee.employeeCode}
            </option>
          ))}
        </select>
      </label>

      <Field label="Basic salary" value={form.basicSalary} onChange={(basicSalary) => setForm((current) => ({ ...current, basicSalary }))} />
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">Pay frequency</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => setForm((current) => ({ ...current, payFrequency: event.target.value as PayFrequency }))}
          value={form.payFrequency}
        >
          {payFrequencies.map((frequency) => (
            <option key={frequency} value={frequency}>
              {frequency.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <Field label="Effective date" type="date" value={form.effectiveDate} onChange={(effectiveDate) => setForm((current) => ({ ...current, effectiveDate }))} />
      <Field label="End date" type="date" value={form.endDate} onChange={(endDate) => setForm((current) => ({ ...current, endDate }))} />
      <Field label="Currency" value={form.currency} onChange={(currency) => setForm((current) => ({ ...current, currency: currency.toUpperCase() }))} />

      <div className="md:col-span-2 flex flex-wrap items-center gap-3">
        <button className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : selectedCompensationId ? "Update compensation" : "Assign compensation"}
        </button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </form>
  );
}

function Field({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: "date" | "text";
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
