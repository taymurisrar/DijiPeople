"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ProjectRecord, ProjectStatus } from "../types";

type ProjectFormProps = {
  mode: "create" | "edit";
  project?: ProjectRecord;
};

export function ProjectForm({ mode, project }: ProjectFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: project?.name ?? "",
    code: project?.code ?? "",
    description: project?.description ?? "",
    startDate: project?.startDate?.slice(0, 10) ?? "",
    endDate: project?.endDate?.slice(0, 10) ?? "",
    status: project?.status ?? "PLANNING",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Project name is required.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(
      mode === "create" ? "/api/projects" : `/api/projects/${project?.id}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          code: form.code || undefined,
          description: form.description || undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          status: form.status,
        }),
      },
    );

    const data = (await response.json()) as { message?: string; id?: string };

    if (!response.ok) {
      setError(data.message ?? `Unable to ${mode} project.`);
      setIsSubmitting(false);
      return;
    }

    router.push(`/dashboard/projects/${project?.id ?? data.id}`);
    router.refresh();
  }

  return (
    <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2" onSubmit={handleSubmit}>
      <Field label="Project name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
      <Field label="Code" value={form.code} onChange={(value) => setForm((current) => ({ ...current, code: value }))} />
      <Field label="Start date" type="date" value={form.startDate} onChange={(value) => setForm((current) => ({ ...current, startDate: value }))} />
      <Field label="End date" type="date" value={form.endDate} onChange={(value) => setForm((current) => ({ ...current, endDate: value }))} />
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">Status</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={form.status}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              status: event.target.value as ProjectStatus,
            }))
          }
        >
          <option value="PLANNING">PLANNING</option>
          <option value="Active">Active</option>
          <option value="ON_HOLD">ON_HOLD</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </label>
      <label className="space-y-2 text-sm md:col-span-2">
        <span className="font-medium text-foreground">Description</span>
        <textarea
          className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
        />
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
          {isSubmitting ? "Saving..." : mode === "create" ? "Create project" : "Save project"}
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
