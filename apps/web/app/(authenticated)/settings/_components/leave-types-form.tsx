"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  CheckboxField,
  SelectField,
  TextField,
} from "@/app/components/ui/form-control";
import { sanitizeNumericCode } from "@/lib/common";

const LEAVE_TYPE_CODE_MAX_DIGITS = 9;

const leaveTypeCategoryOptions = [
  { value: "GENERAL", label: "General" },
  { value: "VACATION", label: "Vacation" },
  { value: "SICK", label: "Sick" },
  { value: "MEDICAL", label: "Medical" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "COMPENSATORY", label: "Compensatory" },
  { value: "MATERNITY", label: "Maternity" },
  { value: "PATERNITY", label: "Paternity" },
  { value: "BEREAVEMENT", label: "Bereavement" },
  { value: "OTHER", label: "Other" },
] as const;

type LeaveTypesFormProps = {
  initialValues: {
    name: string;
    code: string;
    category: string;
    isPaid: boolean;
    requiresApproval: boolean;
    isActive: boolean;
  };
  leaveTypeId?: string;
  mode: "create" | "edit";
};

export function LeaveTypesForm({
  initialValues,
  leaveTypeId,
  mode,
}: LeaveTypesFormProps) {
  const router = useRouter();

  const [form, setForm] = useState({
    ...initialValues,
    code: sanitizeNumericCode(initialValues.code, LEAVE_TYPE_CODE_MAX_DIGITS),
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    const code = sanitizeNumericCode(form.code, LEAVE_TYPE_CODE_MAX_DIGITS);
    const category = form.category.trim();

    if (!name) {
      setError("Leave type name is required.");
      return;
    }

    if (!code) {
      setError("Leave type code is required.");
      return;
    }

    if (!category) {
      setError("Leave type category is required.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(
      mode === "create" ? "/api/leave-types" : `/api/leave-types/${leaveTypeId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code,
          category,
          isPaid: form.isPaid,
          requiresApproval: form.requiresApproval,
          isActive: form.isActive,
        }),
      },
    );

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? `Unable to ${mode} leave type.`);
      setIsSubmitting(false);
      return;
    }

    router.push("/settings/leave-types");
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="border-b border-border pb-5">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Leave Type Details
          </p>

          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            {mode === "create" ? "Create category" : "Update category"}
          </h3>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Define how this leave type appears in employee requests, approval
            flows, payroll processing, and policy rules.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TextField
            label="Leave type name"
            required
            value={form.name}
            placeholder="Annual Leave"
            onChange={(name) =>
              setForm((current) => ({
                ...current,
                name,
              }))
            }
          />

          <TextField
            label="Code"
            required
            hint="Auto generated. You can manually override it."
            value={form.code}
            maxLength={LEAVE_TYPE_CODE_MAX_DIGITS}
            placeholder="001"
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                code: sanitizeNumericCode(value, LEAVE_TYPE_CODE_MAX_DIGITS),
              }))
            }
          />

          <SelectField
            label="Category"
            required
            value={form.category}
            options={leaveTypeCategoryOptions}
            onChange={(category) =>
              setForm((current) => ({
                ...current,
                category,
              }))
            }
          />

          <div className="rounded-2xl border border-border bg-white p-4">
            <p className="text-sm font-semibold text-foreground">
              Behavior flags
            </p>

            <p className="mt-1 text-xs leading-5 text-muted">
              These switches control how the leave type behaves across requests,
              approvals, and payroll.
            </p>

            <div className="mt-4 grid gap-3">
              <CheckboxField
                label="Paid leave"
                hint="Enable when this leave type should be treated as paid."
                checked={form.isPaid}
                onChange={(isPaid) =>
                  setForm((current) => ({
                    ...current,
                    isPaid,
                  }))
                }
              />

              <CheckboxField
                label="Requires approval"
                hint="Enable when manager or HR approval is required."
                checked={form.requiresApproval}
                onChange={(requiresApproval) =>
                  setForm((current) => ({
                    ...current,
                    requiresApproval,
                  }))
                }
              />

              <CheckboxField
                label="Active leave type"
                hint="Inactive leave types should not be available for new requests."
                checked={form.isActive}
                onChange={(isActive) =>
                  setForm((current) => ({
                    ...current,
                    isActive,
                  }))
                }
              />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting
            ? "Saving..."
            : mode === "create"
              ? "Create leave type"
              : "Save changes"}
        </button>

        <button
          className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-medium text-muted transition hover:bg-slate-50"
          disabled={isSubmitting}
          onClick={() => router.back()}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}