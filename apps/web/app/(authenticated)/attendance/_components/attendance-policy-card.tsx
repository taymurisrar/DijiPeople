"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type {
  AttendancePolicyRecord,
  AttendancePolicyUpdate,
} from "../types";

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

    /*
     * Only the fields the API accepts, listed explicitly.
     *
     * The card used to post the whole form back, which is the object
     * `GET /attendance/policy` returned - the RESOLVED policy. That shape also
     * carries `allowedModes`, `locationRetryAttempts` and
     * `standardWorkHoursPerDay`, none of which the update DTO declares, and the
     * global ValidationPipe runs with `forbidNonWhitelisted`. Every save on
     * this screen was therefore rejected with a 400 naming a field the
     * administrator never touched.
     */
    const payload: AttendancePolicyUpdate = {
      lateCheckInGraceMinutes: form.lateCheckInGraceMinutes,
      lateCheckOutGraceMinutes: form.lateCheckOutGraceMinutes,
      requireOfficeLocationForOfficeMode:
        form.requireOfficeLocationForOfficeMode,
      allowManualAdjustments: form.allowManualAdjustments,
      preventDuplicateAttendance: form.preventDuplicateAttendance,
      allowCheckInOnApprovedLeave: form.allowCheckInOnApprovedLeave,
      markMissingCheckout: form.markMissingCheckout,
      allowOffDayCheckIn: form.allowOffDayCheckIn,
      allowHolidayCheckIn: form.allowHolidayCheckIn,
    };

    const response = await fetch("/api/attendance/policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseBody = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(responseBody.message ?? "Unable to update attendance policy.");
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
        {/*
          "Require remote location for remote mode" and "Allow remote
          attendance without captured location" used to sit here. Both were
          removed: device location capture is mandatory for every self-service
          mode, so neither control could ever change what the engine does, and
          the two columns behind them were never read.
        */}
        <CheckboxField
          checked={form.allowManualAdjustments}
          label="Allow manual attendance adjustments"
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              allowManualAdjustments: checked,
            }))
          }
        />
        <CheckboxField
          checked={form.preventDuplicateAttendance}
          label="Prevent duplicate attendance on the same day"
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              preventDuplicateAttendance: checked,
            }))
          }
        />
        <CheckboxField
          checked={form.allowCheckInOnApprovedLeave}
          label="Allow check-in during approved leave"
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              allowCheckInOnApprovedLeave: checked,
            }))
          }
        />
        <CheckboxField
          checked={form.markMissingCheckout}
          label="Mark a missing check-out"
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              markMissingCheckout: checked,
            }))
          }
        />
        {/*
          These two live here, not in Settings > Attendance. They are
          `AttendancePolicy` columns with no tenant-settings catalog key, so the
          settings page could render them but never save them: touching either
          one there failed the whole submission with "Unsupported setting key"
          and discarded every other unsaved change with it (BUG-1978).
        */}
        <CheckboxField
          checked={form.allowOffDayCheckIn}
          label="Allow off-day check-in"
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              allowOffDayCheckIn: checked,
            }))
          }
        />
        <CheckboxField
          checked={form.allowHolidayCheckIn}
          label="Allow holiday check-in"
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              allowHolidayCheckIn: checked,
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
