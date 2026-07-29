"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SideToast } from "@/app/components/notifications";
import { Button } from "@/app/components/ui/button";
import {
  buildLocationPayload,
  captureAttendanceLocation,
} from "@/lib/location/location-capture";

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
  const [message, setMessage] = useState<string | null>(null);

  async function handleAttendanceAction(action: "check-in" | "check-out") {
    setPendingAction(action);
    setError(null);
    setMessage(null);

    try {
      const payload = await buildAttendanceActionPayload(action);
      const response = await fetch(`/api/attendance/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? `Unable to ${action}.`);
        return;
      }

      setMessage(
        action === "check-in"
          ? "Checked in with current location."
          : "Checked out with current location.",
      );
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : `Unable to ${action}.`,
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleTimesheetSubmit() {
    if (!timesheetPeriodStart) {
      setError("No draft timesheet is ready to submit.");
      return;
    }

    setPendingAction("submit-timesheet");
    setError(null);
    setMessage(null);

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
          <ActionCard
            description="Create a new leave request."
            href="/leaves/new"
            label="Request leave"
          />
        ) : null}

        {canCheckIn || canCheckOut ? (
          <ActionCard
            description={
              canCheckOut
                ? "Finish today’s attendance entry."
                : "Start today’s attendance entry."
            }
            disabled={pendingAction !== null}
            label={canCheckOut ? "Check out" : "Check in"}
            loading={
              pendingAction === "check-in" || pendingAction === "check-out"
            }
            loadingText={canCheckOut ? "Checking out..." : "Checking in..."}
            onClick={() =>
              handleAttendanceAction(canCheckOut ? "check-out" : "check-in")
            }
          />
        ) : null}

        {canSubmitTimesheet ? (
          <ActionCard
            description="Submit the current week for review."
            disabled={pendingAction !== null}
            label="Submit timesheet"
            loading={pendingAction === "submit-timesheet"}
            loadingText="Submitting..."
            onClick={handleTimesheetSubmit}
          />
        ) : null}

        {canUpdateProfile ? (
          <ActionCard
            description="Update your personal employee details."
            href="/my-profile"
            label="Update profile"
          />
        ) : null}
      </div>

      <SideToast
        description={error ?? undefined}
        isOpen={Boolean(error)}
        onClose={() => setError(null)}
        title="Action not completed"
        variant="error"
      />
      <SideToast
        description={message ?? undefined}
        isOpen={Boolean(message) && !error}
        onClose={() => setMessage(null)}
        title="Attendance updated"
        variant="success"
      />
    </section>
  );
}

async function buildAttendanceActionPayload(action: "check-in" | "check-out") {
  const context = await fetch("/api/attendance/runtime-context", {
    cache: "no-store",
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  const allowedModes = Array.isArray(context?.allowedModes)
    ? (context.allowedModes as string[])
    : [];
  const configuredDefault =
    typeof context?.defaultAttendanceMode === "string"
      ? context.defaultAttendanceMode
      : "";
  const attendanceMode = allowedModes.includes(configuredDefault)
    ? configuredDefault
    : allowedModes.includes("OFFICE")
      ? "OFFICE"
      : allowedModes.includes("REMOTE")
        ? "REMOTE"
        : "HYBRID";
  const location = await captureAttendanceLocation({
    timeoutSeconds: readNumber(context?.policy?.locationTimeoutSeconds, 15),
    retryAttempts: readNumber(context?.policy?.locationRetryAttempts, 2),
    highAccuracy: readBoolean(context?.policy?.highAccuracyLocation, true),
  });
  if (!location.ok) throw new Error(location.message);

  const locationPayload = buildLocationPayload(location, {
    userAgent:
      typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  });

  if (action === "check-out") {
    return {
      ...locationPayload,
      checkOutAddressText: location.addressText,
    };
  }

  return {
    attendanceMode,
    officeLocationId:
      attendanceMode === "OFFICE" ? context?.workSites?.[0]?.id : undefined,
    ...locationPayload,
    checkInAddressText: location.addressText,
  };
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ActionCard({
  description,
  disabled,
  href,
  label,
  loading,
  loadingText,
  onClick,
}: {
  description: string;
  disabled?: boolean;
  href?: string;
  label: string;
  loading?: boolean;
  loadingText?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="block text-sm font-semibold text-foreground">
        {label}
      </span>
      <span className="mt-2 block text-sm font-normal leading-6 text-muted">
        {description}
      </span>
    </>
  );

  if (href) {
    return (
      <Button href={href} variant="card" className="w-full">
        {content}
      </Button>
    );
  }

  return (
    <Button
      variant="card"
      className="w-full"
      disabled={disabled}
      loading={loading}
      loadingText={loadingText}
      onClick={onClick}
      type="button"
    >
      {content}
    </Button>
  );
}
