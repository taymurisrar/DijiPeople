"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { CheckboxField, TextField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import {
  checklistProgress,
  isOccurrenceClosed,
  occurrenceTone,
  statusLabel,
  trimmedNote,
  type DutyOccurrence,
} from "../_lib/duties";
import { workRequest } from "../_lib/work-client";

/**
 * One duty occurrence: its checklist, a note per item, and completing the duty.
 * The API decides whether the person may tick an item and whether the duty can
 * complete (a required item still open is refused); its message is shown as it
 * arrives and nothing is assumed to have worked until it answers.
 */
export function DutyOccurrenceDialog({
  canWrite,
  occurrenceId,
  onChanged,
  onClose,
  onHandover,
}: {
  canWrite: boolean;
  occurrenceId: string;
  onChanged: () => void;
  onClose: () => void;
  onHandover: (occurrence: DutyOccurrence) => void;
}) {
  const [occurrence, setOccurrence] = useState<DutyOccurrence | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // No control here disables itself while a change is in flight (that drops keyboard focus out of
  // the dialog); the handlers ignore a second action until the first is answered.
  // The tick shows at once and is replaced by what the API answers (or undone if it refuses).
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await workRequest<DutyOccurrence>(
        "work-duties",
        `/occurrences/${occurrenceId}`,
      );
      setOccurrence(next);
      setNotes((current) => {
        const merged = { ...current };
        for (const check of next.checks) {
          if (merged[check.id] === undefined) merged[check.id] = check.note ?? "";
        }
        return merged;
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [occurrenceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await load();
      onChanged();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setPending({});
      setBusy(false);
    }
  };

  const toggle = (checkId: string, done: boolean) => {
    // Not disabled while a change is in flight: a control that disables itself under
    // the keyboard drops focus out of the dialog. A second tick waits its turn instead.
    if (busy) return Promise.resolve();
    setPending({ [checkId]: done });
    return run(() =>
      workRequest(
        "work-duties",
        `/checks/${checkId}/${done ? "complete" : "uncomplete"}`,
        {
          method: "POST",
          body: done ? trimmedNote(notes[checkId] ?? "") : undefined,
        },
      ),
    );
  };

  const closeRef = useRef<HTMLButtonElement>(null);

  const [completing, setCompleting] = useState(false);

  const complete = async () => {
    if (busy) return;
    setCompleting(true);
    await run(() =>
      workRequest("work-duties", `/occurrences/${occurrenceId}/complete`, {
        method: "POST",
      }),
    );
    // The button that was just used disables and then disappears; keep focus inside the dialog.
    setCompleting(false);
    closeRef.current?.focus();
  };

  const closed = occurrence ? isOccurrenceClosed(occurrence) : true;
  const progress = occurrence ? checklistProgress(occurrence.checks) : null;

  return (
    <Dialog
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} ref={closeRef} variant="secondary">
            Close
          </Button>
          {occurrence && canWrite ? (
            <Button
              aria-busy={busy}
              onClick={() => {
                if (!busy) onHandover(occurrence);
              }}
              variant="outline"
            >
              Hand over
            </Button>
          ) : null}
          {occurrence && canWrite && !closed ? (
            <Button loading={completing} onClick={() => void complete()}>
              Complete duty
            </Button>
          ) : null}
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title={
        occurrence
          ? `${occurrence.templateName}, ${formatDate(occurrence.forDate)}`
          : "Duty"
      }
    >
      <div aria-busy={loading} className="grid gap-4">
        {loadError ? (
          <div className="grid gap-3" role="alert">
            <p className="text-sm text-danger">{loadError}</p>
            <div>
              <Button onClick={() => void load()} variant="secondary">
                Retry
              </Button>
            </div>
          </div>
        ) : null}
        {actionError ? (
          <p className="text-sm text-danger" role="alert">
            {actionError}
          </p>
        ) : null}
        {loading && !occurrence ? (
          <div className="h-32 animate-pulse rounded-[24px] bg-surface-strong" />
        ) : null}
        {occurrence && progress ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill tone={occurrenceTone(occurrence.status)}>
                {statusLabel(occurrence.status)}
              </StatusPill>
              <p className="text-sm text-muted" role="status">
                {`${progress.done} of ${progress.total} checks done`}
              </p>
            </div>
            {occurrence.checks.length === 0 ? (
              <p className="text-sm text-muted">No checklist on this duty.</p>
            ) : (
              <ul aria-label="Checklist" className="grid gap-3">
                {occurrence.checks.map((check) => (
                  <li
                    className="grid gap-2 rounded-2xl border border-border p-3"
                    key={check.id}
                  >
                    {/* The note comes before the tick, so a keyboard user writes it and then
                        ticks; the field that is swapped for text once the check is done is
                        therefore never the one focus moves on to. */}
                    {check.completedAt ? (
                      check.note ? (
                        <p className="text-xs text-muted">{`Note: ${check.note}`}</p>
                      ) : null
                    ) : canWrite && !closed ? (
                      <TextField
                        label={`Note for ${check.label}`}
                        maxLength={500}
                        onChange={(value) =>
                          setNotes((current) => ({
                            ...current,
                            [check.id]: value,
                          }))
                        }
                        value={notes[check.id] ?? ""}
                      />
                    ) : null}
                    <CheckboxField
                      checked={pending[check.id] ?? Boolean(check.completedAt)}
                      disabled={closed || !canWrite}
                      label={
                        check.required ? `${check.label} (required)` : check.label
                      }
                      onChange={(done) => void toggle(check.id, done)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
