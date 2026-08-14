"use client";

import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { formatMeters, type AttendanceOutcome } from "@/lib/attendance/attendance-outcome";

/**
 * The contextual answer to an attendance attempt.
 *
 * This is what replaced the technical error dialog for expected outcomes. An
 * employee standing in a device-required office needs one sentence and a next
 * step, not a reference id and a log download — those belong to defects, and the
 * platform's error modal still handles those unchanged.
 */
export function AttendanceActionFeedback({
  busyLabel,
  onDismiss,
  onFallbackRequested,
  onRetry,
  outcome,
}: {
  /** Set while the attempt is still running; suppresses the outcome body. */
  readonly busyLabel?: string | null;
  readonly onDismiss: () => void;
  readonly onFallbackRequested?: () => void;
  readonly onRetry?: () => void;
  readonly outcome: AttendanceOutcome | null;
}) {
  if (!busyLabel && !outcome) return null;

  if (busyLabel) {
    return (
      <div
        aria-live="polite"
        className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[min(28rem,calc(100%-2rem))] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg"
        role="status"
      >
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        <p className="text-sm font-medium text-foreground">{busyLabel}</p>
      </div>
    );
  }

  if (!outcome) return null;

  const tone =
    outcome.kind === "recorded"
      ? "border-emerald-200 bg-emerald-50"
      : outcome.kind === "location"
        ? "border-amber-200 bg-amber-50"
        : "border-border bg-surface";

  return (
    <div
      aria-live="polite"
      className={`fixed inset-x-0 bottom-4 z-50 mx-auto grid w-[min(30rem,calc(100%-2rem))] gap-3 rounded-xl border px-4 py-3 shadow-lg ${tone}`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{outcome.title}</p>
          <p className="mt-1 text-sm text-foreground/80">{outcome.message}</p>
          {accuracyLine(outcome) ? (
            <p className="mt-1 text-xs text-muted">{accuracyLine(outcome)}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {outcome.canRetry && onRetry ? (
          <Button onClick={onRetry} size="sm" type="button">
            Try again
          </Button>
        ) : null}
        {outcome.fallbackAvailable && onFallbackRequested ? (
          <Button
            onClick={onFallbackRequested}
            size="sm"
            type="button"
            variant="secondary"
          >
            Request web attendance
          </Button>
        ) : null}
        <Button onClick={onDismiss} size="sm" type="button" variant="ghost">
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/**
 * The two numbers, shown only when the server sent both.
 *
 * "Required: 0 m" from a missing field would be worse than showing nothing, so
 * a partial payload prints no line at all.
 */
function accuracyLine(outcome: AttendanceOutcome) {
  const accuracy = outcome.detail?.accuracyMeters;
  const required = outcome.detail?.requiredAccuracyMeters;
  if (typeof accuracy !== "number" || typeof required !== "number") return "";
  return `Current accuracy ${formatMeters(accuracy)} · required ${formatMeters(required)}`;
}
