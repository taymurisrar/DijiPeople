"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TimesheetMONTHLYGrid } from "./timesheet-monthly-grid";
import { TimesheetSummaryStrip } from "./timesheet-summary-strip";
import { TimesheetEntryType, TimesheetRecord } from "../types";

type EditableRow = TimesheetRecord["entries"][number] & {
  uiEntryType: TimesheetEntryType | null;
  uiNote: string;
};

export function TimesheetMONTHLYEditor({
  timesheet,
}: {
  timesheet: TimesheetRecord;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<EditableRow[]>(
    timesheet.entries.map((entry) => ({
      ...entry,
      uiEntryType: entry.entryType,
      uiNote: entry.note ?? "",
    })),
  );
  const [submitNote, setSubmitNote] = useState(timesheet.submittedNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const invalidDates = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            !row.isWeekend &&
            !row.isHoliday &&
            row.uiEntryType !== "ON_WORK" &&
            row.uiEntryType !== "ON_LEAVE",
        )
        .map((row) => row.date.slice(0, 10)),
    [rows],
  );

  async function saveDraft() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/timesheets/${timesheet.id}/entries`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entries: rows.map((row) => ({
          date: row.date,
          entryType: row.uiEntryType,
          note: row.uiNote || undefined,
        })),
      }),
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message ?? "Unable to save timesheet.");
      setIsSaving(false);
      return;
    }

    setMessage("Draft saved.");
    setIsSaving(false);
    router.refresh();
  }

  async function submitTimesheet() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/timesheets/${timesheet.id}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        submittedNote: submitNote || undefined,
      }),
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message ?? "Unable to submit timesheet.");
      setIsSaving(false);
      return;
    }

    setShowSubmitConfirm(false);
    setMessage("Timesheet submitted for approval.");
    setIsSaving(false);
    router.refresh();
  }

  const isLocked = !timesheet.canCurrentUserEdit;

  return (
    <div className="grid gap-6">
      <TimesheetSummaryStrip timesheet={timesheet} />

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              MONTHLY Timesheet
            </p>
            <h4 className="mt-2 text-2xl font-semibold text-foreground">
              Fill each day for {monthLabel(timesheet.month, timesheet.year)}
            </h4>
            <p className="mt-2 text-muted">
              Weekends and holidays are system-driven. Weekdays must resolve to
              On Work or On Leave before submission.
            </p>
          </div>
          <div className="text-sm text-muted">
            <p>Status: {timesheet.status}</p>
            <p>
              Approver:{" "}
              {timesheet.employee.reportingManager
                ? `${timesheet.employee.reportingManager.firstName} ${timesheet.employee.reportingManager.lastName}`
                : "Not assigned"}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <TimesheetMONTHLYGrid
            editable={!isLocked}
            invalidDates={invalidDates}
            onEntryTypeChange={(date, nextValue) =>
              setRows((current) =>
                current.map((row) =>
                  row.date === date ? { ...row, uiEntryType: nextValue } : row,
                ),
              )
            }
            onNoteChange={(date, nextValue) =>
              setRows((current) =>
                current.map((row) =>
                  row.date === date ? { ...row, uiNote: nextValue } : row,
                ),
              )
            }
            rows={rows}
          />
        </div>

        {timesheet.reviewNote ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Review note: {timesheet.reviewNote}
          </p>
        ) : null}

        {message ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {!isLocked ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
              disabled={isSaving}
              onClick={saveDraft}
              type="button"
            >
              {isSaving ? "Saving..." : "Save draft"}
            </button>
            <button
              className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent disabled:opacity-70"
              disabled={isSaving || invalidDates.length > 0}
              onClick={() => setShowSubmitConfirm(true)}
              type="button"
            >
              Submit timesheet
            </button>
          </div>
        ) : null}

        {showSubmitConfirm ? (
          <div className="mt-6 rounded-[24px] border border-border bg-white/80 p-5">
            <p className="text-lg font-semibold text-foreground">
              Submit {monthLabel(timesheet.month, timesheet.year)} timesheet?
            </p>
            <p className="mt-2 text-sm text-muted">
              This will send the timesheet to your reporting manager for review.
            </p>
            <label className="mt-4 grid gap-2 text-sm">
              <span className="font-medium text-foreground">Submission note</span>
              <textarea
                className="min-h-28 rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                maxLength={500}
                onChange={(event) => setSubmitNote(event.target.value)}
                value={submitNote}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
                disabled={isSaving || invalidDates.length > 0}
                onClick={submitTimesheet}
                type="button"
              >
                Confirm submission
              </button>
              <button
                className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
                onClick={() => setShowSubmitConfirm(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
