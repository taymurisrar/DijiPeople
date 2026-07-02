"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AttendanceCorrectionActionsProps = {
  requestId: string;
  requestedCheckInAtUtc: string | null;
  requestedCheckOutAtUtc: string | null;
  canApprove: boolean;
  canReject: boolean;
  canEdit: boolean;
};

export function AttendanceCorrectionActions({
  requestId,
  requestedCheckInAtUtc,
  requestedCheckOutAtUtc,
  canApprove,
  canReject,
  canEdit,
}: AttendanceCorrectionActionsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    requestedCheckIn?: string;
    requestedCheckOut?: string;
  }>({});
  const [requestedCheckIn, setRequestedCheckIn] = useState(
    toDatetimeLocal(requestedCheckInAtUtc),
  );
  const [requestedCheckOut, setRequestedCheckOut] = useState(
    toDatetimeLocal(requestedCheckOutAtUtc),
  );
  const [comment, setComment] = useState("");

  async function submit(action: "approve" | "reject") {
    const validationErrors = validateCorrectionValues(
      requestedCheckIn,
      requestedCheckOut,
      action,
    );
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setMessage("Please fix the highlighted fields before submitting.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/attendance/correction-requests/${requestId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comment: comment.trim() || undefined,
            requestedCheckInAtUtc:
              action === "approve" && requestedCheckIn
                ? new Date(requestedCheckIn).toISOString()
                : undefined,
            requestedCheckOutAtUtc:
              action === "approve" && requestedCheckOut
                ? new Date(requestedCheckOut).toISOString()
                : undefined,
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to update correction request.");
      }
      setMessage(
        action === "approve"
          ? "Correction approved and applied."
          : "Correction rejected.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update correction request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canApprove && !canReject) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-danger/20 bg-danger/5 p-4">
      {canEdit ? (
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-danger">
            Manager review required
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">
                Approved check-in
              </span>
              <input
                className={`input ${fieldErrors.requestedCheckIn ? "border-danger ring-2 ring-danger/20" : ""}`}
                disabled={isSubmitting}
                onChange={(event) => {
                  setRequestedCheckIn(event.target.value);
                  setFieldErrors((current) => ({
                    ...current,
                    requestedCheckIn: undefined,
                  }));
                }}
                type="datetime-local"
                value={requestedCheckIn}
              />
              {fieldErrors.requestedCheckIn ? (
                <span className="text-xs text-danger">
                  {fieldErrors.requestedCheckIn}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">
                Approved check-out
              </span>
              <input
                className={`input ${fieldErrors.requestedCheckOut ? "border-danger ring-2 ring-danger/20" : ""}`}
                disabled={isSubmitting}
                onChange={(event) => {
                  setRequestedCheckOut(event.target.value);
                  setFieldErrors((current) => ({
                    ...current,
                    requestedCheckOut: undefined,
                  }));
                }}
                type="datetime-local"
                value={requestedCheckOut}
              />
              {fieldErrors.requestedCheckOut ? (
                <span className="text-xs text-danger">
                  {fieldErrors.requestedCheckOut}
                </span>
              ) : null}
            </label>
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">
              Manager comment
            </span>
            <textarea
              className="input min-h-24"
              disabled={isSubmitting}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Optional approval/rejection note."
              value={comment}
            />
          </label>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canApprove ? (
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => void submit("approve")}
            type="button"
          >
            <Check className="h-4 w-4" />
            Approve
          </button>
        ) : null}
        {canReject ? (
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => void submit("reject")}
            type="button"
          >
            <X className="h-4 w-4" />
            Reject
          </button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
    </div>
  );
}

function toDatetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function validateCorrectionValues(
  requestedCheckIn: string,
  requestedCheckOut: string,
  action: "approve" | "reject",
) {
  const errors: {
    requestedCheckIn?: string;
    requestedCheckOut?: string;
  } = {};

  if (action === "approve" && !requestedCheckIn && !requestedCheckOut) {
    errors.requestedCheckIn = "Check-in or check-out is required.";
    errors.requestedCheckOut = "Check-in or check-out is required.";
  }

  if (
    requestedCheckIn &&
    requestedCheckOut &&
    new Date(requestedCheckOut) < new Date(requestedCheckIn)
  ) {
    errors.requestedCheckOut = "Check-out cannot be earlier than check-in.";
  }

  return errors;
}
