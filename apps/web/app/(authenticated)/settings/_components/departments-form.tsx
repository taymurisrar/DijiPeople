"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  CheckboxField,
  LookupField,
  TextAreaField,
  TextField,
  type LookupOption,
} from "@/app/components/ui/form-control";

type DepartmentsFormProps = {
  departmentId?: string;
  initialValues: {
    name: string;
    code: string;
    description: string;
    defaultWorkScheduleId: string;
    isActive: boolean;
  };
  mode: "create" | "edit";
  workSchedules: LookupOption[];
};

export function DepartmentsForm({
  departmentId,
  initialValues,
  mode,
  workSchedules,
}: DepartmentsFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Department name is required.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(
      mode === "create"
        ? "/api/departments"
        : `/api/departments/${departmentId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? `Unable to ${mode} department.`);
      setIsSubmitting(false);
      return;
    }

    router.push("/settings/departments");
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
        <TextField
          label="Department name"
          onChange={(name) => setForm((current) => ({ ...current, name }))}
          required
          value={form.name}
        />
        <TextField
          label="Code"
          onChange={(code) => setForm((current) => ({ ...current, code }))}
          value={form.code}
        />
        <TextAreaField
          className="md:col-span-2"
          label="Description"
          onChange={(description) =>
            setForm((current) => ({ ...current, description }))
          }
          value={form.description}
        />
        <LookupField
          label="Default work schedule"
          onChange={(defaultWorkScheduleId) =>
            setForm((current) => ({ ...current, defaultWorkScheduleId }))
          }
          options={workSchedules}
          placeholder="Inherit work-site or tenant default"
          value={form.defaultWorkScheduleId}
        />
        <CheckboxField
          checked={form.isActive}
          label="Active department"
          onChange={(isActive) =>
            setForm((current) => ({ ...current, isActive }))
          }
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-3">
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting
            ? "Saving..."
            : mode === "create"
              ? "Create department"
              : "Save changes"}
        </Button>
        <Button onClick={() => router.back()} type="button" variant="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
}
