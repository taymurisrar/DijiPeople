"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SideToast } from "@/app/components/notifications";
import { PermissionGate } from "../../_components/permission-gate";
import { useDialogBehavior } from "@/app/components/ui/dialog";
import type {
  TimesheetDay,
  TimesheetRecord,
  TimesheetWeek,
  TimesheetWeekEntry,
} from "../types";

type ProjectOption = {
  readonly id: string;
  readonly name: string;
  readonly code?: string | null;
  readonly projectAssignmentId?: string | null;
  readonly billable?: boolean;
};
type LookupOption = ProjectOption;

type DraftEntry = Omit<TimesheetWeekEntry, "id" | "hours"> & {
  clientId: string;
  id?: string;
  hours: string;
};
type DraftDay = Omit<TimesheetDay, "entries"> & { entries: DraftEntry[] };
type DraftWeek = Omit<TimesheetWeek, "days"> & { days: DraftDay[] };
type TimesheetNotification = {
  title: string;
  description?: string;
  variant: "success" | "warning" | "error";
};

export function TimesheetMONTHLYEditor({
  projectOptions = [],
  workLocationOptions = [],
  timesheet,
}: {
  projectOptions?: readonly ProjectOption[];
  workLocationOptions?: readonly LookupOption[];
  settings?: Record<string, unknown>;
  timesheet: TimesheetRecord;
}) {
  const router = useRouter();
  const [weeks, setWeeks] = useState<DraftWeek[]>(() => draftWeeks(timesheet));
  const [busyWeekId, setBusyWeekId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] =
    useState<TimesheetNotification | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [lateOverrideOpen, setLateOverrideOpen] = useState(false);

  // BUG-0043: kept its own layout, gained the guarantees it never had - focus
  // containment, Escape, focus restore and an accessible name.
  const lateOverrideDialog = useDialogBehavior({
    open: lateOverrideOpen,
    onClose: () => setLateOverrideOpen(false),
  });
  const [lateOverrideWeekId, setLateOverrideWeekId] = useState("");
  const [lateOverrideReason, setLateOverrideReason] = useState("");
  const [commentByWeek, setCommentByWeek] = useState<Record<string, string>>(
    {},
  );
  const [trackerByWeek, setTrackerByWeek] = useState<
    Record<string, ApprovalTracker | null>
  >({});
  const attendanceEnabled = !["INDEPENDENT", "DISABLED"].includes(
    timesheet.settings?.attendanceIntegrationMode ?? "INDEPENDENT",
  );
  const lateOverrideWeeks = weeks.filter(
    (week) => week.canOverrideLateSubmission,
  );

  const totals = useMemo(
    () => ({
      required: weeks.reduce((sum, week) => sum + week.requiredHours, 0),
      entered: weeks.reduce(
        (sum, week) =>
          sum +
          week.days.reduce(
            (dayTotal, day) =>
              dayTotal +
              day.entries.reduce(
                (entryTotal, entry) => entryTotal + Number(entry.hours || 0),
                0,
              ),
            0,
          ),
        0,
      ),
      attendance: weeks.reduce(
        (sum, week) =>
          sum +
          week.days.reduce(
            (dayTotal, day) => dayTotal + day.attendanceHours,
            0,
          ),
        0,
      ),
    }),
    [weeks],
  );

  function updateEntry(
    weekId: string,
    dayId: string,
    clientId: string,
    patch: Partial<DraftEntry>,
  ) {
    setWeeks((current) =>
      current.map((week) =>
        week.id === weekId
          ? {
              ...week,
              days: week.days.map((day) =>
                day.id === dayId
                  ? {
                      ...day,
                      entries: day.entries.map((entry) =>
                        entry.clientId === clientId
                          ? { ...entry, ...patch }
                          : entry,
                      ),
                    }
                  : day,
              ),
            }
          : week,
      ),
    );
  }

  function addEntry(weekId: string, dayId: string) {
    setWeeks((current) =>
      current.map((week) =>
        week.id === weekId
          ? {
              ...week,
              days: week.days.map((day) =>
                day.id === dayId
                  ? {
                      ...day,
                      entries: [...day.entries, emptyEntry(projectOptions[0])],
                    }
                  : day,
              ),
            }
          : week,
      ),
    );
  }

  function removeEntry(weekId: string, dayId: string, clientId: string) {
    setWeeks((current) =>
      current.map((week) =>
        week.id === weekId
          ? {
              ...week,
              days: week.days.map((day) =>
                day.id === dayId
                  ? {
                      ...day,
                      entries: day.entries.filter(
                        (entry) => entry.clientId !== clientId,
                      ),
                    }
                  : day,
              ),
            }
          : week,
      ),
    );
  }

  async function saveWeek(week: DraftWeek) {
    const clientError = validateWeek(week);
    if (clientError) {
      setError(clientError);
      return null;
    }
    return requestWeek(
      week.id,
      "entries",
      "PATCH",
      {
        weekVersion: week.version,
        days: week.days
          .filter((day) => !day.isLocked)
          .map((day) => ({
            dayId: day.id,
            version: day.version,
            entries: day.entries.map((entry) => ({
              ...(entry.id ? { id: entry.id } : {}),
              projectId: entry.projectId || null,
              projectAssignmentId:
                projectOptions.find((project) => project.id === entry.projectId)
                  ?.projectAssignmentId ??
                entry.projectAssignmentId ??
                null,
              workLocationId: entry.workLocationId || null,
              hours: entry.hours,
              notes: entry.notes || null,
            })),
          })),
      },
      "Week saved and recalculated.",
    );
  }

  async function copyPreviousWeek(week: DraftWeek) {
    const copied = await requestWeek(
      week.id,
      "copy-previous",
      "POST",
      { weekVersion: week.version },
    );
    if (!copied) return;
    setNotification({
      title: "Previous week copied",
      description: copied.warnings?.[0],
      variant: copied.warnings?.length ? "warning" : "success",
    });
  }

  async function submitTimesheet() {
    setError(null);
    let latestWeeks = weeks;
    const editableWeekIds = weeks
      .filter((week) => week.canEdit)
      .map((week) => week.id);

    for (const weekId of editableWeekIds) {
      const currentWeek = latestWeeks.find((week) => week.id === weekId);
      if (!currentWeek?.canEdit) continue;

      const saved = await saveWeek(currentWeek);
      if (!saved) return;
      latestWeeks = draftWeeks(saved);
    }

    const eligibleWeekIds = latestWeeks
      .filter((week) => week.canSubmit)
      .map((week) => week.id);
    if (!eligibleWeekIds.length) {
      setError(
        "No week is ready to submit. Complete the required project hours first.",
      );
      return;
    }

    for (const weekId of eligibleWeekIds) {
      const currentWeek = latestWeeks.find((week) => week.id === weekId);
      if (!currentWeek?.canSubmit) continue;

      const submitted = await requestWeek(
        currentWeek.id,
        "submit",
        "POST",
        { weekVersion: currentWeek.version },
      );
      if (!submitted) return;
      latestWeeks = draftWeeks(submitted);
    }
    setNotification({
      title: "Timesheet submitted",
      description: "Submitted weeks are now locked.",
      variant: "success",
    });
  }

  async function requestCorrection() {
    const reason = correctionReason.trim();
    if (!reason) {
      setError("Enter the correction required before unlocking the timesheet.");
      return;
    }
    setError(null);
    const response = await fetch(`/api/timesheets/${timesheet.id}/correction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = (await response.json().catch(() => ({}))) as TimesheetRecord & {
      message?: string | string[];
    };
    if (!response.ok) {
      setError(readMessage(data.message));
      return;
    }
    if (Array.isArray(data.weeks)) setWeeks(draftWeeks(data));
    setCorrectionOpen(false);
    setCorrectionReason("");
    setNotification({
      title: "Correction requested",
      description: "The affected weeks are unlocked.",
      variant: "success",
    });
    router.refresh();
  }

  async function grantLateSubmissionOverride() {
    const week = weeks.find((item) => item.id === lateOverrideWeekId);
    if (!week) {
      setError("Select a week to override.");
      return;
    }
    const reason = lateOverrideReason.trim();
    if (!reason) {
      setError("Enter an override reason.");
      return;
    }
    const updated = await requestWeek(
      week.id,
      "late-submission-override",
      "POST",
      { weekVersion: week.version, reason },
    );
    if (!updated) return;
    setLateOverrideOpen(false);
    setLateOverrideWeekId("");
    setLateOverrideReason("");
    setNotification({
      title: "Late submission allowed",
      description: `Week ${week.weekNumber} can now be submitted.`,
      variant: "success",
    });
  }

  async function requestWeek(
    weekId: string,
    action: string,
    method: "GET" | "POST" | "PATCH",
    body?: unknown,
    successMessage?: string,
  ) {
    setBusyWeekId(weekId);
    setError(null);
    setNotification(null);
    try {
      const response = await fetch(
        `/api/timesheets/${timesheet.id}/weeks/${weekId}/${action}`,
        {
          method,
          headers:
            body === undefined
              ? undefined
              : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      const data = (await response.json()) as TimesheetRecord & {
        message?: string | string[];
        warnings?: string[];
      };
      if (!response.ok) throw new Error(readMessage(data.message));
      if (Array.isArray(data.weeks)) setWeeks(draftWeeks(data));
      if (successMessage) {
        setNotification({ title: successMessage, variant: "success" });
      }
      router.refresh();
      return data;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The timesheet action failed.",
      );
      return null;
    } finally {
      setBusyWeekId(null);
    }
  }

  async function loadTracker(week: DraftWeek) {
    setBusyWeekId(week.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/timesheets/${timesheet.id}/weeks/${week.id}/approval`,
      );
      const data = (await response.json()) as {
        item?: ApprovalTracker | null;
        history?: ApprovalTracker["history"];
        message?: string;
      };
      if (!response.ok)
        throw new Error(data.message ?? "Unable to load approval progress.");
      setTrackerByWeek((current) => ({
        ...current,
        [week.id]: data.item
          ? { ...data.item, history: data.history ?? [] }
          : null,
      }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load approval progress.",
      );
    } finally {
      setBusyWeekId(null);
    }
  }

  async function handoffToPayroll() {
    setBusyWeekId("payroll-handoff");
    setError(null);
    setNotification(null);
    try {
      const response = await fetch(
        `/api/timesheets/${timesheet.id}/payroll-handoff`,
        { method: "POST" },
      );
      const data = (await response.json()) as { message?: string | string[] };
      if (!response.ok) throw new Error(readMessage(data.message));
      setNotification({
        title: "Sent to payroll",
        description: "Approved time is now locked.",
        variant: "success",
      });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to hand off this timesheet to payroll.",
      );
    } finally {
      setBusyWeekId(null);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
        <Link
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground"
          href="/timesheets"
        >
          ← Back
        </Link>
        <PermissionGate permission="timesheets.submit">
          <button
            className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busyWeekId !== null}
            onClick={() => void submitTimesheet()}
            type="button"
          >
            Submit timesheet
          </button>
        </PermissionGate>
        {timesheet.canCurrentUserReject ? (
          <PermissionGate permission="timesheets.reject">
            <button
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 disabled:opacity-50"
              disabled={busyWeekId !== null}
              onClick={() => setCorrectionOpen(true)}
              type="button"
            >
              Request correction & unlock
            </button>
          </PermissionGate>
        ) : null}
        {timesheet.payrollStatus === "READY" ? (
          <PermissionGate permission="timesheets.payroll.handoff">
            <button
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
              disabled={busyWeekId === "payroll-handoff"}
              onClick={() => void handoffToPayroll()}
              type="button"
            >
              Send to payroll
            </button>
          </PermissionGate>
        ) : null}
        {lateOverrideWeeks.length ? (
          <PermissionGate permission="timesheets.override">
            <button
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
              onClick={() => {
                setLateOverrideWeekId(lateOverrideWeeks[0]?.id ?? "");
                setLateOverrideOpen(true);
              }}
              type="button"
            >
              Allow late submission
            </button>
          </PermissionGate>
        ) : null}
        <PermissionGate permission="timesheets.export">
          <div className="ml-auto inline-flex overflow-hidden rounded-xl border border-border bg-white">
            <span className="px-3 py-2 text-sm font-medium text-foreground">
              Export
            </span>
            {(["XLSX", "CSV", "PDF"] as const).map((format) => (
              <a
                className="border-l border-border px-3 py-2 text-sm text-accent hover:bg-surface"
                href={`/api/timesheets/${timesheet.id}/export?format=${format}`}
                key={format}
              >
                {format}
              </a>
            ))}
          </div>
        </PermissionGate>
      </div>
      {lateOverrideOpen ? (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/35 p-4"
          {...lateOverrideDialog.backdropProps}
        >
          <div
            {...lateOverrideDialog.panelProps}
            className="grid w-full max-w-lg gap-4 rounded-2xl border border-border bg-white p-5 shadow-2xl"
          >
            <div>
              <h3
                className="text-lg font-semibold text-foreground"
                id={lateOverrideDialog.titleId}
              >
                Allow late submission
              </h3>
              <p className="mt-1 text-sm text-muted">
                Grant a one-time, audited deadline override.
              </p>
            </div>
            <label className="grid gap-1 text-sm font-medium text-foreground">
              Week
              <select
                className="rounded-xl border border-border bg-white px-3 py-2 outline-none focus:border-accent"
                onChange={(event) => setLateOverrideWeekId(event.target.value)}
                value={lateOverrideWeekId}
              >
                {lateOverrideWeeks.map((week) => (
                  <option key={week.id} value={week.id}>
                    Week {week.weekNumber} · {shortDate(week.startDate)}–
                    {shortDate(week.endDate)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-foreground">
              Reason
              <textarea
                autoFocus
                className="min-h-24 rounded-xl border border-border px-3 py-2 outline-none focus:border-accent"
                maxLength={1000}
                onChange={(event) => setLateOverrideReason(event.target.value)}
                placeholder="Explain why late submission is being allowed."
                value={lateOverrideReason}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-xl border border-border px-3 py-2 text-sm font-medium"
                onClick={() => {
                  setLateOverrideOpen(false);
                  setLateOverrideReason("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busyWeekId !== null}
                onClick={() => void grantLateSubmissionOverride()}
                type="button"
              >
                Grant override
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {correctionOpen ? (
        <div className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm font-medium text-amber-950">
            Correction required
            <textarea
              autoFocus
              className="min-h-20 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-amber-500"
              maxLength={1000}
              onChange={(event) => setCorrectionReason(event.target.value)}
              placeholder="Tell the employee exactly what needs to be corrected."
              value={correctionReason}
            />
          </label>
          <div className="flex gap-2">
            <button
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium"
              onClick={() => {
                setCorrectionOpen(false);
                setCorrectionReason("");
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-xl bg-amber-700 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => void requestCorrection()}
              type="button"
            >
              Unlock & notify
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Completion"
          value={`${timesheet.completionPercentage.toFixed(0)}%`}
        />
        <Metric
          label="Required (work schedule)"
          value={`${totals.required.toFixed(2)} h`}
        />
        <Metric label="Entered" value={`${totals.entered.toFixed(2)} h`} />
        {attendanceEnabled ? (
          <Metric
            label="Attendance"
            value={`${totals.attendance.toFixed(2)} h`}
          />
        ) : (
          <Metric label="Status" value={friendly(timesheet.status)} />
        )}
      </div>

      <div className="rounded-[22px] border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Weekly timesheet
            </p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">
              {timesheet.employee.fullName} ·{" "}
              {monthLabel(timesheet.month, timesheet.year)}
            </h3>
            <p className="mt-1 text-sm text-muted">
              Work schedule, holidays, approved leave, attendance variance,
              projects, and approval status are resolved per day.
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            {timesheet.payrollStatus === "BLOCKED" &&
            timesheet.payrollBlockers.length ? (
              <details className="relative">
                <summary className="cursor-pointer list-none">
                  Payroll:{" "}
                  <strong className="text-rose-700">Blocked</strong>{" "}
                  <span>({timesheet.payrollBlockers.length})</span>
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-border bg-white p-3 text-left shadow-xl">
                  <p className="font-semibold text-foreground">
                    Payroll blockers
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
                    {timesheet.payrollBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              </details>
            ) : (
              <p>
                Payroll:{" "}
                <strong className="text-foreground">
                  {friendly(timesheet.payrollStatus)}
                </strong>
              </p>
            )}
            <p>
              Policy:{" "}
              <strong className="text-foreground">
                {timesheet.policyVersion
                  ? `v${timesheet.policyVersion}`
                  : "Tenant defaults"}
              </strong>
            </p>
          </div>
        </div>
      </div>

      {weeks.length ? (
        weeks.map((week, index) => (
          <details
            className="rounded-[22px] border border-border bg-surface shadow-sm"
            key={week.id}
            open={
              index === 0 ||
              week.status === "REJECTED" ||
              week.status === "OVERDUE"
            }
          >
            <summary className="cursor-pointer list-none px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">
                    Week {week.weekNumber} · {shortDate(week.startDate)}–
                    {shortDate(week.endDate)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {week.enteredHours.toFixed(2)} /{" "}
                    {week.requiredHours.toFixed(2)} h · due{" "}
                    {week.submissionDeadline
                      ? new Date(week.submissionDeadline).toLocaleString()
                      : "not configured"}
                  </p>
                </div>
                <Status value={week.status} />
              </div>
            </summary>

            <div className="border-t border-border px-4 py-4">
              <div className="grid gap-3">
                {week.days.map((day) => (
                  <DayEditor
                    day={day}
                    editable={week.canEdit && !day.isLocked}
                    key={day.id}
                    onAdd={() => addEntry(week.id, day.id)}
                    onChange={(clientId, patch) =>
                      updateEntry(week.id, day.id, clientId, patch)
                    }
                    onRemove={(clientId) =>
                      removeEntry(week.id, day.id, clientId)
                    }
                    projects={projectOptions}
                    attendanceEnabled={attendanceEnabled}
                    workLocations={workLocationOptions}
                  />
                ))}
              </div>

              {week.rejectionReason ? (
                <Notice tone="error">Rejected: {week.rejectionReason}</Notice>
              ) : null}
              {week.reopeningRequests.map((request) => (
                <div
                  className="mt-3 rounded-xl border border-border bg-surface-muted px-3 py-3 text-sm"
                  key={request.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong>Reopening {friendly(request.status)}</strong>
                      <p className="mt-1 text-muted">{request.reason}</p>
                      {request.decisionReason ? (
                        <p className="mt-1 text-muted">
                          Decision: {request.decisionReason}
                        </p>
                      ) : null}
                    </div>
                    {request.canDecide ? (
                      <PermissionGate permission="timesheets.approve">
                        <div className="flex gap-2">
                          <button
                            className="rounded-xl bg-emerald-600 px-3 py-2 font-semibold text-white"
                            onClick={() =>
                              requestWeek(
                                week.id,
                                `reopening-requests/${request.id}`,
                                "PATCH",
                                {
                                  approve: true,
                                  reason: commentByWeek[week.id] || undefined,
                                },
                                "Reopening approved.",
                              )
                            }
                            type="button"
                          >
                            Approve reopening
                          </button>
                          <button
                            className="rounded-xl bg-rose-600 px-3 py-2 font-semibold text-white"
                            onClick={() =>
                              commentByWeek[week.id]?.trim()
                                ? requestWeek(
                                    week.id,
                                    `reopening-requests/${request.id}`,
                                    "PATCH",
                                    {
                                      approve: false,
                                      reason: commentByWeek[week.id],
                                    },
                                    "Reopening rejected.",
                                  )
                                : setError(
                                    "Enter a reason before rejecting reopening.",
                                  )
                            }
                            type="button"
                          >
                            Reject reopening
                          </button>
                        </div>
                      </PermissionGate>
                    ) : null}
                  </div>
                </div>
              ))}
              {trackerByWeek[week.id] !== undefined ? (
                <ApprovalProgress tracker={trackerByWeek[week.id]} />
              ) : null}
              {week.canSubmit ||
              week.canApprove ||
              week.canReject ||
              week.canWithdraw ||
              week.reopeningRequests.some((request) => request.canDecide) ||
              ["APPROVED", "PAYROLL_READY", "LOCKED"].includes(week.status) ? (
                <label className="mt-4 grid max-w-xl gap-1 text-xs font-medium text-foreground">
                  Comment {week.status === "OVERDUE" ? "or late reason" : ""}
                  <textarea
                    className="min-h-20 rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                    maxLength={1000}
                    onChange={(event) =>
                      setCommentByWeek((current) => ({
                        ...current,
                        [week.id]: event.target.value,
                      }))
                    }
                    value={commentByWeek[week.id] ?? ""}
                  />
                </label>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {week.canEdit ? (
                  <PermissionGate permission="timesheets.write">
                    <Action
                      disabled={busyWeekId === week.id}
                      onClick={() => saveWeek(week)}
                    >
                      Save draft
                    </Action>
                  </PermissionGate>
                ) : null}
                {week.canEdit &&
                index > 0 &&
                timesheet.settings?.allowCopyPreviousWeek !== false ? (
                  <PermissionGate permission="timesheets.write">
                    <button
                      className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                      disabled={
                        busyWeekId === week.id || weekHasMeaningfulEntries(week)
                      }
                      onClick={() => void copyPreviousWeek(week)}
                      title={
                        weekHasMeaningfulEntries(week)
                          ? "This week already has entries. Remove them before copying the previous week."
                          : "Copy the previous week's entries into this week"
                      }
                      type="button"
                    >
                      Copy previous week
                    </button>
                  </PermissionGate>
                ) : null}
                {week.canSubmit ? (
                  <PermissionGate permission="timesheets.submit">
                    <Action
                      disabled={busyWeekId === week.id}
                      onClick={() =>
                        requestWeek(
                          week.id,
                          "submit",
                          "POST",
                          {
                            weekVersion: week.version,
                            comment: commentByWeek[week.id] || undefined,
                            lateReason:
                              week.status === "OVERDUE"
                                ? commentByWeek[week.id] || undefined
                                : undefined,
                          },
                          "Week submitted through the approval matrix.",
                        )
                      }
                    >
                      Submit week
                    </Action>
                  </PermissionGate>
                ) : null}
                {week.status === "PENDING_APPROVAL" ? (
                  <button
                    className="rounded-xl border border-border px-3 py-2 text-sm text-foreground"
                    onClick={() => loadTracker(week)}
                    type="button"
                  >
                    Approval progress
                  </button>
                ) : null}
                {week.canWithdraw ? (
                  <PermissionGate permission="timesheets.withdraw">
                    <button
                      className="rounded-xl border border-border px-3 py-2 text-sm text-foreground"
                      onClick={() =>
                        requestWeek(
                          week.id,
                          "withdraw",
                          "POST",
                          { comment: commentByWeek[week.id] || undefined },
                          "Week withdrawn.",
                        )
                      }
                      type="button"
                    >
                      Withdraw
                    </button>
                  </PermissionGate>
                ) : null}
                {week.canApprove ? (
                  <PermissionGate permission="timesheets.approve">
                    <button
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                      onClick={() =>
                        requestWeek(
                          week.id,
                          "approve",
                          "POST",
                          { comment: commentByWeek[week.id] || undefined },
                          "Approval recorded.",
                        )
                      }
                      type="button"
                    >
                      Approve
                    </button>
                  </PermissionGate>
                ) : null}
                {week.canReject ? (
                  <PermissionGate permission="timesheets.reject">
                    <button
                      className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
                      onClick={() =>
                        commentByWeek[week.id]?.trim()
                          ? requestWeek(
                              week.id,
                              "reject",
                              "POST",
                              { reason: commentByWeek[week.id] },
                              "Week rejected.",
                            )
                          : setError("Enter a rejection reason first.")
                      }
                      type="button"
                    >
                      Reject
                    </button>
                  </PermissionGate>
                ) : null}
                {["APPROVED", "PAYROLL_READY", "LOCKED"].includes(
                  week.status,
                ) ? (
                  <PermissionGate permission="timesheets.reopen">
                    <button
                      className="rounded-xl border border-border px-3 py-2 text-sm text-foreground"
                      onClick={() =>
                        commentByWeek[week.id]?.trim()
                          ? requestWeek(
                              week.id,
                              "reopening-requests",
                              "POST",
                              { reason: commentByWeek[week.id] },
                              "Reopening request submitted.",
                            )
                          : setError("Enter a reopening reason first.")
                      }
                      type="button"
                    >
                      Request reopening
                    </button>
                  </PermissionGate>
                ) : null}
              </div>
            </div>
          </details>
        ))
      ) : (
        <Notice>
          No weekly hierarchy exists for this month yet. Reloading the record
          will run the idempotent generation repair.
        </Notice>
      )}

      <SideToast
        description={notification?.description}
        isOpen={Boolean(notification) && !error}
        onClose={() => setNotification(null)}
        title={notification?.title ?? ""}
        variant={notification?.variant ?? "success"}
      />
      <SideToast
        description={error ?? undefined}
        isOpen={Boolean(error)}
        onClose={() => setError(null)}
        title="Action not completed"
        variant="error"
      />
    </section>
  );
}

function weekHasMeaningfulEntries(week: DraftWeek) {
  return week.days.some((day) =>
    day.entries.some(
      (entry) =>
        Boolean(entry.projectId) ||
        Number(entry.hours || 0) > 0 ||
        Boolean(entry.notes?.trim()),
    ),
  );
}

function DayEditor({
  attendanceEnabled,
  day,
  editable,
  onAdd,
  onChange,
  onRemove,
  projects,
  workLocations,
}: {
  attendanceEnabled: boolean;
  day: DraftDay;
  editable: boolean;
  onAdd: () => void;
  onChange: (clientId: string, patch: Partial<DraftEntry>) => void;
  onRemove: (clientId: string) => void;
  projects: readonly ProjectOption[];
  workLocations: readonly LookupOption[];
}) {
  return (
    <article
      className={`rounded-2xl border p-3 ${day.completionStatus === "EXCEPTION" ? "border-rose-300 bg-rose-50/40" : "border-border bg-white/70"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-44">
          <p className="text-sm font-semibold text-foreground">
            {day.dayOfWeek.slice(0, 3)} · {shortDate(day.date)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {friendly(day.dayType)}
            {day.holidayName ? ` · ${day.holidayName}` : ""}
            {day.leaveTypeName ? ` · ${day.leaveTypeName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Pill>{day.enteredHours.toFixed(2)} entered</Pill>
          <Pill>{day.expectedHours.toFixed(2)} expected</Pill>
          {attendanceEnabled ? (
            <>
              <Pill>{day.attendanceHours.toFixed(2)} attendance</Pill>
              <Pill>
                {day.varianceMinutes > 0 ? "+" : ""}
                {day.varianceMinutes} min
              </Pill>
            </>
          ) : null}
        </div>
      </div>
      {attendanceEnabled && day.attendanceEntryId ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-sky-900">
          <span>
            Work mode: <strong>{friendly(day.attendanceMode ?? "OFFICE")}</strong>
          </span>
          <span>
            Check-in: <strong>{attendanceTime(day.attendanceCheckIn)}</strong>
          </span>
          <span>
            Check-out: <strong>{attendanceTime(day.attendanceCheckOut)}</strong>
          </span>
          <span>Status: {friendly(day.attendanceStatus ?? "PRESENT")}</span>
        </div>
      ) : null}
      {day.lockReason ? (
        <p className="mt-2 text-xs text-muted">Locked: {day.lockReason}</p>
      ) : null}
      <div className="mt-3 grid gap-2">
        {day.entries.map((entry) => (
          <div
            className="rounded-xl border border-border bg-surface p-2"
            key={entry.clientId}
          >
            <div className="grid gap-2 lg:grid-cols-[1.35fr_0.45fr_1.4fr_0.9fr_auto_auto]">
              {editable ? (
                <select
                  aria-label="Project"
                  className="rounded-lg border border-border bg-white px-2 py-2 text-sm"
                  onChange={(event) => {
                    const selected = projects.find(
                      (item) => item.id === event.target.value,
                    );
                    onChange(entry.clientId, {
                      projectId: selected?.id ?? null,
                      projectAssignmentId:
                        selected?.projectAssignmentId ?? null,
                      billable: selected?.billable ?? false,
                    });
                  }}
                  required
                  value={entry.projectId ?? ""}
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code ? `${project.code} · ` : ""}
                      {project.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-lg border border-border bg-white px-2 py-2 text-sm">
                  {entry.project
                    ? `${entry.project.code ? `${entry.project.code} · ` : ""}${entry.project.name}`
                    : "No project"}
                </span>
              )}
              <input
                aria-label="Hours"
                className="rounded-lg border border-border bg-white px-2 py-2 text-sm"
                disabled={!editable}
                inputMode="decimal"
                max="24"
                min="0.25"
                onChange={(event) =>
                  onChange(entry.clientId, { hours: event.target.value })
                }
                required
                step="0.25"
                type="number"
                value={entry.hours}
              />
              <input
                aria-label="Notes"
                className="rounded-lg border border-border bg-white px-2 py-2 text-sm"
                disabled={!editable}
                maxLength={1000}
                onChange={(event) =>
                  onChange(entry.clientId, { notes: event.target.value })
                }
                placeholder="Work note"
                value={entry.notes ?? ""}
              />
              <select
                aria-label="Work location"
                className="rounded-lg border border-border bg-white px-2 py-2 text-sm"
                disabled={!editable}
                onChange={(event) =>
                  onChange(entry.clientId, {
                    workLocationId: event.target.value || null,
                  })
                }
                value={entry.workLocationId ?? ""}
              >
                <option value="">Work location</option>
                {workLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <span
                className={`self-center rounded-full px-2.5 py-1 text-center text-xs font-medium ${(projects.find((item) => item.id === entry.projectId)?.billable ?? entry.billable) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                title="Billability is set by the project assignment."
              >
                {(projects.find((item) => item.id === entry.projectId)?.billable ?? entry.billable)
                  ? "Billable"
                  : "Non-billable"}
              </span>
              {editable ? (
                <button
                  aria-label="Remove entry"
                  className="rounded-lg border border-rose-200 px-2 text-rose-700"
                  onClick={() => onRemove(entry.clientId)}
                  type="button"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Source: {friendly(entry.source)}
            </p>
          </div>
        ))}
      </div>
      {editable ? (
        <button
          className="mt-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground"
          onClick={onAdd}
          type="button"
        >
          + Add entry
        </button>
      ) : null}
    </article>
  );
}

function ApprovalProgress({ tracker }: { tracker: ApprovalTracker | null }) {
  if (!tracker)
    return (
      <Notice>No approval workflow has been created for this week.</Notice>
    );
  return (
    <div className="mt-4 rounded-xl border border-border bg-white/70 p-3">
      <p className="text-sm font-semibold text-foreground">
        Approval progress · {friendly(tracker.status)}
      </p>
      <ol className="mt-2 grid gap-2">
        {tracker.steps.map((step) => (
          <li
            className="flex flex-wrap justify-between gap-2 text-xs"
            key={step.id}
          >
            <span>
              Step {step.stepOrder}:{" "}
              {step.assignments
                .map((assignment) =>
                  assignment.assignedToUser
                    ? `${assignment.assignedToUser.firstName} ${assignment.assignedToUser.lastName}`
                    : "Assigned role",
                )
                .join(", ")}
            </span>
            <Status value={step.status} />
          </li>
        ))}
      </ol>
      {tracker.history.length > 1 ? (
        <div className="mt-3 border-t border-border pt-2 text-xs text-muted">
          <strong className="text-foreground">Approval cycles</strong>
          <ul className="mt-1 flex flex-wrap gap-2">
            {tracker.history.map((cycle) => (
              <li
                className="rounded-lg border border-border px-2 py-1"
                key={cycle.id}
              >
                {cycle.entityId.split(":v").at(-1)
                  ? `v${cycle.entityId.split(":v").at(-1)}`
                  : "Cycle"}{" "}
                · {friendly(cycle.status)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function validateWeek(week: DraftWeek) {
  for (const day of week.days) {
    let total = 0;
    for (const entry of day.entries) {
      if (!entry.projectId)
        return `${shortDate(day.date)}: select a project for every entry.`;
      const hours = Number(entry.hours);
      if (
        !Number.isFinite(hours) ||
        hours < 0.25 ||
        hours > 24 ||
        Math.round(hours * 60) % 15 !== 0
      )
        return `${shortDate(day.date)}: hours must be 0.25–24 in 15-minute increments.`;
      total += hours;
    }
    if (total > 24) return `${shortDate(day.date)} exceeds 24 hours.`;
  }
  return null;
}

function draftWeeks(timesheet: TimesheetRecord): DraftWeek[] {
  return (timesheet.weeks ?? []).map((week) => ({
    ...week,
    days: week.days.map((day) => ({
      ...day,
      entries: day.entries
        .filter(
          (entry) =>
            Number(entry.hours) > 0 ||
            Boolean(entry.projectId) ||
            Boolean(entry.notes?.trim()),
        )
        .map(draftEntry),
    })),
  }));
}
function draftEntry(entry: TimesheetWeekEntry): DraftEntry {
  return {
    ...entry,
    clientId: entry.id || clientId(),
    hours: String(entry.hours),
  };
}
function emptyEntry(project?: ProjectOption): DraftEntry {
  return {
    clientId: clientId(),
    hours: "",
    billable: project?.billable ?? false,
    notes: "",
    projectId: project?.id ?? null,
    projectAssignmentId: project?.projectAssignmentId ?? null,
    source: "MANUAL",
    approvalStatus: "DRAFT",
  };
}
function clientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}
function shortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function attendanceTime(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
}
function monthLabel(month: number, year: number) {
  return `${new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: "long" })} ${year}`;
}
function friendly(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function readMessage(message?: string | string[]) {
  return Array.isArray(message)
    ? message.join(" ")
    : message || "The timesheet action failed.";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-surface px-2 py-1 text-muted">
      {children}
    </span>
  );
}
function Status({ value }: { value: string }) {
  const style =
    value.includes("REJECT") || value.includes("OVERDUE")
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : value.includes("APPROVED") ||
          value.includes("READY") ||
          value.includes("COMPLETE")
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-sky-200 bg-sky-50 text-sky-700";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style}`}
    >
      {friendly(value)}
    </span>
  );
}
function Action({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {disabled ? "Working…" : children}
    </button>
  );
}
function Notice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "error";
}) {
  const style =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-border bg-surface text-muted";
  return (
    <p className={`mt-3 rounded-xl border px-3 py-2 text-sm ${style}`}>
      {children}
    </p>
  );
}

type ApprovalTracker = {
  id: string;
  status: string;
  steps: Array<{
    id: string;
    stepOrder: number;
    status: string;
    assignments: Array<{
      assignedToUser?: { firstName: string; lastName: string } | null;
    }>;
  }>;
  history: Array<{
    id: string;
    entityId: string;
    status: string;
    submittedAtUtc?: string | null;
    completedAtUtc?: string | null;
  }>;
};
