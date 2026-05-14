"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { generateUniqueNumberCode, sanitizeNumericCode } from "@/lib/common";
import { ProjectRecord, ProjectStatus } from "../types";
import {
  DateField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";

const PROJECT_CODE_DIGITS = 3;
const PROJECT_CODE_MAX_DIGITS = 3;

type ProjectFormProps = {
  mode: "create" | "edit";
  project?: ProjectRecord;
  existingProjectCodes?: string[];
};

export function ProjectForm({
  mode,
  project,
  existingProjectCodes = [],
}: ProjectFormProps) {
  const router = useRouter();

  const [form, setForm] = useState({
    name: project?.name ?? "",
    code:
      project?.code ??
      generateUniqueNumberCode({
        digits: PROJECT_CODE_DIGITS,
        existingValues: existingProjectCodes,
      }),
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

    const code = sanitizeNumericCode(form.code, PROJECT_CODE_MAX_DIGITS);

    if (!form.name.trim()) {
      setError("Project name is required.");
      return;
    }

    if (!code) {
      setError("Project code is required.");
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
          name: form.name.trim(),
          code,
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
    <form
      className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2"
      onSubmit={handleSubmit}
    >
      <TextField
        label="Project name"
        required
        value={form.name}
        onChange={(value) =>
          setForm((current) => ({
            ...current,
            name: value,
          }))
        }
      />

      <TextField
        label="Code"
        required
        hint="Auto generated. You can manually override it."
        value={form.code}
        maxLength={PROJECT_CODE_MAX_DIGITS}
        onChange={(value) =>
          setForm((current) => ({
            ...current,
            code: sanitizeNumericCode(value, PROJECT_CODE_MAX_DIGITS),
          }))
        }
      />

      <DateField
        label="Start date"
        value={form.startDate}
        onChange={(value) =>
          setForm((current) => ({
            ...current,
            startDate: value,
          }))
        }
      />

      <DateField
        label="End date"
        value={form.endDate}
        onChange={(value) =>
          setForm((current) => ({
            ...current,
            endDate: value,
          }))
        }
      />

      <SelectField
        label="Status"
        required
        value={form.status}
        onChange={(value) =>
          setForm((current) => ({
            ...current,
            status: value as ProjectStatus,
          }))
        }
        options={[
          { value: "DRAFT", label: "Draft" },
          { value: "PLANNING", label: "Planning" },
          { value: "ACTIVE", label: "Active" },
          { value: "ON_HOLD", label: "On Hold" },
          { value: "COMPLETED", label: "Completed" },
          { value: "CLOSED", label: "Closed" },
          { value: "CANCELLED", label: "Cancelled" },
        ]}
      />

      <TextAreaField
        className="md:col-span-2"
        label="Description"
        value={form.description}
        onChange={(value) =>
          setForm((current) => ({
            ...current,
            description: value,
          }))
        }
      />

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
          {isSubmitting
            ? "Saving..."
            : mode === "create"
              ? "Create project"
              : "Save project"}
        </button>
      </div>
    </form>
  );
}
