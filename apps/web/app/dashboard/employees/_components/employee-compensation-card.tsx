"use client";

import { FormEvent, useState } from "react";
import {
  PAY_FREQUENCY_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  PAYROLL_STATUS_OPTIONS,
} from "../field-options";
import { EmployeeCompensationRecord } from "../types";

type EmployeeCompensationCardProps = {
  compensation: EmployeeCompensationRecord | null;
  employeeId: string;
};

export function EmployeeCompensationCard({
  compensation,
  employeeId,
}: EmployeeCompensationCardProps) {
  const [form, setForm] = useState({
    basicSalary: compensation?.basicSalary ?? "",
    payFrequency: compensation?.payFrequency ?? "MONTHLY",
    effectiveDate: compensation?.effectiveDate?.slice(0, 10) ?? "",
    endDate: compensation?.endDate?.slice(0, 10) ?? "",
    currency: compensation?.currency ?? "USD",
    payrollStatus: compensation?.payrollStatus ?? "Active",
    payrollGroup: compensation?.payrollGroup ?? "",
    paymentMode: compensation?.paymentMode ?? "",
    bankName: compensation?.bankName ?? "",
    bankAccountTitle: compensation?.bankAccountTitle ?? "",
    bankAccountNumber: compensation?.bankAccountNumber ?? "",
    bankIban: compensation?.bankIban ?? "",
    bankRoutingNumber: compensation?.bankRoutingNumber ?? "",
    taxIdentifier: compensation?.taxIdentifier ?? "",
    notes: compensation?.notes ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSaving(true);

    const response = await fetch(`/api/employees/${employeeId}/compensation`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        endDate: emptyToUndefined(form.endDate),
        payrollGroup: emptyToUndefined(form.payrollGroup),
        paymentMode: emptyToUndefined(form.paymentMode),
        bankName: emptyToUndefined(form.bankName),
        bankAccountTitle: emptyToUndefined(form.bankAccountTitle),
        bankAccountNumber: emptyToUndefined(form.bankAccountNumber),
        bankIban: emptyToUndefined(form.bankIban),
        bankRoutingNumber: emptyToUndefined(form.bankRoutingNumber),
        taxIdentifier: emptyToUndefined(form.taxIdentifier),
        notes: emptyToUndefined(form.notes),
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? "Unable to save compensation details.");
      setIsSaving(false);
      return;
    }

    setMessage("Compensation details updated.");
    setIsSaving(false);
  }

  return (
    <form
      className="rounded-[24px] border border-border bg-surface p-6 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div className="mb-5">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Payroll / Compensation
        </p>
        <p className="mt-2 text-sm text-muted">
          Keep payroll-critical information in one place so payroll, finance,
          and HR all read the same employee record.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Current basic salary"
          required
          type="number"
          value={form.basicSalary}
          onChange={(value) => updateField("basicSalary", value)}
        />
        <SelectField
          label="Pay frequency"
          options={PAY_FREQUENCY_OPTIONS}
          value={form.payFrequency}
          onChange={(value) => updateField("payFrequency", value)}
        />
        <TextField
          label="Compensation effective date"
          required
          type="date"
          value={form.effectiveDate}
          onChange={(value) => updateField("effectiveDate", value)}
        />
        <TextField
          label="Compensation end date"
          type="date"
          value={form.endDate}
          onChange={(value) => updateField("endDate", value)}
        />
        <TextField
          label="Currency"
          value={form.currency}
          onChange={(value) => updateField("currency", value)}
        />
        <SelectField
          label="Payroll status"
          options={PAYROLL_STATUS_OPTIONS}
          value={form.payrollStatus}
          onChange={(value) => updateField("payrollStatus", value)}
        />
        <TextField
          label="Payroll group"
          value={form.payrollGroup}
          onChange={(value) => updateField("payrollGroup", value)}
        />
        <SelectField
          label="Payment mode"
          options={PAYMENT_MODE_OPTIONS}
          value={form.paymentMode}
          onChange={(value) => updateField("paymentMode", value)}
        />
        <TextField
          label="Bank name"
          value={form.bankName}
          onChange={(value) => updateField("bankName", value)}
        />
        <TextField
          label="Bank account title"
          value={form.bankAccountTitle}
          onChange={(value) => updateField("bankAccountTitle", value)}
        />
        <TextField
          label="Bank account number"
          value={form.bankAccountNumber}
          onChange={(value) => updateField("bankAccountNumber", value)}
        />
        <TextField
          label="IBAN"
          value={form.bankIban}
          onChange={(value) => updateField("bankIban", value)}
        />
        <TextField
          label="Routing number"
          value={form.bankRoutingNumber}
          onChange={(value) => updateField("bankRoutingNumber", value)}
        />
        <TextField
          label="Tax identifier"
          value={form.taxIdentifier}
          onChange={(value) => updateField("taxIdentifier", value)}
        />
        <TextAreaField
          label="Notes"
          value={form.notes}
          onChange={(value) => updateField("notes", value)}
        />
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : "Save compensation"}
        </button>
      </div>
    </form>
  );
}

function TextField({
  label,
  onChange,
  required,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
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
        type={type}
        value={value}
      />
    </label>
  );
}

function TextAreaField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm md:col-span-2">
      <span className="font-medium text-foreground">{label}</span>
      <textarea
        className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <select
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
