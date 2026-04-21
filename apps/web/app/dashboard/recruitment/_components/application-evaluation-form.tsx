"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ApplicationEvaluationForm({
  applicationId,
}: {
  applicationId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    interviewRound: "1",
    interviewDate: "",
    technicalScore: "",
    communicationScore: "",
    cultureFitScore: "",
    currentSalary: "",
    expectedSalary: "",
    joiningAvailabilityDays: "",
    cityOfResidence: "",
    countryOfResidence: "",
    interests: "",
    hobbies: "",
    reasonForLeaving: "",
    interviewOutcome: "",
    overallRecommendation: "",
    concerns: "",
    followUpNotes: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/applications/${applicationId}/evaluations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interviewRound: toInteger(form.interviewRound),
        interviewDate: emptyToUndefined(form.interviewDate),
        technicalScore: toInteger(form.technicalScore),
        communicationScore: toInteger(form.communicationScore),
        cultureFitScore: toInteger(form.cultureFitScore),
        currentSalary: toNumber(form.currentSalary),
        expectedSalary: toNumber(form.expectedSalary),
        joiningAvailabilityDays: toInteger(form.joiningAvailabilityDays),
        cityOfResidence: emptyToUndefined(form.cityOfResidence),
        countryOfResidence: emptyToUndefined(form.countryOfResidence),
        interests: emptyToUndefined(form.interests),
        hobbies: emptyToUndefined(form.hobbies),
        reasonForLeaving: emptyToUndefined(form.reasonForLeaving),
        interviewOutcome: emptyToUndefined(form.interviewOutcome),
        overallRecommendation: emptyToUndefined(form.overallRecommendation),
        concerns: emptyToUndefined(form.concerns),
        followUpNotes: emptyToUndefined(form.followUpNotes),
        notes: emptyToUndefined(form.notes),
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? "Unable to save evaluation.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <form
      className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm grid-cols-4"
      onSubmit={handleSubmit}
    >
      <Field label="Interview round" type="number" value={form.interviewRound} onChange={(value) => setForm((current) => ({ ...current, interviewRound: value }))} />
      <Field label="Interview date" type="date" value={form.interviewDate} onChange={(value) => setForm((current) => ({ ...current, interviewDate: value }))} />
      <Field label="Technical score" type="number" value={form.technicalScore} onChange={(value) => setForm((current) => ({ ...current, technicalScore: value }))} />
      <Field label="Communication score" type="number" value={form.communicationScore} onChange={(value) => setForm((current) => ({ ...current, communicationScore: value }))} />
      <Field label="Culture fit score" type="number" value={form.cultureFitScore} onChange={(value) => setForm((current) => ({ ...current, cultureFitScore: value }))} />
      <Field label="Joining availability (days)" type="number" value={form.joiningAvailabilityDays} onChange={(value) => setForm((current) => ({ ...current, joiningAvailabilityDays: value }))} />
      <Field label="Current salary" type="number" value={form.currentSalary} onChange={(value) => setForm((current) => ({ ...current, currentSalary: value }))} />
      <Field label="Expected salary" type="number" value={form.expectedSalary} onChange={(value) => setForm((current) => ({ ...current, expectedSalary: value }))} />
      <Field label="City of residence" value={form.cityOfResidence} onChange={(value) => setForm((current) => ({ ...current, cityOfResidence: value }))} />
      <Field label="Country of residence" value={form.countryOfResidence} onChange={(value) => setForm((current) => ({ ...current, countryOfResidence: value }))} />
      <Field label="Interests" value={form.interests} onChange={(value) => setForm((current) => ({ ...current, interests: value }))} />
      <Field label="Hobbies" value={form.hobbies} onChange={(value) => setForm((current) => ({ ...current, hobbies: value }))} />
      <Field label="Interview outcome" value={form.interviewOutcome} onChange={(value) => setForm((current) => ({ ...current, interviewOutcome: value }))} />
      <Field label="Recommendation" value={form.overallRecommendation} onChange={(value) => setForm((current) => ({ ...current, overallRecommendation: value }))} />
      <TextArea label="Reason for leaving" value={form.reasonForLeaving} onChange={(value) => setForm((current) => ({ ...current, reasonForLeaving: value }))} />
      <TextArea label="Concerns" value={form.concerns} onChange={(value) => setForm((current) => ({ ...current, concerns: value }))} />
      <TextArea className="md:col-span-2" label="Follow-up notes" value={form.followUpNotes} onChange={(value) => setForm((current) => ({ ...current, followUpNotes: value }))} />
      <TextArea className="md:col-span-2" label="Notes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
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
          {isSubmitting ? "Saving..." : "Save evaluation"}
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

function TextArea({
  className = "",
  label,
  onChange,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={`space-y-2 text-sm ${className}`}>
      <span className="font-medium text-foreground">{label}</span>
      <textarea
        className="min-h-24 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toInteger(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number.parseInt(trimmed, 10) : undefined;
}

function toNumber(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : undefined;
}
