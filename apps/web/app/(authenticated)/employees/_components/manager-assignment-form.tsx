"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { EmployeeListItem } from "../types";
import { Button } from "@/app/components/ui/button";

type ManagerAssignmentFormProps = {
  currentReportingManagerId?: string | null;
  employeeId: string;
  managerOptions: EmployeeListItem[];
};

export function ManagerAssignmentForm({
  currentReportingManagerId,
  employeeId,
  managerOptions,
}: ManagerAssignmentFormProps) {
  const router = useRouter();
  const [reportingManagerEmployeeId, setReportingManagerEmployeeId] = useState(
    currentReportingManagerId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    const response = await fetch(`/api/employees/${employeeId}/manager`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reportingManagerEmployeeId: reportingManagerEmployeeId || null,
      }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to update reporting manager.");
      setIsSaving(false);
      return;
    }

    router.refresh();
    setIsSaving(false);
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">Reporting manager</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          name="reportingManagerEmployeeId"
          onChange={(event) =>
            setReportingManagerEmployeeId(event.target.value)
          }
          value={reportingManagerEmployeeId}
        >
          <option value="">No reporting manager assigned</option>
          {managerOptions.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.fullName} ({manager.employeeCode})
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        loading={isSaving}
        loadingText="Saving..."
        type="submit"
      >
        Save reporting manager
      </Button>
    </form>
  );
}