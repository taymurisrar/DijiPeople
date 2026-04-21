"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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
  const [form, setForm] = useState(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.code.trim() || !form.category.trim()) {
      setError("Name, code, and category are required.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(
      mode === "create" ? "/api/leave-types" : `/api/leave-types/${leaveTypeId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? `Unable to ${mode} leave type.`);
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard/settings/leave-types");
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
        <Field label="Leave type name" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
        <Field label="Code" required value={form.code} onChange={(code) => setForm((current) => ({ ...current, code }))} />
        <Field label="Category" required value={form.category} onChange={(category) => setForm((current) => ({ ...current, category }))} />
        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
          <input checked={form.isPaid} className="h-4 w-4 rounded border-border" onChange={(event) => setForm((current) => ({ ...current, isPaid: event.target.checked }))} type="checkbox" />
          Paid leave
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
          <input checked={form.requiresApproval} className="h-4 w-4 rounded border-border" onChange={(event) => setForm((current) => ({ ...current, requiresApproval: event.target.checked }))} type="checkbox" />
          Requires approval
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
          <input checked={form.isActive} className="h-4 w-4 rounded border-border" onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} type="checkbox" />
          Active leave type
        </label>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-3">
        <button className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : mode === "create" ? "Create leave type" : "Save changes"}
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
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
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
        value={value}
      />
    </label>
  );
}
