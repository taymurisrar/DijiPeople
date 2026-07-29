"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/app/components/ui/button";

type EvaluationFormState = {
  interviewRound: string;
  interviewDate: string;
  technicalScore: string;
  communicationScore: string;
  cultureFitScore: string;
  currentSalary: string;
  expectedSalary: string;
  joiningAvailabilityDays: string;
  cityOfResidence: string;
  countryOfResidence: string;
  interests: string;
  hobbies: string;
  reasonForLeaving: string;
  interviewOutcome: string;
  overallRecommendation: string;
  concerns: string;
  followUpNotes: string;
  notes: string;
};

export function ApplicationEvaluationForm({
  applicationId,
}: {
  applicationId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<EvaluationFormState>({
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

    const validationError = validateEvaluationForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(
      `/api/applications/${applicationId}/evaluations`,
      {
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
      },
    );

    const data = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;

    if (!response.ok) {
      setError(
        humanizeEvaluationError(data?.message) ?? "Unable to save evaluation.",
      );
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4"
      onSubmit={handleSubmit}
    >
      <Field
        label="Interview round"
        type="number"
        min={1}
        max={20}
        value={form.interviewRound}
        onChange={(value) =>
          setForm((current) => ({ ...current, interviewRound: value }))
        }
      />
      <Field
        label="Interview date"
        type="date"
        value={form.interviewDate}
        onChange={(value) =>
          setForm((current) => ({ ...current, interviewDate: value }))
        }
      />
      <Field
        label="Technical score"
        type="number"
        min={0}
        max={10}
        value={form.technicalScore}
        onChange={(value) =>
          setForm((current) => ({ ...current, technicalScore: value }))
        }
      />
      <Field
        label="Communication score"
        type="number"
        min={0}
        max={10}
        value={form.communicationScore}
        onChange={(value) =>
          setForm((current) => ({ ...current, communicationScore: value }))
        }
      />
      <Field
        label="Culture fit score"
        type="number"
        min={0}
        max={10}
        value={form.cultureFitScore}
        onChange={(value) =>
          setForm((current) => ({ ...current, cultureFitScore: value }))
        }
      />
      <Field
        label="Joining availability (days)"
        type="number"
        min={0}
        max={365}
        value={form.joiningAvailabilityDays}
        onChange={(value) =>
          setForm((current) => ({ ...current, joiningAvailabilityDays: value }))
        }
      />
      <Field
        label="Current salary"
        type="number"
        min={0}
        value={form.currentSalary}
        onChange={(value) =>
          setForm((current) => ({ ...current, currentSalary: value }))
        }
      />
      <Field
        label="Expected salary"
        type="number"
        min={0}
        value={form.expectedSalary}
        onChange={(value) =>
          setForm((current) => ({ ...current, expectedSalary: value }))
        }
      />
      <Field
        label="City of residence"
        value={form.cityOfResidence}
        onChange={(value) =>
          setForm((current) => ({ ...current, cityOfResidence: value }))
        }
      />
      <Field
        label="Country of residence"
        value={form.countryOfResidence}
        onChange={(value) =>
          setForm((current) => ({ ...current, countryOfResidence: value }))
        }
      />
      <Field
        label="Interests"
        value={form.interests}
        onChange={(value) =>
          setForm((current) => ({ ...current, interests: value }))
        }
      />
      <Field
        label="Hobbies"
        value={form.hobbies}
        onChange={(value) =>
          setForm((current) => ({ ...current, hobbies: value }))
        }
      />
      <Field
        label="Interview outcome"
        value={form.interviewOutcome}
        onChange={(value) =>
          setForm((current) => ({ ...current, interviewOutcome: value }))
        }
      />
      <Field
        label="Recommendation"
        value={form.overallRecommendation}
        onChange={(value) =>
          setForm((current) => ({ ...current, overallRecommendation: value }))
        }
      />
      <TextArea
        label="Reason for leaving"
        value={form.reasonForLeaving}
        onChange={(value) =>
          setForm((current) => ({ ...current, reasonForLeaving: value }))
        }
      />
      <TextArea
        label="Concerns"
        value={form.concerns}
        onChange={(value) =>
          setForm((current) => ({ ...current, concerns: value }))
        }
      />
      <TextArea
        className="md:col-span-2"
        label="Follow-up notes"
        value={form.followUpNotes}
        onChange={(value) =>
          setForm((current) => ({ ...current, followUpNotes: value }))
        }
      />
      <TextArea
        className="md:col-span-2"
        label="Notes"
        value={form.notes}
        onChange={(value) =>
          setForm((current) => ({ ...current, notes: value }))
        }
      />
      {error ? (
        <p className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger sm:col-span-2 xl:col-span-4">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-2 xl:col-span-4">
        <Button
          disabled={isSubmitting}
          loading={isSubmitting}
          loadingText="Saving"
          size="sm"
          type="submit"
        >
          Save evaluation
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  max,
  min,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="text-xs font-semibold uppercase text-muted">
        {label}
      </span>
      <input
        className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        max={max}
        min={min}
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
      <span className="text-xs font-semibold uppercase text-muted">
        {label}
      </span>
      <textarea
        className="min-h-20 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
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

function validateEvaluationForm(form: EvaluationFormState) {
  const checks: Array<{
    label: string;
    max?: number;
    min?: number;
    value: string;
  }> = [
    {
      label: "Interview round",
      min: 1,
      max: 20,
      value: form.interviewRound,
    },
    {
      label: "Technical score",
      min: 0,
      max: 10,
      value: form.technicalScore,
    },
    {
      label: "Communication score",
      min: 0,
      max: 10,
      value: form.communicationScore,
    },
    {
      label: "Culture fit score",
      min: 0,
      max: 10,
      value: form.cultureFitScore,
    },
    {
      label: "Joining availability",
      min: 0,
      max: 365,
      value: form.joiningAvailabilityDays,
    },
    { label: "Current salary", min: 0, value: form.currentSalary },
    { label: "Expected salary", min: 0, value: form.expectedSalary },
  ];

  for (const check of checks) {
    const value = check.value.trim();
    if (!value) continue;

    const number = Number(value);
    if (!Number.isFinite(number)) {
      return `${check.label} must be a number.`;
    }

    if (
      !Number.isInteger(number) &&
      check.label !== "Current salary" &&
      check.label !== "Expected salary"
    ) {
      return `${check.label} must be a whole number.`;
    }

    if (check.min !== undefined && number < check.min) {
      return `${check.label} must be at least ${check.min}.`;
    }

    if (check.max !== undefined && number > check.max) {
      return `${check.label} must not be greater than ${check.max}.`;
    }
  }

  return null;
}

function humanizeEvaluationError(message?: string) {
  if (!message) return null;

  return message
    .replace(/\btechnicalScore\b/g, "Technical score")
    .replace(/\bcommunicationScore\b/g, "Communication score")
    .replace(/\bcultureFitScore\b/g, "Culture fit score")
    .replace(/\bjoiningAvailabilityDays\b/g, "Joining availability")
    .replace(/\binterviewRound\b/g, "Interview round")
    .replace(/\bcurrentSalary\b/g, "Current salary")
    .replace(/\bexpectedSalary\b/g, "Expected salary");
}

function toInteger(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number.parseInt(trimmed, 10) : undefined;
}

function toNumber(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : undefined;
}
