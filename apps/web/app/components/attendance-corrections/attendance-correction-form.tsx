"use client";

import { Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  CORRECTION_TYPE_OPTIONS,
  MAX_OVERTIME_MINUTES,
  REQUESTABLE_WORK_MODES,
  hasRequestedChange,
  originalsOf,
  seedDraftFromEntry,
  showsField,
  toLocalDateTimeInput,
  validateDraft,
  workModeLabel,
  type AttendanceEntrySeed,
  type CorrectionDraft,
  type CorrectionField,
  type CorrectionType,
} from "./correction-form-fields";

/**
 * The employee's correction request form.
 *
 * ONLY WHAT THE CHOSEN TYPE NEEDS IS SHOWN. Every field carries a question, and
 * asking someone reporting a forgotten check-out for overtime minutes is how a
 * form gets abandoned. Which fields belong to which type — and what makes a
 * request valid — lives in `correction-form-fields`, a pure module the test suite
 * asserts directly.
 *
 * Type selection is phrased as the employee's own situation ("I forgot to check
 * in") rather than as the enum, because the person filling this in is describing
 * what happened to them, not classifying a record.
 */
export function AttendanceCorrectionForm({
  workSites = [],
  entry,
  onCancel,
  onSubmitted,
}: {
  /** Sites the employee may name. Empty renders a free-text-free selector. */
  workSites?: ReadonlyArray<{ id: string; name: string }>;
  /**
   * The record being corrected.
   *
   * When present the form opens showing what that record already says, the
   * record id stops being something the employee types, and the submit control
   * moves to the top — this is the panel the record page opens in place, and
   * the person using it is editing, not filling in a form about a day they have
   * to remember. Absent, the form behaves exactly as it always has, which is
   * the path a wholly missing day still needs.
   */
  entry?: AttendanceEntrySeed;
  onCancel?: () => void;
  onSubmitted?: (requestId: string | null) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const seed = entry ? seedDraftFromEntry(entry) : null;
  const originals = entry ? originalsOf(entry) : null;

  const [attendanceEntryId, setAttendanceEntryId] = useState(
    entry?.id ?? searchParams.get("attendanceEntryId") ?? "",
  );
  const [correctionType, setCorrectionType] = useState<CorrectionType>(
    seed?.correctionType ??
      (searchParams.get("correctionType") as CorrectionType) ??
      "MISSED_CHECK_OUT",
  );
  const [attendanceDate, setAttendanceDate] = useState(
    seed?.attendanceDate ?? searchParams.get("attendanceDate") ?? "",
  );
  const [requestedCheckInAtUtc, setRequestedCheckInAtUtc] = useState(
    seed?.requestedCheckInAtUtc ?? "",
  );
  const [requestedCheckOutAtUtc, setRequestedCheckOutAtUtc] = useState(
    seed?.requestedCheckOutAtUtc ?? "",
  );
  const [requestedWorkMode, setRequestedWorkMode] = useState(
    seed?.requestedWorkMode ?? "",
  );
  const [requestedWorkSiteId, setRequestedWorkSiteId] = useState(
    seed?.requestedWorkSiteId ?? "",
  );
  const [requestedOvertimeMinutes, setRequestedOvertimeMinutes] = useState("");
  const [fallbackReason, setFallbackReason] = useState("");
  const [reason, setReason] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const draft: CorrectionDraft = {
    correctionType,
    attendanceDate,
    requestedCheckInAtUtc,
    requestedCheckOutAtUtc,
    requestedWorkMode,
    requestedWorkSiteId,
    requestedOvertimeMinutes,
    fallbackReason,
    reason,
  };

  // Not memoised: `draft` is a fresh object every render, so a dependency list
  // could only ever be a list of the same fields again. The validation is a
  // handful of string checks, and pretending to cache it was the more misleading
  // of the two options.
  const issues = validateDraft(draft);

  // Seeding introduces a failure the blank form could not have: every field
  // arrives already filled in, so "submit" is reachable while the draft still
  // proposes exactly what the record says. That would reach a manager as a
  // decision with no subject.
  const proposesNothing = Boolean(entry) && !hasRequestedChange(draft, entry!);
  const canSubmit = issues.length === 0 && !proposesNothing;

  const shows = (field: CorrectionField) => showsField(correctionType, field);
  const issueFor = (field: CorrectionField) =>
    touched ? issues.find((issue) => issue.field === field)?.message : undefined;

  const selectedType = CORRECTION_TYPE_OPTIONS.find(
    (option) => option.value === correctionType,
  );

  async function submit() {
    setTouched(true);
    if (!canSubmit) return;

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/attendance/correction-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the fields this type uses are sent. The server rejects unknown
        // combinations anyway, and sending a stale value from a field that was
        // hidden after being filled in would persist something nobody meant.
        body: JSON.stringify({
          attendanceEntryId: attendanceEntryId || undefined,
          correctionType,
          attendanceDate: shows("attendanceDate")
            ? attendanceDate || undefined
            : undefined,
          requestedCheckInAtUtc: shows("requestedCheckInAtUtc")
            ? toIso(requestedCheckInAtUtc)
            : undefined,
          requestedCheckOutAtUtc: shows("requestedCheckOutAtUtc")
            ? toIso(requestedCheckOutAtUtc)
            : undefined,
          requestedWorkMode: shows("requestedWorkMode")
            ? requestedWorkMode || undefined
            : undefined,
          requestedWorkSiteId: shows("requestedWorkSiteId")
            ? requestedWorkSiteId || undefined
            : undefined,
          requestedOvertimeMinutes: shows("requestedOvertimeMinutes")
            ? Number(requestedOvertimeMinutes) || undefined
            : undefined,
          fallbackReason: shows("fallbackReason")
            ? fallbackReason || undefined
            : undefined,
          reason,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        // The server's own message, verbatim. It knows about shift, policy and
        // reconciliation, and paraphrasing it here would lose the detail.
        throw new Error(data?.message ?? "Unable to submit correction request.");
      }

      const id = data?.item?.id ?? null;
      if (onSubmitted) {
        onSubmitted(id);
        return;
      }
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
        {entry ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Editing this attendance record
              </p>
              <p className="text-xs text-muted">
                The record is unchanged until your manager approves the request.
              </p>
            </div>
            {/*
              The submit control sits at the top of the panel rather than below
              the fields, because the panel opens over a record the person was
              already reading and the action belongs where the record's own
              header is.
            */}
            <div className="flex items-center gap-2">
              {onCancel ? (
                <button
                  className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                  disabled={isSubmitting}
                  onClick={onCancel}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
                disabled={isSubmitting}
                onClick={() => void submit()}
                type="button"
              >
                <Send className="h-4 w-4" />
                {isSubmitting ? "Submitting..." : "Submit request"}
              </button>
            </div>
          </div>
        ) : null}

        <Field label="What would you like corrected?">
          <select
            className="input"
            onChange={(event) =>
              setCorrectionType(event.target.value as CorrectionType)
            }
            value={correctionType}
          >
            {CORRECTION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {selectedType ? (
            <span className="text-xs text-muted">{selectedType.hint}</span>
          ) : null}
        </Field>

        {shows("attendanceDate") ? (
          <Field error={issueFor("attendanceDate")} label="Which day?">
            <input
              className="input"
              onChange={(event) => setAttendanceDate(event.target.value)}
              type="date"
              value={attendanceDate}
            />
          </Field>
        ) : null}

        {shows("requestedCheckInAtUtc") || shows("requestedCheckOutAtUtc") ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {shows("requestedCheckInAtUtc") ? (
              <Field
                error={issueFor("requestedCheckInAtUtc")}
                label="Check-in time"
              >
                <input
                  className="input"
                  onChange={(event) =>
                    setRequestedCheckInAtUtc(event.target.value)
                  }
                  type="datetime-local"
                  value={requestedCheckInAtUtc}
                />
                <WasHint
                  current={requestedCheckInAtUtc}
                  original={originals?.checkInAtUtc}
                />
              </Field>
            ) : null}

            {shows("requestedCheckOutAtUtc") ? (
              <Field
                error={issueFor("requestedCheckOutAtUtc")}
                label="Check-out time"
              >
                <input
                  className="input"
                  onChange={(event) =>
                    setRequestedCheckOutAtUtc(event.target.value)
                  }
                  type="datetime-local"
                  value={requestedCheckOutAtUtc}
                />
                <WasHint
                  current={requestedCheckOutAtUtc}
                  original={originals?.checkOutAtUtc}
                />
              </Field>
            ) : null}
          </div>
        ) : null}

        {shows("requestedWorkMode") ? (
          <Field
            error={issueFor("requestedWorkMode")}
            label="How were you working?"
          >
            <select
              className="input"
              onChange={(event) => setRequestedWorkMode(event.target.value)}
              value={requestedWorkMode}
            >
              <option value="">Leave unchanged</option>
              {/* Hybrid is deliberately absent: it describes a whole day made of
                  differing periods, not one period. */}
              {REQUESTABLE_WORK_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {workModeLabel(mode)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {shows("requestedWorkSiteId") ? (
          <Field error={issueFor("requestedWorkSiteId")} label="Which work site?">
            <select
              className="input"
              onChange={(event) => setRequestedWorkSiteId(event.target.value)}
              value={requestedWorkSiteId}
            >
              <option value="">Not applicable</option>
              {workSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {shows("requestedOvertimeMinutes") ? (
          <Field
            error={issueFor("requestedOvertimeMinutes")}
            label="Overtime minutes requested"
          >
            <input
              className="input"
              max={MAX_OVERTIME_MINUTES}
              min={1}
              onChange={(event) =>
                setRequestedOvertimeMinutes(event.target.value)
              }
              type="number"
              value={requestedOvertimeMinutes}
            />
            <span className="text-xs text-muted">
              Only time already worked beyond your schedule can be approved.
            </span>
          </Field>
        ) : null}

        {shows("fallbackReason") ? (
          <Field
            error={issueFor("fallbackReason")}
            label="Why could the attendance device not be used?"
          >
            <input
              className="input"
              onChange={(event) => setFallbackReason(event.target.value)}
              placeholder="For example: the reader was out of service"
              value={fallbackReason}
            />
          </Field>
        ) : null}

        <Field error={issueFor("reason")} label="Reason">
          <textarea
            className="input min-h-28"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain what should be corrected and why."
            value={reason}
          />
        </Field>

        {/*
          Only asked when the form was opened cold. Opened from a record the id
          is already known, and asking someone to copy a UUID off the page they
          just left was the whole reason this panel exists.
        */}
        {entry ? null : (
          <Field label="Attendance record ID (optional)">
            <input
              className="input"
              onChange={(event) => setAttendanceEntryId(event.target.value)}
              placeholder="Leave blank if the day has no record yet"
              value={attendanceEntryId}
            />
          </Field>
        )}

        {entry ? null : (
          <button
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-accent/30 bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => void submit()}
            type="button"
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? "Submitting..." : "Submit request"}
          </button>
        )}

        {touched && issues.length > 0 ? (
          <p className="text-sm text-amber-700" role="alert">
            {issues[0].message}
          </p>
        ) : null}

        {touched && issues.length === 0 && proposesNothing ? (
          <p className="text-sm text-amber-700" role="alert">
            Change at least one value first. As it stands this request asks for
            exactly what the record already says.
          </p>
        ) : null}

        {message ? (
          <p className="text-sm text-red-600" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Field({
  children,
  label,
  error,
}: {
  children: ReactNode;
  label: string;
  error?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

/**
 * What the record said before this field was touched.
 *
 * Rendered only once the value actually differs, so the panel stays quiet while
 * it is still showing the record unchanged and speaks up the moment something
 * moves.
 */
function WasHint({
  current,
  original,
}: {
  current: string;
  original?: string | null;
}) {
  if (!original) return null;
  const seeded = toLocalDateTimeInput(original);
  if (!seeded || seeded === current) return null;
  return (
    <span className="text-xs text-muted">Was {seeded.replace("T", " ")}</span>
  );
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}
