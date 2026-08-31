"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import {
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { PERIOD_PRESET_OPTIONS } from "@/app/components/filters";
import {
  createReportSchedule,
  reportingErrorMessage,
} from "../_lib/reporting-browser";

/*
 * Scheduling a report for delivery.
 *
 * It lives on the report runner rather than on the Scheduled page, because a
 * schedule needs a `targetKey` and the runner is where the reader already has
 * one in front of them. The Scheduled page lists and manages what exists.
 *
 * Three things are read from the environment rather than asked for, because
 * asking would make the form longer and the answers worse:
 *
 * - **The timezone is the workspace's.** `computeNextRun` resolves the fire
 *   time in the schedule's zone, and a per-schedule IANA picker is a long list
 *   whose wrong answers are invisible until a report arrives at 3am. It is
 *   stated in the dialog so it is not a hidden decision.
 * - **The minute is zero.** The DTO allows 0-59 and nothing is served by
 *   letting someone pick 08:37.
 * - **The period preset defaults to the report's own.** A schedule that
 *   silently used a different window from the report it names would be a
 *   different report.
 *
 * Recipients are typed as work email addresses. The API resolves them to users
 * *in this tenant* at write time and again at execution time, and refuses
 * anything that does not resolve — so a typo is an error at creation rather
 * than a silently dropped recipient.
 */

export type ScheduleReportDialogProps = {
  available: boolean;
  canManage: boolean;
  targetKey: string;
  reportName: string;
  /** The workspace timezone. Schedules fire in it. */
  timezone: string;
  /** The report's own default period preset. */
  defaultPreset?: string;
};

const FREQUENCY_OPTIONS = [
  { value: "DAILY", label: "Every day" },
  { value: "WEEKLY", label: "Every week" },
  { value: "MONTHLY", label: "Every month" },
] as const;

const FORMAT_OPTIONS = [
  { value: "XLSX", label: "Excel (XLSX)" },
  { value: "CSV", label: "CSV" },
  { value: "PDF", label: "PDF" },
] as const;

const DAY_OF_WEEK_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
] as const;

export function ScheduleReportDialog({
  available,
  canManage,
  targetKey,
  reportName,
  timezone,
  defaultPreset,
}: ScheduleReportDialogProps) {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(`${reportName} - scheduled`);
  const [frequency, setFrequency] = React.useState("WEEKLY");
  const [hour, setHour] = React.useState<number | null>(8);
  /* Sunday. This product's working week starts on Sunday, not Monday. */
  const [dayOfWeek, setDayOfWeek] = React.useState("0");
  const [dayOfMonth, setDayOfMonth] = React.useState<number | null>(1);
  const [format, setFormat] = React.useState("XLSX");
  const [preset, setPreset] = React.useState(defaultPreset ?? "last_30_days");
  const [recipients, setRecipients] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState(false);

  if (!available || !canManage) return null;

  const recipientList = recipients
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const canSave =
    name.trim().length >= 2 &&
    recipientList.length > 0 &&
    hour !== null &&
    !busy;

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      await createReportSchedule({
        name: name.trim(),
        targetKey,
        frequency,
        hour: hour ?? 8,
        minute: 0,
        /*
         * Sent only for the frequency that reads it. `dayOfWeek` on a MONTHLY
         * schedule is ignored by the service, but sending a value that is
         * ignored makes the stored row disagree with the form that wrote it.
         */
        ...(frequency === "WEEKLY" ? { dayOfWeek: Number(dayOfWeek) } : {}),
        ...(frequency === "MONTHLY"
          ? { dayOfMonth: dayOfMonth ?? 1 }
          : {}),
        timezone,
        format,
        periodPreset: preset,
        recipients: recipientList,
        isEnabled: true,
      });

      setCreated(true);
      router.refresh();
    } catch (caught) {
      setError(reportingErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        aria-label={`Schedule delivery of ${reportName}`}
        leftIcon={<CalendarClock aria-hidden="true" className="h-4 w-4" />}
        onClick={() => {
          setCreated(false);
          setError(null);
          setOpen(true);
        }}
        size="xs"
        variant="secondary"
      >
        Schedule
      </Button>

      <Dialog
        busy={busy}
        description={`Each run executes under your access, so recipients receive only rows you can see. Runs fire in ${timezone}, the workspace timezone.`}
        footer={
          created ? (
            <Button onClick={() => setOpen(false)} variant="primary">
              Close
            </Button>
          ) : (
            <>
              <Button
                disabled={busy}
                onClick={() => setOpen(false)}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                disabled={!canSave}
                loading={busy}
                onClick={() => void submit()}
                variant="primary"
              >
                Create schedule
              </Button>
            </>
          )
        }
        onClose={() => setOpen(false)}
        open={open}
        size="lg"
        title={`Schedule "${reportName}"`}
      >
        {created ? (
          <p className="text-sm leading-6 text-foreground" role="status">
            The schedule is created and enabled. It appears under Scheduled,
            where it can be paused or deleted.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              className="md:col-span-2"
              label="Schedule name"
              onChange={setName}
              required
              value={name}
            />

            <SelectField
              label="How often"
              onChange={setFrequency}
              options={FREQUENCY_OPTIONS.map((option) => ({ ...option }))}
              value={frequency}
            />

            <NumberField
              hint={`On the hour, in ${timezone}.`}
              label="Hour of day (0-23)"
              max={23}
              min={0}
              onChange={setHour}
              required
              value={hour}
            />

            {frequency === "WEEKLY" ? (
              <SelectField
                label="Day of the week"
                onChange={setDayOfWeek}
                options={DAY_OF_WEEK_OPTIONS.map((option) => ({ ...option }))}
                value={dayOfWeek}
              />
            ) : null}

            {frequency === "MONTHLY" ? (
              <NumberField
                hint="1-28. Later days are refused rather than silently clamped, so a schedule cannot mean a different date in February."
                label="Day of the month"
                max={28}
                min={1}
                onChange={setDayOfMonth}
                value={dayOfMonth}
              />
            ) : null}

            <SelectField
              label="Format"
              onChange={setFormat}
              options={FORMAT_OPTIONS.map((option) => ({ ...option }))}
              value={format}
            />

            <SelectField
              hint="Resolved fresh on every run, so a weekly 'last 7 days' always means the week just finished."
              label="Period each run covers"
              onChange={setPreset}
              options={PERIOD_PRESET_OPTIONS.filter(
                (option) => option.value !== "custom",
              ).map((option) => ({ ...option }))}
              value={preset}
            />

            <TextAreaField
              className="md:col-span-2"
              hint="Work email addresses, one per line or comma-separated. Each must belong to a user in this workspace - an address that does not resolve is refused rather than skipped."
              label="Recipients"
              onChange={setRecipients}
              placeholder="hana@example.com, omar@example.com"
              required
              rows={3}
              value={recipients}
            />

            {error ? (
              <p className="text-sm text-danger md:col-span-2" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </Dialog>
    </>
  );
}
