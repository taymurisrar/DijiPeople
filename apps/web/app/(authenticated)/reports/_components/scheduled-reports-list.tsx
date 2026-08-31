"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import {
  deleteReportSchedule,
  reportingErrorMessage,
  updateReportSchedule,
  type ReportSchedule,
} from "../_lib/reporting-browser";

/*
 * The schedules this workspace has, and the two things you can do to one from
 * a list: pause it, or delete it.
 *
 * Editing is deliberately not here. `PATCH /reporting/schedules/:id` is a
 * **full replace** — `UpdateReportScheduleDto extends CreateReportScheduleDto`
 * with nothing optional, and the service writes every column from the input —
 * so a partial edit form would null out whatever it did not render. The pause
 * toggle therefore round-trips the whole schedule with only `isEnabled`
 * changed, which is the one safe partial edit, and it is written out here so
 * the next person does not add a "quick edit" that quietly drops recipients.
 *
 * Pausing rather than deleting matters: a failing schedule is disabled
 * automatically after repeated failures, and the difference between "paused"
 * and "gone" is the difference between investigating and rebuilding.
 */

export type ScheduledReportsListProps = {
  schedules: readonly ReportSchedule[];
  /** Report names by target key, so a row does not read "def:9f2c...". */
  reportNames: Readonly<Record<string, string>>;
  currentUserId: string;
};

const FREQUENCY_WORD: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function ScheduledReportsList({
  schedules,
  reportNames,
  currentUserId,
}: ScheduledReportsListProps) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    React.useState<ReportSchedule | null>(null);

  const toggle = React.useCallback(
    async (schedule: ReportSchedule) => {
      setBusyId(schedule.id);
      setError(null);
      try {
        /*
         * The whole shape, every time. A partial body here is what would lose
         * the recipients — see the note at the top of this file.
         */
        await updateReportSchedule(schedule.id, {
          name: schedule.name,
          targetKey: schedule.targetKey,
          frequency: schedule.frequency,
          hour: schedule.hour,
          minute: schedule.minute,
          ...(schedule.dayOfWeek !== null
            ? { dayOfWeek: schedule.dayOfWeek }
            : {}),
          ...(schedule.dayOfMonth !== null
            ? { dayOfMonth: schedule.dayOfMonth }
            : {}),
          timezone: schedule.timezone,
          format: schedule.format,
          periodPreset: schedule.periodPreset,
          ...(Array.isArray(schedule.filters)
            ? { filters: schedule.filters as unknown[] }
            : {}),
          recipients: schedule.recipientUserIds,
          isEnabled: !schedule.isEnabled,
        });
        router.refresh();
      } catch (caught) {
        setError(reportingErrorMessage(caught));
      } finally {
        setBusyId(null);
      }
    },
    [router],
  );

  const confirmDelete = React.useCallback(async () => {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    setError(null);
    try {
      await deleteReportSchedule(pendingDelete.id);
      setPendingDelete(null);
      router.refresh();
    } catch (caught) {
      setError(reportingErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }, [pendingDelete, router]);

  if (schedules.length === 0) {
    return (
      <EmptyState
        action={
          <Button href="/reports/library" variant="primary">
            Open the report library
          </Button>
        }
        description="Nothing is being delivered on a schedule in this workspace. Open a report and choose Schedule to have it built and emailed on a recurring basis."
        title="No schedules yet"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <p
          className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <ul className="grid gap-4">
        {schedules.map((schedule) => {
          const reportName = reportNames[schedule.targetKey] ?? schedule.targetKey;
          const mine = schedule.ownerUserId === currentUserId;

          return (
            <li key={schedule.id}>
              <article className="grid gap-3 rounded-[22px] border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {schedule.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      <Link
                        className="text-accent underline-offset-2 hover:underline"
                        href={`/reports/library?target=${encodeURIComponent(schedule.targetKey)}`}
                      >
                        {reportName}
                      </Link>
                      {" - "}
                      {describeCadence(schedule)} as {schedule.format}
                    </p>
                  </div>

                  {/*
                   * State as a word as well as a colour. A paused schedule
                   * whose only signal is a grey pill is BUG-2148 in miniature,
                   * and this is a state somebody needs to notice.
                   */}
                  <StatusPill tone={schedule.isEnabled ? "good" : "muted"}>
                    {schedule.isEnabled ? "Active" : "Paused"}
                  </StatusPill>
                </div>

                <dl className="grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <dt className="inline font-medium text-foreground">
                      Next run:{" "}
                    </dt>
                    <dd className="inline">
                      {schedule.nextRunAt
                        ? formatDateTime(schedule.nextRunAt)
                        : "Not scheduled"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">
                      Last run:{" "}
                    </dt>
                    <dd className="inline">
                      {schedule.lastRunAt
                        ? `${formatDateTime(schedule.lastRunAt)} (${(
                            schedule.lastRunStatus ?? "unknown"
                          ).toLowerCase()})`
                        : "Never run"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">
                      Recipients:{" "}
                    </dt>
                    <dd className="inline">
                      {schedule.recipientUserIds.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">
                      Period:{" "}
                    </dt>
                    <dd className="inline">
                      {schedule.periodPreset.replace(/_/g, " ")}
                    </dd>
                  </div>
                </dl>

                {schedule.lastFailureReason ? (
                  <p className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger">
                    Last failure: {schedule.lastFailureReason}
                    {schedule.consecutiveFailureCount > 1
                      ? ` (${schedule.consecutiveFailureCount} consecutive failures - a schedule that keeps failing is disabled rather than left to mail an error every morning)`
                      : ""}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    aria-label={
                      schedule.isEnabled
                        ? `Pause the schedule ${schedule.name}`
                        : `Resume the schedule ${schedule.name}`
                    }
                    disabled={busyId !== null}
                    leftIcon={
                      schedule.isEnabled ? (
                        <Pause aria-hidden="true" className="h-4 w-4" />
                      ) : (
                        <Play aria-hidden="true" className="h-4 w-4" />
                      )
                    }
                    onClick={() => void toggle(schedule)}
                    size="xs"
                    variant="ghost"
                  >
                    {schedule.isEnabled ? "Pause" : "Resume"}
                  </Button>

                  <Button
                    aria-label={`Delete the schedule ${schedule.name}`}
                    disabled={busyId !== null}
                    leftIcon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                    onClick={() => setPendingDelete(schedule)}
                    size="xs"
                    variant="ghost"
                  >
                    Delete
                  </Button>

                  {!mine ? (
                    <span className="self-center text-xs text-muted">
                      Runs under its owner&apos;s access, not yours.
                    </span>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <Dialog
        busy={busyId !== null}
        description={
          pendingDelete
            ? `"${pendingDelete.name}" will stop being delivered. Files already produced are unaffected and expire on their own.`
            : ""
        }
        footer={
          <>
            <Button
              disabled={busyId !== null}
              onClick={() => setPendingDelete(null)}
              variant="secondary"
            >
              Keep it
            </Button>
            <Button
              loading={busyId !== null}
              onClick={() => void confirmDelete()}
              variant="danger"
            >
              Delete schedule
            </Button>
          </>
        }
        onClose={() => setPendingDelete(null)}
        open={pendingDelete !== null}
        size="sm"
        title="Delete this schedule?"
      />
    </div>
  );
}

/** "Weekly on Sunday at 08:00 (Asia/Qatar)". */
function describeCadence(schedule: ReportSchedule): string {
  const time = `${String(schedule.hour).padStart(2, "0")}:${String(
    schedule.minute,
  ).padStart(2, "0")}`;

  const word = FREQUENCY_WORD[schedule.frequency] ?? schedule.frequency;

  const when =
    schedule.frequency === "WEEKLY" && schedule.dayOfWeek !== null
      ? ` on ${DAY_NAMES[schedule.dayOfWeek] ?? "an unknown day"}`
      : schedule.frequency === "MONTHLY" && schedule.dayOfMonth !== null
        ? ` on day ${schedule.dayOfMonth}`
        : "";

  /*
   * The timezone is printed rather than assumed. A schedule created by someone
   * in another zone fires in the zone it stores, and "08:00" alone is the sort
   * of thing that gets read as local and then quietly disbelieved.
   */
  return `${word}${when} at ${time} (${schedule.timezone})`;
}
