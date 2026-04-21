// app/dashboard/recruitment/_components/application-stage-form.tsx

"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { RecruitmentStage } from "../types";

type ApplicationStageFormProps = {
  applicationId: string;
  currentStage: RecruitmentStage;
};

export function ApplicationStageForm({
  applicationId,
  currentStage,
}: ApplicationStageFormProps) {
  const router = useRouter();
  const [stage, setStage] = useState<RecruitmentStage>(currentStage);
  const [notes, setNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (stage === currentStage) {
      setError("Choose a new stage to move this application.");
      return;
    }

    if (stage === "REJECTED" && !rejectionReason.trim()) {
      setError("Add a rejection reason before rejecting the application.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/applications/${applicationId}/stage`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stage,
          notes: notes.trim() || undefined,
          rejectionReason:
            stage === "REJECTED" ? rejectionReason.trim() || undefined : undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setError(data?.message ?? "Unable to move application stage.");
        setIsSubmitting(false);
        return;
      }

      router.refresh();
      setNotes("");
      setRejectionReason("");
    } catch {
      setError("Unable to move application stage.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="grid gap-3 rounded-[20px] border border-border bg-white/90 p-4"
      onSubmit={handleSubmit}
    >
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">Move to stage</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={stage}
          onChange={(event) => setStage(event.target.value as RecruitmentStage)}
        >
          <option value="APPLIED">APPLIED</option>
          <option value="SCREENING">SCREENING</option>
          <option value="SHORTLISTED">SHORTLISTED</option>
          <option value="INTERVIEW">INTERVIEW</option>
          <option value="FINAL_REVIEW">FINAL REVIEW</option>
          <option value="OFFER">OFFER</option>
          <option value="APPROVED">APPROVED</option>
          <option value="HIRED">HIRED</option>
          <option value="ON_HOLD">ON HOLD</option>
          <option value="REJECTED">REJECTED</option>
          <option value="WITHDRAWN">WITHDRAWN</option>
        </select>
      </label>

      {stage === "REJECTED" ? (
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">Rejection reason</span>
          <input
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
          />
        </label>
      ) : null}

      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">Stage note</span>
        <textarea
          className="min-h-20 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Updating..." : "Update stage"}
      </button>
    </form>
  );
}