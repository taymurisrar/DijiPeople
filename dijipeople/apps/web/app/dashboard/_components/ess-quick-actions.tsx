"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type EssQuickActionsProps = {
  canCheckIn: boolean;
  canCheckOut: boolean;
  canRequestLeave: boolean;
  canSubmitTimesheet: boolean;
  canUpdateProfile: boolean;
  timesheetPeriodStart?: string | null;
};

export function EssQuickActions({
  canCheckIn,
  canCheckOut,
  canRequestLeave,
  canSubmitTimesheet,
  canUpdateProfile,
  timesheetPeriodStart,
}: EssQuickActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<
    "check-in" | "check-out" | "submit-timesheet" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAttendanceAction(action: "check-in" | "check-out") {
    setPendingAction(action);
    setError(null);

    const response = await fetch(`/api/attendance/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? `Unable to ${action}.`);
      setPendingAction(null);
      return;
    }

    router.refresh();
    setPendingAction(null);
  }

  async function handleTimesheetSubmit() {
    if (!timesheetPeriodStart) {
      setError("No draft timesheet is ready to submit.");
      return;
    }

    setPendingAction("submit-timesheet");
    setError(null);

    const response = await fetch("/api/timesheets/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        periodStart: timesheetPeriodStart,
      }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to submit timesheet.");
      setPendingAction(null);
      return;
    }

    router.refresh();
    setPendingAction(null);
  }

  return (
    <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Quick Actions
          </p>
          <h4 className="mt-2 text-2xl font-semibold text-foreground">
            Complete common employee tasks fast.
          </h4>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {canRequestLeave ? (
          <ActionLink
            description="Create a new leave request."
            href="/dashboard/leave/new"
            label="Request leave"
          />
        ) : null}

        {canCheckIn || canCheckOut ? (
          <ActionButton
            description={
              canCheckOut
                ? "Finish today’s attendance entry."
                : "Start today’s attendance entry."
            }
            disabled={pendingAction !== null}
            label={canCheckOut ? "Check out" : "Check in"}
            onClick={() =>
              handleAttendanceAction(canCheckOut ? "check-out" : "check-in")
            }
            pendingLabel={
              canCheckOut ? "Checking out..." : "Checking in..."
            }
            pendingState={
              pendingAction === "check-in" || pendingAction === "check-out"
            }
          />
        ) : null}

        {canSubmitTimesheet ? (
          <ActionButton
            description="Submit the current week for review."
            disabled={pendingAction !== null}
            label="Submit timesheet"
            onClick={handleTimesheetSubmit}
            pendingLabel="Submitting..."
            pendingState={pendingAction === "submit-timesheet"}
          />
        ) : null}

        {canUpdateProfile ? (
          <ActionLink
            description="Update your personal employee details."
            href="/dashboard/profile"
            label="Update profile"
          />
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ActionLink({
  description,
  href,
  label,
}: {
  description: string;
  href: string;
  label: string;
}) {
  return (
    <Link
      className="rounded-[22px] border border-border bg-white/90 p-5 transition hover:border-accent/30 hover:bg-accent-soft/20"
      href={href}
    >
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </Link>
  );
}

function ActionButton({
  description,
  disabled,
  label,
  onClick,
  pendingLabel,
  pendingState,
}: {
  description: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
  pendingLabel: string;
  pendingState: boolean;
}) {
  return (
    <button
      className="rounded-[22px] border border-border bg-white/90 p-5 text-left transition hover:border-accent/30 hover:bg-accent-soft/20 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <p className="text-sm font-semibold text-foreground">
        {pendingState ? pendingLabel : label}
      </p>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </button>
  );
}

