"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { EmployeeEducationRecord } from "../types";

type EducationFormState = {
  institutionName: string;
  degreeTitle: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  gradeOrCgpa: string;
  description: string;
};

const initialForm: EducationFormState = {
  institutionName: "",
  degreeTitle: "",
  fieldOfStudy: "",
  startDate: "",
  endDate: "",
  gradeOrCgpa: "",
  description: "",
};

export function EmployeeEducationManager({
  educationRecords,
  employeeId,
}: {
  educationRecords: EmployeeEducationRecord[];
  employeeId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<EducationFormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function hydrateForm(record: EmployeeEducationRecord) {
    setEditingId(record.id);
    setForm({
      institutionName: record.institutionName,
      degreeTitle: record.degreeTitle,
      fieldOfStudy: record.fieldOfStudy || "",
      startDate: record.startDate ? record.startDate.slice(0, 10) : "",
      endDate: record.endDate ? record.endDate.slice(0, 10) : "",
      gradeOrCgpa: record.gradeOrCgpa || "",
      description: record.description || "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(
      editingId
        ? `/api/employees/${employeeId}/education/${editingId}`
        : `/api/employees/${employeeId}/education`,
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionName: form.institutionName,
          degreeTitle: form.degreeTitle,
          fieldOfStudy: form.fieldOfStudy || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          gradeOrCgpa: form.gradeOrCgpa || null,
          description: form.description || null,
        }),
      },
    );

    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? "Unable to save education record.");
      setIsSubmitting(false);
      return;
    }

    resetForm();
    setIsSubmitting(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/employees/${employeeId}/education/${id}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2" onSubmit={handleSubmit}>
        <Field label="Institution" value={form.institutionName} onChange={(value) => setForm((current) => ({ ...current, institutionName: value }))} />
        <Field label="Degree" value={form.degreeTitle} onChange={(value) => setForm((current) => ({ ...current, degreeTitle: value }))} />
        <Field label="Field of study" value={form.fieldOfStudy} onChange={(value) => setForm((current) => ({ ...current, fieldOfStudy: value }))} />
        <Field label="Grade / CGPA" value={form.gradeOrCgpa} onChange={(value) => setForm((current) => ({ ...current, gradeOrCgpa: value }))} />
        <Field label="Start date" type="date" value={form.startDate} onChange={(value) => setForm((current) => ({ ...current, startDate: value }))} />
        <Field label="End date" type="date" value={form.endDate} onChange={(value) => setForm((current) => ({ ...current, endDate: value }))} />
        <label className="space-y-2 text-sm md:col-span-2">
          <span className="font-medium text-foreground">Description</span>
          <textarea className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20" onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} value={form.description} />
        </label>
        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger md:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="md:col-span-2 flex gap-3">
          <button className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Saving..." : editingId ? "Update education" : "Add education"}
          </button>
          {editingId ? (
            <button className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent" onClick={resetForm} type="button">
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      {educationRecords.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted shadow-sm">
          No education records added yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {educationRecords.map((record) => (
            <article key={record.id} className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-foreground">{record.degreeTitle}</h4>
                  <p className="mt-1 text-muted">{record.institutionName}</p>
                  <p className="mt-2 text-sm text-muted">
                    {[record.fieldOfStudy, record.gradeOrCgpa].filter(Boolean).join(" • ") || "No extra academic details"}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {[formatDate(record.startDate), formatDate(record.endDate)].filter((item) => item !== "Not set").join(" to ") || "Dates not set"}
                  </p>
                  {record.description ? (
                    <p className="mt-3 text-sm text-muted">{record.description}</p>
                  ) : null}
                </div>
                <div className="flex gap-3">
                  <button className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent" onClick={() => hydrateForm(record)} type="button">
                    Edit
                  </button>
                  <button className="rounded-2xl border border-danger/20 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/5" onClick={() => handleDelete(record.id)} type="button">
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
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
  type?: string;
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

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}
