"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { AttendancePolicyRecord } from "../types";

export function AttendancePolicyCard({
  initialPolicy,
}: {
  initialPolicy: AttendancePolicyRecord;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialPolicy);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const response = await fetch("/api/attendance/policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(payload.message ?? "Unable to update attendance policy.");
      setIsSubmitting(false);
      return;
    }

    setMessage("Attendance policy updated.");
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Attendance policy
      </p>
      <h4 className="mt-2 text-2xl font-semibold text-foreground">
        Module settings and grace rules
      </h4>

      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <Field
          label="Late check-in grace (minutes)"
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              lateCheckInGraceMinutes: Number(value),
            }))
          }
          type="number"
          value={String(form.lateCheckInGraceMinutes)}
        />
        <Field
          label="Late check-out grace (minutes)"
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              lateCheckOutGraceMinutes: Number(value),
            }))
          }
          type="number"
          value={String(form.lateCheckOutGraceMinutes)}
        />
        <CheckboxField
          checked={form.requireOfficeLocationForOfficeMode}
          label="Require office location for office mode"
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              requireOfficeLocationForOfficeMode: checked,
            }))
          }
        />
        <CheckboxField
          checked={form.requireRemoteLocationForRemoteMode}
          label="Require remote location for remote mode"
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              requireRemoteLocationForRemoteMode: checked,
            }))
          }
        />
        <CheckboxField
          checked={form.allowRemoteWithoutLocation}
          label="Allow remote attendance without captured location"
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              allowRemoteWithoutLocation: checked,
            }))
          }
        />

        <div className="md:col-span-2">
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Saving..." : "Save policy"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!error && message ? (
        <p className="mt-4 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function Field({
  label,
  onChange,
  type,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function CheckboxField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}
