"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  DocumentUploadForm,
} from "@/app/dashboard/_components/documents/document-upload-form";
import { SharedLookupOption } from "@/app/dashboard/_components/documents/types";
import { LeaveRequestFormValues, LeaveTypeOption } from "../types";

type LeaveRequestFormProps = {
  leaveTypes: LeaveTypeOption[];
  documentTypes: SharedLookupOption[];
  documentCategories: SharedLookupOption[];
};

const initialValues: LeaveRequestFormValues = {
  leaveTypeId: "",
  startDate: "",
  endDate: "",
  reason: "",
};

export function LeaveRequestForm({
  leaveTypes,
  documentTypes,
  documentCategories,
}: LeaveRequestFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<LeaveRequestFormValues>(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);

  const selectedLeaveType = useMemo(
    () => leaveTypes.find((leaveType) => leaveType.id === form.leaveTypeId),
    [form.leaveTypeId, leaveTypes],
  );

  function updateField<Key extends keyof LeaveRequestFormValues>(
    key: Key,
    value: LeaveRequestFormValues[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateForm() {
    if (!form.leaveTypeId) return "Leave type is required.";
    if (!form.startDate) return "Start date is required.";
    if (!form.endDate) return "End date is required.";
    if (new Date(form.endDate) < new Date(form.startDate)) {
      return "End date cannot be before start date.";
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/leave-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leaveTypeId: form.leaveTypeId,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason || undefined,
        }),
      });

      const data = (await response.json()) as {
        id?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(data.message ?? "Unable to submit leave request.");
        setIsSubmitting(false);
        return;
      }

      setCreatedRequestId(data.id ?? null);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to submit leave request.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  return (
    <div className="grid gap-6">
      <form className="grid gap-6" onSubmit={handleSubmit}>
        <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
          <SelectField
            label="Leave type"
            options={[
              { label: "Select leave type", value: "" },
              ...leaveTypes.map((leaveType) => ({
                label: `${leaveType.name} (${leaveType.code})`,
                value: leaveType.id,
              })),
            ]}
            required
            value={form.leaveTypeId}
            onChange={(value) => updateField("leaveTypeId", value)}
          />
          <Field
            label="Start date"
            required
            type="date"
            value={form.startDate}
            onChange={(value) => updateField("startDate", value)}
          />
          <Field
            label="End date"
            required
            type="date"
            value={form.endDate}
            onChange={(value) => updateField("endDate", value)}
          />
          <label className="space-y-2 text-sm md:col-span-2">
            <span className="font-medium text-foreground">Reason</span>
            <textarea
              className="min-h-32 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={form.reason}
              onChange={(event) => updateField("reason", event.target.value)}
            />
          </label>
        </section>

        {selectedLeaveType ? (
          <section className="rounded-[24px] border border-border bg-surface-strong p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Leave Type Summary
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <InfoTile label="Category" value={selectedLeaveType.category} />
              <InfoTile
                label="Compensation"
                value={selectedLeaveType.isPaid ? "Paid" : "Unpaid"}
              />
              <InfoTile
                label="Approval flow"
                value={
                  selectedLeaveType.requiresApproval
                    ? "Approval required"
                    : "Auto-approved"
                }
              />
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Submitting..." : "Submit leave request"}
          </button>
          <button
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            onClick={() => router.back()}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>

      {createdRequestId ? (
        <DocumentUploadForm
          documentCategories={documentCategories}
          documentTypes={documentTypes}
          entityId={createdRequestId}
          entityType="LEAVE_REQUEST"
          submitLabel="Upload leave attachment"
        />
      ) : (
        <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted shadow-sm">
          Submit the leave request first, then upload supporting documents like a
          medical certificate.
        </div>
      )}
    </div>
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
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  required,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <select
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        value={value}
        onChange={(event) => onChange(event.target.value)}
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

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-border bg-white/80 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </article>
  );
}
