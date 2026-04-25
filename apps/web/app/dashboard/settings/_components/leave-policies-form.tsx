"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LeaveAccrualType } from "../types";

const accrualTypeOptions: LeaveAccrualType[] = [
  "FIXED_ANNUAL",
  "MONTHLY_ACCRUAL",
  "NONE",
];

const genderOptions = ["", "FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_TO_SAY"];

type LeavePoliciesFormProps = {
  initialValues: {
    name: string;
    accrualType: LeaveAccrualType;
    annualEntitlement: string;
    carryForwardAllowed: boolean;
    carryForwardLimit: string;
    negativeBalanceAllowed: boolean;
    genderRestriction: string;
    probationRestriction: boolean;
    requiresDocumentAfterDays: string;
    isActive: boolean;
  };
  leavePolicyId?: string;
  mode: "create" | "edit";
};

export function LeavePoliciesForm({
  initialValues,
  leavePolicyId,
  mode,
}: LeavePoliciesFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.annualEntitlement.trim()) {
      setError("Name and annual entitlement are required.");
      return;
    }

    const payload = {
      name: form.name,
      accrualType: form.accrualType,
      annualEntitlement: Number(form.annualEntitlement),
      carryForwardAllowed: form.carryForwardAllowed,
      carryForwardLimit: form.carryForwardLimit
        ? Number(form.carryForwardLimit)
        : undefined,
      negativeBalanceAllowed: form.negativeBalanceAllowed,
      genderRestriction: form.genderRestriction || undefined,
      probationRestriction: form.probationRestriction,
      requiresDocumentAfterDays: form.requiresDocumentAfterDays
        ? Number(form.requiresDocumentAfterDays)
        : undefined,
      isActive: form.isActive,
    };

    setIsSubmitting(true);

    const response = await fetch(
      mode === "create"
        ? "/api/leave-policies"
        : `/api/leave-policies/${leavePolicyId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? `Unable to ${mode} leave policy.`);
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard/settings/leave-policies");
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
        <Field label="Policy name" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
        <SelectField label="Accrual type" options={accrualTypeOptions.map((value) => ({ label: formatLabel(value), value }))} value={form.accrualType} onChange={(accrualType) => setForm((current) => ({ ...current, accrualType: accrualType as LeaveAccrualType }))} />
        <Field label="ANNUAL entitlement" required type="number" value={form.annualEntitlement} onChange={(annualEntitlement) => setForm((current) => ({ ...current, annualEntitlement }))} />
        <Field label="Carry forward limit" type="number" value={form.carryForwardLimit} onChange={(carryForwardLimit) => setForm((current) => ({ ...current, carryForwardLimit }))} />
        <Field label="Requires document after days" type="number" value={form.requiresDocumentAfterDays} onChange={(requiresDocumentAfterDays) => setForm((current) => ({ ...current, requiresDocumentAfterDays }))} />
        <SelectField label="Gender restriction" options={genderOptions.map((value) => ({ label: value ? formatLabel(value) : "No restriction", value }))} value={form.genderRestriction} onChange={(genderRestriction) => setForm((current) => ({ ...current, genderRestriction }))} />
        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
          <input checked={form.carryForwardAllowed} className="h-4 w-4 rounded border-border" onChange={(event) => setForm((current) => ({ ...current, carryForwardAllowed: event.target.checked }))} type="checkbox" />
          Carry forward allowed
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
          <input checked={form.negativeBalanceAllowed} className="h-4 w-4 rounded border-border" onChange={(event) => setForm((current) => ({ ...current, negativeBalanceAllowed: event.target.checked }))} type="checkbox" />
          Negative balance allowed
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
          <input checked={form.probationRestriction} className="h-4 w-4 rounded border-border" onChange={(event) => setForm((current) => ({ ...current, probationRestriction: event.target.checked }))} type="checkbox" />
          Restricted during probation
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
          <input checked={form.isActive} className="h-4 w-4 rounded border-border" onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} type="checkbox" />
          Active leave policy
        </label>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-3">
        <button className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : mode === "create" ? "Create leave policy" : "Save changes"}
        </button>
        <button className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted" onClick={() => router.back()} type="button">
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

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
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

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
