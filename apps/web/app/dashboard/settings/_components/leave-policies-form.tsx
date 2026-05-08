"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  CheckboxField,
  TextField,
} from "@/app/components/ui/form-control";

type LeavePoliciesFormProps = {
  initialValues: {
    name: string;
    isActive: boolean;
  };
  leavePolicyId?: string;
  mode: "create" | "edit";
};

export function LeavePoliciesForm({
  initialValues,
  leavePolicyId,
  mode,
}: LeavePoliciesFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();

    if (!name) {
      setError("Policy name is required.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(
      mode === "create"
        ? "/api/leave-policies"
        : `/api/leave-policies/${leavePolicyId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          isActive: form.isActive,
        }),
      },
    );

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? `Unable to ${mode} leave policy.`);
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard/settings/leave-policies");
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="border-b border-border pb-5">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Leave Policy Details
          </p>

          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            {mode === "create" ? "Create policy" : "Update policy"}
          </h3>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Define the policy container. Entitlements, accruals, carry forward,
            restrictions, and paid/unpaid behavior are configured separately as
            policy rules.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TextField
            label="Policy name"
            required
            value={form.name}
            placeholder="Qatar Standard Leave Policy"
            onChange={(name) =>
              setForm((current) => ({
                ...current,
                name,
              }))
            }
          />

          <CheckboxField
            className="md:mt-7"
            label="Active leave policy"
            hint="Inactive policies should not be assigned to employees."
            checked={form.isActive}
            onChange={(isActive) =>
              setForm((current) => ({
                ...current,
                isActive,
              }))
            }
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting
            ? "Saving..."
            : mode === "create"
              ? "Create leave policy"
              : "Save changes"}
        </button>

        <button
          className="rounded-2xl border border-border bg-white px-5 py-3 text-sm font-medium text-muted transition hover:bg-slate-50 disabled:opacity-70"
          disabled={isSubmitting}
          onClick={() => router.back()}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}