"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PermissionGate } from "../../_components/permission-gate";
import { TimesheetMONTHLYGrid } from "./timesheet-monthly-grid";
import { TimesheetSummaryStrip } from "./timesheet-summary-strip";
import { TimesheetEntryType, TimesheetRecord } from "../types";

type EditableRow = TimesheetRecord["entries"][number] & {
  uiEntryType: TimesheetEntryType | null;
  uiHoursWorked: string;
  uiNote: string;
};

export function TimesheetMONTHLYEditor({
  settings,
  timesheet,
}: {
  settings?: {
    defaultHoursForOnWork?: number;
    allowWeekendWork?: boolean;
    allowHolidayWork?: boolean;
    requireAllDaysCompletedBeforeSubmit?: boolean;
    requireSubmissionNote?: boolean;
    timesheetPeriodType?: string;
    weekendDays?: string[];
  };
  timesheet: TimesheetRecord;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<EditableRow[]>(
    timesheet.entries.map((entry) => ({
      ...entry,
      uiEntryType: entry.entryType,
      uiHoursWorked: String(entry.hoursWorked ?? 0),
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
  const requiredRows = useMemo(
    () => rows.filter((row) => !row.isWeekend && !row.isHoliday),
    [rows],
  );
  const completedRequiredRows = useMemo(
    () =>
      requiredRows.filter(
        (row) => row.uiEntryType === "ON_WORK" || row.uiEntryType === "ON_LEAVE",
      ),
    [requiredRows],
  );
  const currentSummary = useMemo(() => summarizeRows(rows), [rows]);
  const completionPercent =
    requiredRows.length === 0
      ? 100
      : Math.round((completedRequiredRows.length / requiredRows.length) * 100);

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
          hoursWorked: row.uiHoursWorked,
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
  const periodLabel =
    settings?.timesheetPeriodType === "weekly"
      ? "Weekly"
      : settings?.timesheetPeriodType === "biweekly"
        ? "Biweekly"
        : "Monthly";
  const configuredWeekendDays = settings?.weekendDays?.join(", ") ?? "tenant weekend days";
  const defaultHoursLabel =
    settings?.defaultHoursForOnWork !== undefined
      ? `${settings.defaultHoursForOnWork} hour(s)`
      : "the configured default";

  return (
    <div className="grid gap-6">
      <TimesheetSummaryStrip timesheet={timesheet} />
      <CompletionPanel
        completed={completedRequiredRows.length}
        percent={completionPercent}
        required={requiredRows.length}
        summary={currentSummary}
      />

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              {periodLabel} Timesheet
            </p>
            <h4 className="mt-2 text-2xl font-semibold text-foreground">
              Fill each day for {monthLabel(timesheet.month, timesheet.year)}
            </h4>
            <p className="mt-2 text-muted">
              {configuredWeekendDays} and holidays are tenant-settings driven.
              On Work defaults to {defaultHoursLabel}
              unless the saved row says otherwise.
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
            allowHolidayWork={settings?.allowHolidayWork}
            allowWeekendWork={settings?.allowWeekendWork}
            editable={!isLocked}
            invalidDates={invalidDates}
            onEntryTypeChange={(date, nextValue) =>
              setRows((current) =>
                current.map((row) =>
                  row.date === date
                    ? {
                        ...row,
                        uiEntryType: nextValue,
                        uiHoursWorked:
                          nextValue === "ON_WORK"
                            ? row.uiHoursWorked || String(settings?.defaultHoursForOnWork ?? 0)
                            : "0",
                      }
                    : row,
                ),
              )
            }
            onHoursChange={(date, nextValue) =>
              setRows((current) =>
                current.map((row) =>
                  row.date === date ? { ...row, uiHoursWorked: nextValue } : row,
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
            <PermissionGate permission="timesheets.write">
              <button
                className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
                disabled={isSaving}
                onClick={saveDraft}
                type="button"
              >
                {isSaving ? "Saving..." : "Save draft"}
              </button>
            </PermissionGate>
            {timesheet.canCurrentUserSubmit ? (
              <PermissionGate permission="timesheets.submit">
                <button
                className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent disabled:opacity-70"
                  disabled={
                    isSaving ||
                    invalidDates.length > 0 ||
                    Boolean(settings?.requireSubmissionNote && !submitNote.trim())
                  }
                  onClick={() => setShowSubmitConfirm(true)}
                  type="button"
                >
                  Submit timesheet
                </button>
              </PermissionGate>
            ) : null}
          </div>
        ) : null}

        {showSubmitConfirm ? (
          <div className="mt-6 rounded-[24px] border border-border bg-white/80 p-5">
            <p className="text-lg font-semibold text-foreground">
              Submit {monthLabel(timesheet.month, timesheet.year)} timesheet?
            </p>
            <p className="mt-2 text-sm text-muted">
              This will send the timesheet to your reporting manager for review.
              {settings?.requireSubmissionNote ? " A submission note is required." : ""}
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
                disabled={
                  isSaving ||
                  invalidDates.length > 0 ||
                  Boolean(settings?.requireSubmissionNote && !submitNote.trim())
                }
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

function CompletionPanel({
  completed,
  percent,
  required,
  summary,
}: {
  completed: number;
  percent: number;
  required: number;
  summary: {
    holidays: number;
    leaveDays: number;
    totalHours: number;
    weekendDays: number;
    workDays: number;
  };
}) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.16em] text-muted">
            Completion
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {completed} / {required} required days complete
          </p>
        </div>
        <div className="text-sm text-muted">
          {summary.workDays} work • {summary.leaveDays} leave • {summary.holidays} holidays • {summary.weekendDays} weekends • {summary.totalHours.toFixed(2)} hrs
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}

function summarizeRows(rows: EditableRow[]) {
  return rows.reduce(
    (summary, row) => {
      if (row.uiEntryType === "ON_WORK") {
        summary.workDays += 1;
        summary.totalHours += Number(row.uiHoursWorked || 0);
      }
      if (row.uiEntryType === "ON_LEAVE") summary.leaveDays += 1;
      if (row.uiEntryType === "HOLIDAY" || row.isHoliday) summary.holidays += 1;
      if (row.uiEntryType === "WEEKEND" || row.isWeekend) summary.weekendDays += 1;
      return summary;
    },
    { holidays: 0, leaveDays: 0, totalHours: 0, weekendDays: 0, workDays: 0 },
  );
}

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
