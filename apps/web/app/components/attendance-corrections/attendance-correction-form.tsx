"use client";

import { Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

const correctionTypes = [
  "MISSED_CHECK_IN",
  "MISSED_CHECK_OUT",
  "LATE_CHECK_IN",
  "EARLY_CHECK_OUT",
  "ABSENCE_CORRECTION",
  "TIME_ADJUSTMENT",
  "MANUAL_CORRECTION",
];

export function AttendanceCorrectionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryId = searchParams.get("attendanceEntryId") ?? "";
  const [attendanceEntryId, setAttendanceEntryId] = useState(entryId);
  const [correctionType, setCorrectionType] = useState(correctionTypes[0]);
  const [requestedCheckInAtUtc, setRequestedCheckInAtUtc] = useState("");
  const [requestedCheckOutAtUtc, setRequestedCheckOutAtUtc] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit = useMemo(
    () =>
      reason.trim().length > 0 &&
      (requestedCheckInAtUtc.trim().length > 0 ||
        requestedCheckOutAtUtc.trim().length > 0),
    [reason, requestedCheckInAtUtc, requestedCheckOutAtUtc],
  );

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/attendance/correction-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendanceEntryId: attendanceEntryId || undefined,
          correctionType,
          requestedCheckInAtUtc: toIso(requestedCheckInAtUtc),
          requestedCheckOutAtUtc: toIso(requestedCheckOutAtUtc),
          reason,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to submit correction request.");
      }
      const id = data?.item?.id;
      router.push(id ? `/attendance/corrections/${id}` : "/attendance/corrections");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit correction request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="max-w-3xl rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="grid gap-4">
        <Field label="Attendance entry ID">
          <input
            className="input"
            onChange={(event) => setAttendanceEntryId(event.target.value)}
            placeholder="Optional for missing day corrections"
            value={attendanceEntryId}
          />
        </Field>
        <Field label="Correction type">
          <select
            className="input"
            onChange={(event) => setCorrectionType(event.target.value)}
            value={correctionType}
          >
            {correctionTypes.map((type) => (
              <option key={type} value={type}>
                {formatLabel(type)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Requested check-in">
            <input
              className="input"
              onChange={(event) => setRequestedCheckInAtUtc(event.target.value)}
              type="datetime-local"
              value={requestedCheckInAtUtc}
            />
          </Field>
          <Field label="Requested check-out">
            <input
              className="input"
              onChange={(event) => setRequestedCheckOutAtUtc(event.target.value)}
              type="datetime-local"
              value={requestedCheckOutAtUtc}
            />
          </Field>
        </div>
        <Field label="Reason">
          <textarea
            className="input min-h-28"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain what should be corrected and why."
            value={reason}
          />
        </Field>
        <button
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-accent/30 bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
          disabled={!canSubmit || isSubmitting}
          onClick={() => void submit()}
          type="button"
        >
          <Send className="h-4 w-4" />
          {isSubmitting ? "Submitting..." : "Submit request"}
        </button>
        {message ? <p className="text-sm text-red-600">{message}</p> : null}
      </div>
    </section>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
