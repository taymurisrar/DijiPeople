"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
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
    notes: "",
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
        notes: form.notes || undefined,
      }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to submit application.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setForm((current) => ({ ...current, notes: "" }));
    setIsSubmitting(false);
  }

  if (candidates.length === 0 || jobs.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted shadow-sm">
        Add at least one candidate and one job opening before creating applications.
      </div>
    );
  }

  return (
    <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2" onSubmit={handleSubmit}>
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">Candidate</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
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
        <span className="font-medium text-foreground">Job opening</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
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
      <label className="space-y-2 text-sm md:col-span-2">
        <span className="font-medium text-foreground">Notes</span>
        <textarea
          className="min-h-24 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
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
          {isSubmitting ? "Submitting..." : "Submit application"}
        </button>
      </div>
    </form>
  );
}
