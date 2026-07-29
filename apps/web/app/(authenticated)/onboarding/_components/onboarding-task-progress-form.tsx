"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  DateField,
  SelectField,
  TextAreaField,
} from "@/app/components/ui/form-control";
import { OnboardingTaskStatus } from "../types";

type OnboardingTaskProgressFormProps = {
  onboardingId: string;
  userOptions: Array<{ value: string; label: string }>;
  task: {
    id: string;
    assignedUserId?: string | null;
    dueDate?: string | null;
    notes?: string | null;
    status: OnboardingTaskStatus;
    title: string;
  };
};

export function OnboardingTaskProgressForm({
  onboardingId,
  userOptions,
  task,
}: OnboardingTaskProgressFormProps) {
  const router = useRouter();
  const [assignedUserId, setAssignedUserId] = useState(
    task.assignedUserId ?? "",
  );
  const [dueDate, setDueDate] = useState(toDateInputValue(task.dueDate));
  const [status, setStatus] = useState<OnboardingTaskStatus>(task.status);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(
      `/api/onboarding/${onboardingId}/tasks/${task.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignedUserId: assignedUserId || null,
          dueDate: dueDate || null,
          status,
          notes: notes || undefined,
        }),
      },
    );

    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? "Unable to update onboarding task.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <div className="grid gap-3">
      <SelectField
        label="Assigned to"
        placeholder="Unassigned"
        options={userOptions}
        disabled={isSubmitting}
        value={assignedUserId}
        onChange={setAssignedUserId}
      />
      <DateField
        label="Due date"
        disabled={isSubmitting}
        value={dueDate}
        onChange={setDueDate}
      />
      <SelectField
        label="Task status"
        options={[
          { value: "PENDING", label: "Pending" },
          { value: "IN_PROGRESS", label: "In progress" },
          { value: "COMPLETED", label: "Completed" },
          { value: "CANCELLED", label: "Cancelled" },
        ]}
        disabled={isSubmitting}
        value={status}
        onChange={(value) => setStatus(value as OnboardingTaskStatus)}
      />
      <TextAreaField
        label="Note"
        placeholder="Add a short update"
        value={notes}
        onChange={setNotes}
        disabled={isSubmitting}
        rows={3}
      />
      <Button
        loading={isSubmitting}
        loadingText="Saving..."
        onClick={handleSave}
        type="button"
        variant="secondary"
      >
        Save task
      </Button>
      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
