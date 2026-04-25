"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TimesheetMONTHLYGrid } from "./timesheet-monthly-grid";
import { TimesheetSummaryStrip } from "./timesheet-summary-strip";
import { TimesheetRecord } from "../types";

export function TimesheetManagerReviewPanel({
  timesheet,
}: {
  timesheet: TimesheetRecord;
}) {
  const router = useRouter();
  const [reviewNote, setReviewNote] = useState(timesheet.reviewNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function runAction(action: "approve" | "reject") {
    setIsSubmitting(true);
    setError(null);

    const response = await fetch(`/api/timesheets/${timesheet.id}/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reviewNote }),
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message ?? `Unable to ${action} timesheet.`);
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
  }

  return (
    <div className="grid gap-6">
      <TimesheetSummaryStrip timesheet={timesheet} />

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Submitted Timesheet
            </p>
            <h4 className="mt-2 text-2xl font-semibold text-foreground">
              {timesheet.employee.fullName} • {monthLabel(timesheet.month, timesheet.year)}
            </h4>
            <p className="mt-2 text-muted">
              Review the daily breakdown, submission note, and summary before
              approving or rejecting.
            </p>
          </div>
          <a
            className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
            href={`/api/timesheets/${timesheet.id}/export`}
          >
            Export CSV
          </a>
        </div>

        {timesheet.submittedNote ? (
          <p className="mt-4 rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm text-muted">
            Submission note: {timesheet.submittedNote}
          </p>
        ) : null}

        <div className="mt-6">
          <TimesheetMONTHLYGrid
            rows={timesheet.entries.map((entry) => ({
              ...entry,
              uiEntryType: entry.entryType,
              uiNote: entry.note ?? "",
            }))}
          />
        </div>

        {timesheet.canCurrentUserApprove ? (
          <div className="mt-6 grid gap-4 rounded-[24px] border border-border bg-white/80 p-5">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-foreground">Review note</span>
              <textarea
                className="min-h-28 rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                maxLength={500}
                onChange={(event) => setReviewNote(event.target.value)}
                value={reviewNote}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                disabled={isSubmitting}
                onClick={() => runAction("approve")}
                type="button"
              >
                Approve
              </button>
              <button
                className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-70"
                disabled={isSubmitting}
                onClick={() => runAction("reject")}
                type="button"
              >
                Reject
              </button>
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
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
