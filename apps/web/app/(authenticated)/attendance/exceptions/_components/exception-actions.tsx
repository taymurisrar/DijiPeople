"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Resolve and Ignore, offered only where they apply.
 *
 * STATE-AWARE. A closed exception shows no buttons: it is a historical record,
 * and there is deliberately no delete because the reason a correction exists is
 * part of the audit trail for attendance that was eventually paid.
 *
 * Both actions require a note. "Resolved" with no explanation is indistinguishable
 * from "clicked to clear the list", and six months later that difference is the
 * whole value of the record.
 */
export function ExceptionActions({
  exceptionId,
  status,
}: {
  exceptionId: string;
  status: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<"RESOLVED" | "IGNORED" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "OPEN") {
    return (
      <p className="text-sm text-muted">
        This exception is closed. It is kept as a record of what was decided.
      </p>
    );
  }

  async function submit() {
    if (!action) return;

    if (!note.trim()) {
      setError("A short note is required so the decision can be understood later.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/attendance/engine/exceptions/${exceptionId}/resolve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: action, note: note.trim() }),
        },
      );

      if (!response.ok) {
        setError("That could not be saved. Try again.");
        return;
      }

      router.refresh();
    } catch {
      setError("That could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!action) {
    return (
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
          onClick={() => setAction("RESOLVED")}
          type="button"
        >
          Resolve
        </button>
        <button
          className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
          onClick={() => setAction("IGNORED")}
          type="button"
        >
          Ignore
        </button>
      </div>
    );
  }

  return (
    <div className="grid max-w-xl gap-3">
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-foreground">
          {action === "RESOLVED"
            ? "How was this resolved?"
            : "Why is this being ignored?"}
        </span>
        <textarea
          className="min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            action === "RESOLVED"
              ? "For example: employee confirmed they left at 17:00 and a correction was approved."
              : "For example: known GPS fault on this device, attendance is correct."
          }
          value={note}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
          disabled={busy}
          onClick={() => void submit()}
          type="button"
        >
          {busy ? "Saving…" : `Confirm ${action === "RESOLVED" ? "resolve" : "ignore"}`}
        </button>
        <button
          className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-strong"
          disabled={busy}
          onClick={() => {
            setAction(null);
            setNote("");
            setError(null);
          }}
          type="button"
        >
          Cancel
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
