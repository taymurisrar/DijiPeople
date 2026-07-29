"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { CandidateRecord, JobOpeningRecord } from "../types";

type ApplicationFormProps = {
  candidates: CandidateRecord[];
  jobs: JobOpeningRecord[];
};

export function ApplicationForm({ candidates, jobs }: ApplicationFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    candidateId: candidates[0]?.id ?? "",
    jobOpeningId: jobs[0]?.id ?? "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.candidateId || !form.jobOpeningId) {
      setError("Select both a candidate and a job opening.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        candidateId: form.candidateId,
        jobOpeningId: form.jobOpeningId,
      }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to submit application.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  if (candidates.length === 0 || jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted shadow-sm">
        Add at least one candidate and one job opening before creating applications.
      </div>
    );
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
      onSubmit={handleSubmit}
    >
      <label className="space-y-2 text-sm">
        <span className="text-xs font-semibold uppercase text-muted">
          Candidate
        </span>
        <select
          className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={form.candidateId}
          onChange={(event) => setForm((current) => ({ ...current, candidateId: event.target.value }))}
        >
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.fullName} - {candidate.email}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm">
        <span className="text-xs font-semibold uppercase text-muted">
          Job opening
        </span>
        <select
          className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={form.jobOpeningId}
          onChange={(event) => setForm((current) => ({ ...current, jobOpeningId: event.target.value }))}
        >
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title} {job.code ? `- ${job.code}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div>
        <Button
          disabled={isSubmitting}
          fullWidth
          loading={isSubmitting}
          loadingText="Submitting"
          size="sm"
          type="submit"
        >
          Submit application
        </Button>
      </div>
      {error ? (
        <p className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger md:col-span-3">
          {error}
        </p>
      ) : null}
    </form>
  );
}
