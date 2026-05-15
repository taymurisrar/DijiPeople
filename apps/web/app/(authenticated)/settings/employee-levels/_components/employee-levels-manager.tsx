"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";

export type EmployeeLevelRecord = {
  id: string;
  code: string;
  name: string;
  rank: number;
  description: string | null;
  isActive: boolean;
};

type FormState = {
  code: string;
  name: string;
  rank: string;
  description: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  code: "",
  name: "",
  rank: "1",
  description: "",
  isActive: true,
};

export function EmployeeLevelsManager({
  levels,
}: {
  levels: EmployeeLevelRecord[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EmployeeLevelRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const columns = useMemo<DataTableColumn<EmployeeLevelRecord>[]>(
    () => [
      {
        key: "code",
        header: "Code",
        sortable: true,
        searchable: true,
        render: (level) => (
          <span className="font-semibold text-foreground">{level.code}</span>
        ),
      },
      {
        key: "name",
        header: "Name",
        sortable: true,
        searchable: true,
        render: (level) => level.name,
      },
      {
        key: "rank",
        header: "Rank",
        sortable: true,
        render: (level) => level.rank,
      },
      {
        key: "status",
        header: "Status",
        render: (level) => (level.isActive ? "Active" : "Inactive"),
      },
      {
        key: "actions",
        header: "Actions",
        render: (level) => (
          <button
            className="text-sm font-medium text-accent transition hover:text-accent-strong"
            onClick={() => startEdit(level)}
            type="button"
          >
            Edit
          </button>
        ),
      },
    ],
    [],
  );

  function startEdit(level: EmployeeLevelRecord) {
    setEditing(level);
    setError(null);
    setForm({
      code: level.code,
      name: level.name,
      rank: String(level.rank),
      description: level.description ?? "",
      isActive: level.isActive,
    });
  }

  function resetForm() {
    setEditing(null);
    setError(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const rank = Number(form.rank);
    if (
      !form.code.trim() ||
      !form.name.trim() ||
      !Number.isInteger(rank) ||
      rank < 1
    ) {
      setError("Code, name, and a positive rank are required.");
      return;
    }

    setIsSubmitting(true);
    const response = await fetch(
      editing ? `/api/employee-levels/${editing.id}` : "/api/employee-levels",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          rank,
          description: form.description || undefined,
          isActive: form.isActive,
        }),
      },
    );

    const data = (await response.json()) as { message?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to save employee level.");
      return;
    }

    resetForm();
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              {editing ? "Edit Level" : "Create Level"}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Normalized grade foundation
            </h3>
          </div>
          {editing ? (
            <button
              className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-muted"
              onClick={resetForm}
              type="button"
            >
              New level
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Field
            label="Code"
            required
            value={form.code}
            onChange={(code) => setForm((current) => ({ ...current, code }))}
          />
          <Field
            label="Name"
            required
            value={form.name}
            onChange={(name) => setForm((current) => ({ ...current, name }))}
          />
          <Field
            label="Rank"
            required
            type="number"
            value={form.rank}
            onChange={(rank) => setForm((current) => ({ ...current, rank }))}
          />
          <label className="flex items-center gap-3 pt-8 text-sm font-medium text-foreground">
            <input
              checked={form.isActive}
              className="h-4 w-4 rounded border-border"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
              type="checkbox"
            />
            Active
          </label>
          <div className="md:col-span-4">
            <Field
              label="Description"
              value={form.description}
              onChange={(description) =>
                setForm((current) => ({ ...current, description }))
              }
            />
          </div>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div>
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? "Saving..."
              : editing
                ? "Save changes"
                : "Create level"}
          </button>
        </div>
      </form>

      <DataTable
        columns={columns}
        emptyState={
          <div className="p-10 text-center text-muted">
            No employee levels have been configured yet.
          </div>
        }
        getRowKey={(level) => level.id}
        rows={levels}
        searchPlaceholder="Search employee levels"
      />
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
        min={type === "number" ? 1 : undefined}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}
