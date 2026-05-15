"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { EmployeeListItem } from "../../employees/types";

export function ProjectAssignmentForm({
  employees,
  projectId,
}: {
  employees: EmployeeListItem[];
  projectId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    employeeId: "",
    roleOnProject: "",
    allocationPercent: "",
    billableFlag: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.employeeId) {
      setError("Employee is required.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(`/api/projects/${projectId}/assignments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        employeeId: form.employeeId,
        roleOnProject: form.roleOnProject || undefined,
        allocationPercent: form.allocationPercent
          ? Number(form.allocationPercent)
          : undefined,
        billableFlag: form.billableFlag,
      }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to assign employee.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setForm({
      employeeId: "",
      roleOnProject: "",
      allocationPercent: "",
      billableFlag: false,
    });
    setIsSubmitting(false);
  }

  return (
    <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2" onSubmit={handleSubmit}>
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">Employee</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={form.employeeId}
          onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}
        >
          <option value="">Select employee</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName} ({employee.employeeCode})
            </option>
          ))}
        </select>
      </label>
      <Field label="Role on project" value={form.roleOnProject} onChange={(value) => setForm((current) => ({ ...current, roleOnProject: value }))} />
      <Field label="Allocation %" type="number" value={form.allocationPercent} onChange={(value) => setForm((current) => ({ ...current, allocationPercent: value }))} />
      <label className="flex items-center gap-3 text-sm font-medium text-foreground">
        <input
          checked={form.billableFlag}
          className="h-4 w-4 rounded border-border"
          type="checkbox"
          onChange={(event) => setForm((current) => ({ ...current, billableFlag: event.target.checked }))}
        />
        Billable assignment
      </label>
      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger md:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="md:col-span-2">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Assigning..." : "Assign employee"}
        </button>
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
  type?: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
