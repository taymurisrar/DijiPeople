"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { CandidateRecord } from "../../recruitment/types";
import { OnboardingTemplateRecord } from "../types";

type OnboardingStartFormProps = {
  candidates: CandidateRecord[];
  templates: OnboardingTemplateRecord[];
};

export function OnboardingStartForm({
  candidates,
  templates,
}: OnboardingStartFormProps) {
  const router = useRouter();
  const eligibleCandidates = candidates.filter((candidate) =>
    ["APPROVED", "HIRED"].includes(candidate.currentStatus),
  );
  const [form, setForm] = useState({
    candidateId: eligibleCandidates[0]?.id ?? "",
    templateId: templates.find((template) => template.isDefault)?.id ?? templates[0]?.id ?? "",
    plannedJoiningDate: new Date().toISOString().slice(0, 10),
    workEmail: "",
    title: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.candidateId) {
      setError("Select a hired candidate first.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        candidateId: form.candidateId,
        templateId: form.templateId || undefined,
        title: form.title || undefined,
        plannedJoiningDate: form.plannedJoiningDate || undefined,
        workEmail: form.workEmail || undefined,
      }),
    });

    const data = (await response.json()) as { id?: string; message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to start onboarding.");
      setIsSubmitting(false);
      return;
    }

    router.push(`/dashboard/onboarding/${data.id}`);
    router.refresh();
  }

  if (eligibleCandidates.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted shadow-sm">
        Move a candidate to the `APPROVED` or `HIRED` stage in recruitment before starting onboarding.
      </div>
    );
  }

  return (
    <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2" onSubmit={handleSubmit}>
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">Hired candidate</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={form.candidateId}
          onChange={(event) => setForm((current) => ({ ...current, candidateId: event.target.value }))}
        >
          {eligibleCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.fullName} - {candidate.email}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">Template</span>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={form.templateId}
          onChange={(event) => setForm((current) => ({ ...current, templateId: event.target.value }))}
        >
          <option value="">No template</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <Field label="Onboarding title" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
      <Field label="Planned joining date" type="date" value={form.plannedJoiningDate} onChange={(value) => setForm((current) => ({ ...current, plannedJoiningDate: value }))} />
      <Field label="Target work email" type="email" value={form.workEmail} onChange={(value) => setForm((current) => ({ ...current, workEmail: value }))} />
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
          {isSubmitting ? "Starting..." : "Start onboarding"}
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
