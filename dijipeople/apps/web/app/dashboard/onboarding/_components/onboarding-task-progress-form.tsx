"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OnboardingTaskStatus } from "../types";

type OnboardingTaskProgressFormProps = {
  onboardingId: string;
  task: {
    id: string;
    status: OnboardingTaskStatus;
    title: string;
  };
};

export function OnboardingTaskProgressForm({
  onboardingId,
  task,
}: OnboardingTaskProgressFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingTaskStatus>(task.status);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(nextStatus: OnboardingTaskStatus) {
    setError(null);
    setStatus(nextStatus);
    setIsSubmitting(true);

    const response = await fetch(`/api/onboarding/${onboardingId}/tasks/${task.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: nextStatus,
        notes: notes || undefined,
      }),
    });

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
      <select
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        disabled={isSubmitting}
        value={status}
        onChange={(event) => handleChange(event.target.value as OnboardingTaskStatus)}
      >
        <option value="PENDING">PENDING</option>
        <option value="IN_PROGRESS">IN PROGRESS</option>
        <option value="COMPLETED">COMPLETED</option>
        <option value="CANCELLED">CANCELLED</option>
      </select>
      <textarea
        className="min-h-20 w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        placeholder="Task note"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
