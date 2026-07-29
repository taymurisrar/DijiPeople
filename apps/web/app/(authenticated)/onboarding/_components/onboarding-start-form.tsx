"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  CheckboxField,
  DateField,
  SelectField,
  TextField,
} from "@/app/components/ui/form-control";
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
    createEmployee: true,
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
        createEmployee: form.createEmployee,
      }),
    });

    const data = (await response.json()) as { id?: string; message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to start onboarding.");
      setIsSubmitting(false);
      return;
    }

    router.push(`/onboarding/${data.id}`);
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
      <SelectField
        label="Hired candidate"
        required
        options={eligibleCandidates.map((candidate) => ({
          value: candidate.id,
          label: `${candidate.fullName} - ${candidate.email}`,
        }))}
        value={form.candidateId}
        onChange={(value) =>
          setForm((current) => ({ ...current, candidateId: value }))
        }
      />
      <SelectField
        label="Template"
        hint="Templates add a predefined checklist. Standard, executive, and remote templates are available by default."
        options={templates.map((template) => ({
          value: template.id,
          label: template.isDefault ? `${template.name} (Default)` : template.name,
        }))}
        placeholder="No template"
        value={form.templateId}
        onChange={(value) =>
          setForm((current) => ({ ...current, templateId: value }))
        }
      />
      <TextField
        label="Onboarding title"
        value={form.title}
        onChange={(value) => setForm((current) => ({ ...current, title: value }))}
      />
      <DateField
        label="Planned joining date"
        value={form.plannedJoiningDate}
        onChange={(value) =>
          setForm((current) => ({ ...current, plannedJoiningDate: value }))
        }
      />
      <TextField
        label="Target work email"
        type="email"
        value={form.workEmail}
        onChange={(value) =>
          setForm((current) => ({ ...current, workEmail: value }))
        }
      />
      <CheckboxField
        className="self-end rounded-2xl border border-border bg-white px-4 py-3"
        label="Create draft employee profile"
        hint="Creates a draft profile so HR can complete department, designation, manager, and joining details before activation."
        checked={form.createEmployee}
        onChange={(checked) =>
          setForm((current) => ({ ...current, createEmployee: checked }))
        }
      />
      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger md:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="md:col-span-2">
        <Button
          loading={isSubmitting}
          loadingText="Starting..."
          type="submit"
        >
          Start onboarding
        </Button>
      </div>
    </form>
  );
}
