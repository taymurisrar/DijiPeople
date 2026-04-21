"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  JobOpeningMatchCriteria,
  JobOpeningRecord,
  JobOpeningStatus,
} from "../types";

type JobOpeningWithMatchCriteria = JobOpeningRecord & {
  matchCriteria?: JobOpeningMatchCriteria | null;
};

type JobOpeningFormProps = {
  mode: "create" | "edit";
  jobOpening?: JobOpeningWithMatchCriteria;
};

const EDUCATION_OPTIONS = [
  "High School",
  "Diploma",
  "Bachelor's",
  "Master's",
  "MPhil",
  "PhD",
];

const WORK_MODE_OPTIONS = ["Onsite", "Hybrid", "Remote"];

export function JobOpeningForm({ mode, jobOpening }: JobOpeningFormProps) {
  const router = useRouter();

  const [form, setForm] = useState({
    title: jobOpening?.title ?? "",
    code: jobOpening?.code ?? "",
    description: jobOpening?.description ?? "",
    status: jobOpening?.status ?? "DRAFT",
    requiredSkills: jobOpening?.matchCriteria?.requiredSkills?.join(", ") ?? "",
    preferredSkills: jobOpening?.matchCriteria?.preferredSkills?.join(", ") ?? "",
    minimumYearsExperience:
      jobOpening?.matchCriteria?.minimumYearsExperience?.toString() ?? "",
    educationLevels: jobOpening?.matchCriteria?.educationLevels ?? [],
    allowedWorkModes: jobOpening?.matchCriteria?.allowedWorkModes ?? [],
    allowedLocations:
      jobOpening?.matchCriteria?.allowedLocations?.join(", ") ?? "",
    noticePeriodDays:
      jobOpening?.matchCriteria?.noticePeriodDays?.toString() ?? "",
    weights: {
      skillMatch: jobOpening?.matchCriteria?.weights?.skillMatch ?? 40,
      experienceFit: jobOpening?.matchCriteria?.weights?.experienceFit ?? 20,
      educationFit: jobOpening?.matchCriteria?.weights?.educationFit ?? 10,
      locationFit: jobOpening?.matchCriteria?.weights?.locationFit ?? 15,
      availabilityFit: jobOpening?.matchCriteria?.weights?.availabilityFit ?? 15,
    },
    knockoutRules: {
      requireAllMandatorySkills:
        jobOpening?.matchCriteria?.knockoutRules?.requireAllMandatorySkills ??
        false,
      rejectIfExperienceBelowMinimum:
        jobOpening?.matchCriteria?.knockoutRules
          ?.rejectIfExperienceBelowMinimum ?? false,
      rejectIfWorkModeMismatch:
        jobOpening?.matchCriteria?.knockoutRules?.rejectIfWorkModeMismatch ??
        false,
      rejectIfLocationMismatch:
        jobOpening?.matchCriteria?.knockoutRules?.rejectIfLocationMismatch ??
        false,
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedRequiredSkills = useMemo(
    () => parseCommaSeparatedList(form.requiredSkills),
    [form.requiredSkills],
  );

  const parsedPreferredSkills = useMemo(
    () => parseCommaSeparatedList(form.preferredSkills),
    [form.preferredSkills],
  );

  const parsedAllowedLocations = useMemo(
    () => parseCommaSeparatedList(form.allowedLocations),
    [form.allowedLocations],
  );

  const totalWeight = useMemo(
    () =>
      form.weights.skillMatch +
      form.weights.experienceFit +
      form.weights.educationFit +
      form.weights.locationFit +
      form.weights.availabilityFit,
    [form.weights],
  );

  const isScoringConfigured =
    parsedRequiredSkills.length > 0 ||
    parsedPreferredSkills.length > 0 ||
    form.minimumYearsExperience.trim().length > 0 ||
    form.educationLevels.length > 0 ||
    form.allowedWorkModes.length > 0 ||
    parsedAllowedLocations.length > 0 ||
    form.noticePeriodDays.trim().length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      setError("Job title is required.");
      return;
    }

    if (isScoringConfigured && totalWeight !== 100) {
      setError("Scoring weights must total 100 when match criteria is configured.");
      return;
    }

    setIsSubmitting(true);

    try {
      const minimumYearsExperience = parseOptionalNumber(
        form.minimumYearsExperience,
      );
      const noticePeriodDays = parseOptionalInteger(form.noticePeriodDays);
      const hasAnyKnockoutRule = Object.values(form.knockoutRules).some(Boolean);
      const matchCriteriaPayload: JobOpeningMatchCriteria | null =
        isScoringConfigured
          ? {
              requiredSkills: parsedRequiredSkills,
              preferredSkills: parsedPreferredSkills,
              minimumYearsExperience,
              educationLevels: form.educationLevels,
              allowedWorkModes: form.allowedWorkModes,
              allowedLocations: parsedAllowedLocations,
              noticePeriodDays,
              weights: form.weights,
              knockoutRules: hasAnyKnockoutRule ? form.knockoutRules : undefined,
            }
          : null;

      const response = await fetch(
        mode === "create"
          ? "/api/job-openings"
          : `/api/job-openings/${jobOpening?.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: form.title.trim(),
            code: form.code.trim() || undefined,
            description: form.description.trim() || undefined,
            status: form.status,
            matchCriteria: matchCriteriaPayload,
          }),
        },
      );

      const data = (await response.json()) as { id?: string; message?: string };

      if (!response.ok) {
        setError(data.message ?? `Unable to ${mode} job opening.`);
        setIsSubmitting(false);
        return;
      }

      router.push(`/dashboard/recruitment/jobs/${jobOpening?.id ?? data.id}`);
      router.refresh();
    } catch {
      setError("Something went wrong while saving the job opening.");
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="grid gap-6 rounded-[28px] border border-border bg-surface p-6 shadow-sm lg:p-7"
      onSubmit={handleSubmit}
    >
      <section className="grid gap-4 md:grid-cols-2">
        <SectionHeading
          eyebrow="Opening details"
          title="Basic information"
          description="Set the role identity and publishing status first."
        />
        <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
          <Field
            label="Job title"
            placeholder="Senior CRM Functional Consultant"
            value={form.title}
            onChange={(value) =>
              setForm((current) => ({ ...current, title: value }))
            }
          />
          <Field
            label="Code"
            placeholder="CRM-001"
            value={form.code}
            onChange={(value) =>
              setForm((current) => ({ ...current, code: value }))
            }
          />
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Status</span>
            <select
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as JobOpeningStatus,
                }))
              }
            >
              <option value="DRAFT">DRAFT</option>
              <option value="OPEN">OPEN</option>
              <option value="ON_HOLD">ON_HOLD</option>
              <option value="CLOSED">CLOSED</option>
              <option value="FILLED">FILLED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </label>
          <div className="rounded-[20px] border border-border bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Scoring status
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {isScoringConfigured ? "Configured" : "Not configured"}
            </p>
            <p className="mt-1 text-sm text-muted">
              Candidate scores only make sense when hiring criteria is defined.
            </p>
          </div>
          <label className="space-y-2 text-sm md:col-span-2">
            <span className="font-medium text-foreground">Description</span>
            <textarea
              className="min-h-32 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Describe the role, responsibilities, and business context."
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionHeading
          eyebrow="Hiring criteria"
          title="What defines a good match"
          description="These fields drive candidate scoring and ranking for this opening."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Required skills"
            placeholder="Dynamics 365, Power Platform, JavaScript, SQL"
            value={form.requiredSkills}
            onChange={(value) =>
              setForm((current) => ({ ...current, requiredSkills: value }))
            }
            hint="Comma separated. These are mandatory or high-priority skills."
          />

          <Field
            label="Preferred skills"
            placeholder="Azure, SSIS, React, Banking domain"
            value={form.preferredSkills}
            onChange={(value) =>
              setForm((current) => ({ ...current, preferredSkills: value }))
            }
            hint="Comma separated. These improve fit but are not mandatory."
          />

          <Field
            label="Minimum experience (years)"
            placeholder="3"
            inputMode="decimal"
            value={form.minimumYearsExperience}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                minimumYearsExperience: value,
              }))
            }
          />

          <Field
            label="Allowed locations"
            placeholder="Doha, Lahore, Karachi"
            value={form.allowedLocations}
            onChange={(value) =>
              setForm((current) => ({ ...current, allowedLocations: value }))
            }
            hint="Comma separated. Leave blank if location should not affect scoring."
          />

          <Field
            label="Notice period (days)"
            placeholder="30"
            inputMode="numeric"
            value={form.noticePeriodDays}
            onChange={(value) =>
              setForm((current) => ({ ...current, noticePeriodDays: value }))
            }
          />

          <MultiSelectCard
            label="Allowed work modes"
            options={WORK_MODE_OPTIONS}
            selectedValues={form.allowedWorkModes}
            onToggle={(value) =>
              setForm((current) => ({
                ...current,
                allowedWorkModes: toggleValue(current.allowedWorkModes, value),
              }))
            }
          />

          <div className="md:col-span-2">
            <MultiSelectCard
              label="Education levels"
              options={EDUCATION_OPTIONS}
              selectedValues={form.educationLevels}
              onToggle={(value) =>
                setForm((current) => ({
                  ...current,
                  educationLevels: toggleValue(current.educationLevels, value),
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionHeading
          eyebrow="Scoring weights"
          title="How the score is calculated"
          description="These weights should add up to 100%."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <WeightField
            label="Skill fit"
            value={form.weights.skillMatch}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                weights: { ...current.weights, skillMatch: value },
              }))
            }
          />
          <WeightField
            label="Experience fit"
            value={form.weights.experienceFit}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                weights: { ...current.weights, experienceFit: value },
              }))
            }
          />
          <WeightField
            label="Education fit"
            value={form.weights.educationFit}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                weights: { ...current.weights, educationFit: value },
              }))
            }
          />
          <WeightField
            label="Location fit"
            value={form.weights.locationFit}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                weights: { ...current.weights, locationFit: value },
              }))
            }
          />
          <WeightField
            label="Availability fit"
            value={form.weights.availabilityFit}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                weights: { ...current.weights, availabilityFit: value },
              }))
            }
          />
        </div>

        <div className="rounded-[20px] border border-border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted">
                Total weight
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {totalWeight}%
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                totalWeight === 100
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {totalWeight === 100 ? "Balanced" : "Needs adjustment"}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionHeading
          eyebrow="Rules"
          title="Knockout conditions"
          description="Use these when certain mismatches should strongly affect or block candidate fit."
        />

        <div className="grid gap-3 md:grid-cols-2">
          <CheckboxCard
            label="Require all mandatory skills"
            description="Candidates must satisfy the required skills list."
            checked={form.knockoutRules.requireAllMandatorySkills}
            onChange={(checked) =>
              setForm((current) => ({
                ...current,
                knockoutRules: {
                  ...current.knockoutRules,
                  requireAllMandatorySkills: checked,
                },
              }))
            }
          />
          <CheckboxCard
            label="Reject if experience is below minimum"
            description="Strictly enforce minimum years of experience."
            checked={form.knockoutRules.rejectIfExperienceBelowMinimum}
            onChange={(checked) =>
              setForm((current) => ({
                ...current,
                knockoutRules: {
                  ...current.knockoutRules,
                  rejectIfExperienceBelowMinimum: checked,
                },
              }))
            }
          />
          <CheckboxCard
            label="Reject if work mode mismatches"
            description="Reject candidates whose preference conflicts with the role setup."
            checked={form.knockoutRules.rejectIfWorkModeMismatch}
            onChange={(checked) =>
              setForm((current) => ({
                ...current,
                knockoutRules: {
                  ...current.knockoutRules,
                  rejectIfWorkModeMismatch: checked,
                },
              }))
            }
          />
          <CheckboxCard
            label="Reject if location mismatches"
            description="Reject candidates outside the preferred hiring geography."
            checked={form.knockoutRules.rejectIfLocationMismatch}
            onChange={(checked) =>
              setForm((current) => ({
                ...current,
                knockoutRules: {
                  ...current.knockoutRules,
                  rejectIfLocationMismatch: checked,
                },
              }))
            }
          />
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting
            ? "Saving..."
            : mode === "create"
              ? "Create job opening"
              : "Save job opening"}
        </button>

        <p className="text-sm text-muted">
          Scores on applications should only be shown when this opening has
          usable match criteria configured.
        </p>
      </div>
    </form>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        {eyebrow}
      </p>
      <h3 className="text-2xl font-semibold text-foreground">{title}</h3>
      <p className="max-w-3xl text-sm text-muted">{description}</p>
    </div>
  );
}

function Field({
  label,
  onChange,
  value,
  placeholder,
  hint,
  inputMode,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
  placeholder?: string;
  hint?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </label>
  );
}

function WeightField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2 rounded-[20px] border border-border bg-white p-4 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-surface px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        inputMode="numeric"
        value={value}
        onChange={(event) =>
          onChange(clampNumber(parseNumberOrZero(event.target.value), 0, 100))
        }
      />
      <p className="text-xs text-muted">Percentage weight</p>
    </label>
  );
}

function CheckboxCard({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-[20px] border border-border bg-white p-4">
      <input
        checked={checked}
        className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
    </label>
  );
}

function MultiSelectCard({
  label,
  onToggle,
  options,
  selectedValues,
}: {
  label: string;
  onToggle: (value: string) => void;
  options: string[];
  selectedValues: string[];
}) {
  return (
    <div className="space-y-3 rounded-[20px] border border-border bg-white p-4">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValues.includes(option);

          return (
            <button
              key={option}
              className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                selected
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-surface text-foreground hover:border-accent/30 hover:text-accent"
              }`}
              type="button"
              onClick={() => onToggle(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

function parseNumberOrZero(value: string): number {
  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsedValue = Number(trimmed);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseOptionalInteger(value: string): number | null {
  const parsedValue = parseOptionalNumber(value);
  return parsedValue === null ? null : Math.round(parsedValue);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
