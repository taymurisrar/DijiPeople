"use client";

import { useEffect, useState } from "react";
import { CustomFieldsSection } from "@/app/components/runtime/custom-fields-section";
import {
  DateField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import {
  customFieldErrors,
  customFieldValues,
} from "@/lib/runtime/custom-fields";
import {
  maskedSecret,
  paySetupFormValues,
  paySetupSaveBody,
  SECRET_FIELDS,
  type Compensation,
  type SecretKey,
} from "./pay-setup";

/*
 * TASK-0036 — the employee Pay setup tab: the current EmployeeCompensation,
 * which had an API and no screen. Not the Compensation tab beside it, which
 * edits the salary package history (EmployeeCompensationHistory). The rules
 * for bank details live in ./pay-setup.
 */

const PAY_FREQUENCIES = ["MONTHLY", "SEMI_MONTHLY", "BI_WEEKLY", "WEEKLY"];
const PAYROLL_STATUSES = ["ACTIVE", "ON_HOLD", "STOPPED"];
const PAYMENT_MODES = ["BANK_TRANSFER", "CASH", "CHECK", "OTHER"];

function options(values: readonly string[]) {
  return values.map((value) => ({
    value,
    label: value
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
  }));
}

export function EmployeePayBankingPanel({
  employeeId,
  canEdit,
}: {
  readonly employeeId: string;
  readonly canEdit: boolean;
}) {
  const [loaded, setLoaded] = useState<Compensation | null | undefined>();
  const [form, setForm] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Partial<Record<SecretKey, string>>>(
    {},
  );
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function apply(record: Compensation | null) {
    setLoaded(record);
    setForm(paySetupFormValues(record));
    setSecrets({});
    setCustomFields(customFieldValues(record));
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/employees/${encodeURIComponent(employeeId)}/compensation`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load pay and banking.");
        const body = (await response.text()) || "null";
        return JSON.parse(body) as Compensation | null;
      })
      .then((record) => {
        if (active) apply(record);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setLoaded(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load pay and banking.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [employeeId]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});
    const body = paySetupSaveBody(form, secrets, customFields);
    const response = await fetch(
      `/api/employees/${encodeURIComponent(employeeId)}/compensation`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = (await response.json().catch(() => null)) as
      | (Compensation & { message?: string | string[]; details?: unknown })
      | null;
    setSaving(false);
    if (!response.ok) {
      const text = Array.isArray(data?.message)
        ? data?.message.join(", ")
        : data?.message;
      setError(text ?? "Unable to save pay and banking.");
      setFieldErrors(customFieldErrors(data?.details) ?? {});
      return;
    }
    apply(data);
    setMessage("Saved.");
  }

  if (loaded === undefined) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const set = (key: string) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const disabled = !canEdit || saving;

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <TextField
          disabled={disabled}
          label="Basic salary"
          onChange={set("basicSalary")}
          required
          value={form.basicSalary ?? ""}
        />
        <SelectField
          disabled={disabled}
          label="Pay frequency"
          onChange={set("payFrequency")}
          options={options(PAY_FREQUENCIES)}
          required
          value={form.payFrequency ?? ""}
        />
        <TextField
          disabled={disabled}
          label="Currency"
          maxLength={8}
          onChange={set("currency")}
          value={form.currency ?? ""}
        />
        <DateField
          disabled={disabled}
          label="Effective date"
          onChange={set("effectiveDate")}
          required
          value={form.effectiveDate ?? ""}
        />
        <DateField
          disabled={disabled}
          label="End date"
          onChange={set("endDate")}
          value={form.endDate ?? ""}
        />
        <SelectField
          disabled={disabled}
          label="Payroll status"
          onChange={set("payrollStatus")}
          options={options(PAYROLL_STATUSES)}
          value={form.payrollStatus ?? ""}
        />
        <SelectField
          disabled={disabled}
          label="Payment mode"
          onChange={set("paymentMode")}
          options={options(PAYMENT_MODES)}
          value={form.paymentMode ?? ""}
        />
        <TextField
          disabled={disabled}
          label="Payroll group"
          onChange={set("payrollGroup")}
          value={form.payrollGroup ?? ""}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TextField
          disabled={disabled}
          label="Bank name"
          onChange={set("bankName")}
          value={form.bankName ?? ""}
        />
        <TextField
          disabled={disabled}
          label="Account title"
          onChange={set("bankAccountTitle")}
          value={form.bankAccountTitle ?? ""}
        />
        {SECRET_FIELDS.map(([key, label]) => (
          <TextField
            autoComplete="off"
            disabled={disabled}
            key={key}
            label={label}
            onChange={(value) =>
              setSecrets((current) => ({ ...current, [key]: value }))
            }
            placeholder={maskedSecret(loaded?.[key])}
            value={secrets[key] ?? ""}
          />
        ))}
      </div>

      <TextAreaField
        disabled={disabled}
        label="Notes"
        onChange={set("notes")}
        value={form.notes ?? ""}
      />

      <CustomFieldsSection
        disabled={disabled}
        errors={fieldErrors}
        tableKey="employeeCompensations"
        value={customFields}
        onChange={setCustomFields}
      />

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {canEdit ? (
        <div>
          <button
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
