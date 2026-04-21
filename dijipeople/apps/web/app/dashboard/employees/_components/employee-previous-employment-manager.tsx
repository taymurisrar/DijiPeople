"use client";

import { FormEvent, useState } from "react";
import { EmployeePreviousEmploymentRecord } from "../types";

type DraftState = {
  companyName: string;
  jobTitle: string;
  department: string;
  employmentType: string;
  startDate: string;
  endDate: string;
  finalSalary: string;
  reasonForLeaving: string;
  referenceName: string;
  referenceContact: string;
  notes: string;
};

const emptyDraft: DraftState = {
  companyName: "",
  jobTitle: "",
  department: "",
  employmentType: "",
  startDate: "",
  endDate: "",
  finalSalary: "",
  reasonForLeaving: "",
  referenceName: "",
  referenceContact: "",
  notes: "",
};

export function EmployeePreviousEmploymentManager({
  employeeId,
  previousEmployments,
}: {
  employeeId: string;
  previousEmployments: EmployeePreviousEmploymentRecord[];
}) {
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [items, setItems] = useState(previousEmployments);
  const [error, setError] = useState<string | null>(null);

  function updateField(key: keyof DraftState, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    const response = await fetch(
      `/api/employees/${employeeId}/previous-employments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: draft.companyName,
          jobTitle: draft.jobTitle,
          department: emptyToUndefined(draft.department),
          employmentType: emptyToUndefined(draft.employmentType),
          startDate: emptyToUndefined(draft.startDate),
          endDate: emptyToUndefined(draft.endDate),
          finalSalary: emptyToUndefined(draft.finalSalary),
          reasonForLeaving: emptyToUndefined(draft.reasonForLeaving),
          referenceName: emptyToUndefined(draft.referenceName),
          referenceContact: emptyToUndefined(draft.referenceContact),
          notes: emptyToUndefined(draft.notes),
        }),
      },
    );

    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | EmployeePreviousEmploymentRecord[]
      | null;

    if (!response.ok || !Array.isArray(data)) {
      setError(
        !response.ok && data && "message" in data
          ? data.message ?? "Unable to add previous employment."
          : "Unable to add previous employment.",
      );
      setIsSaving(false);
      return;
    }

    setItems(data);
    setDraft(emptyDraft);
    setIsSaving(false);
  }

  async function handleDelete(previousEmploymentId: string) {
    setError(null);
    const response = await fetch(
      `/api/employees/${employeeId}/previous-employments/${previousEmploymentId}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(data?.message ?? "Unable to remove previous employment.");
      return;
    }

    setItems((current) =>
      current.filter((item) => item.id !== previousEmploymentId),
    );
  }

  return (
    <section className="grid gap-6">
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Previous Employment
          </p>
          <p className="mt-2 text-sm text-muted">
            Capture relevant external experience so hiring quality, payroll,
            and manager context all stay visible in one employee master record.
          </p>
        </div>

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-white/80 px-4 py-4 text-sm text-muted">
            No previous employment has been recorded yet.
          </p>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-border bg-white/80 px-5 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {item.jobTitle} at {item.companyName}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {[
                        item.department || null,
                        item.employmentType || null,
                        formatDateRange(item.startDate, item.endDate),
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                    {item.reasonForLeaving ? (
                      <p className="mt-2 text-sm text-muted">
                        Reason for leaving: {item.reasonForLeaving}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-2 text-sm text-muted">{item.notes}</p>
                    ) : null}
                  </div>
                  <button
                    className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-danger/40 hover:text-danger"
                    onClick={() => handleDelete(item.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <form
        className="rounded-[24px] border border-border bg-surface p-6 shadow-sm"
        onSubmit={handleCreate}
      >
        <h4 className="text-lg font-semibold text-foreground">
          Add previous employment
        </h4>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextField
            label="Company name"
            required
            value={draft.companyName}
            onChange={(value) => updateField("companyName", value)}
          />
          <TextField
            label="Job title"
            required
            value={draft.jobTitle}
            onChange={(value) => updateField("jobTitle", value)}
          />
          <TextField
            label="Department"
            value={draft.department}
            onChange={(value) => updateField("department", value)}
          />
          <TextField
            label="Employment type"
            value={draft.employmentType}
            onChange={(value) => updateField("employmentType", value)}
          />
          <TextField
            label="Start date"
            type="date"
            value={draft.startDate}
            onChange={(value) => updateField("startDate", value)}
          />
          <TextField
            label="End date"
            type="date"
            value={draft.endDate}
            onChange={(value) => updateField("endDate", value)}
          />
          <TextField
            label="Final salary"
            type="number"
            value={draft.finalSalary}
            onChange={(value) => updateField("finalSalary", value)}
          />
          <TextField
            label="Reason for leaving"
            value={draft.reasonForLeaving}
            onChange={(value) => updateField("reasonForLeaving", value)}
          />
          <TextField
            label="Reference name"
            value={draft.referenceName}
            onChange={(value) => updateField("referenceName", value)}
          />
          <TextField
            label="Reference contact"
            value={draft.referenceContact}
            onChange={(value) => updateField("referenceContact", value)}
          />
          <TextAreaField
            label="Notes"
            value={draft.notes}
            onChange={(value) => updateField("notes", value)}
          />
        </div>

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
            {isSaving ? "Saving..." : "Add previous employment"}
          </button>
        </div>
      </form>
    </section>
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

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function formatDateRange(startDate?: string | null, endDate?: string | null) {
  const start = startDate ? new Date(startDate).toLocaleDateString() : "Start n/a";
  const end = endDate ? new Date(endDate).toLocaleDateString() : "Present";
  return `${start} to ${end}`;
}
