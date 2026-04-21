"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  AttendanceEntryRecord,
  AttendanceLocationOption,
  AttendanceMode,
} from "../types";
import { Button } from "@/app/components/ui/button";
import { AttendanceStatusBadge } from "./attendance-status-badge";

type AttendanceCheckWidgetProps = {
  activeEntry: AttendanceEntryRecord | null;
  locations: AttendanceLocationOption[];
  todayEntry: AttendanceEntryRecord | null;
};

export function AttendanceCheckWidget({
  activeEntry,
  locations,
  todayEntry,
}: AttendanceCheckWidgetProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checkInMode, setCheckInMode] = useState<AttendanceMode>("OFFICE");
  const [officeLocationId, setOfficeLocationId] = useState(
    locations[0]?.id ?? "",
  );
  const [checkInNote, setCheckInNote] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [checkOutNote, setCheckOutNote] = useState("");
  const [remoteLocation, setRemoteLocation] = useState<{
    latitude?: number;
    longitude?: number;
    addressText?: string;
  }>({});

  const openEntry = activeEntry;
  const latestEntry = activeEntry ?? todayEntry;
  const canCheckIn = activeEntry === null;
  const canCheckOut = activeEntry?.canCurrentUserCheckOut ?? false;
  const activeMode = useMemo(
    () => openEntry?.attendanceMode ?? checkInMode,
    [openEntry?.attendanceMode, checkInMode],
  );

  async function captureBrowserLocation() {
    if (!navigator.geolocation) {
      setError("Browser geolocation is not available on this device.");
      return;
    }

    setIsCapturingLocation(true);
    setError(null);
    setMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        let addressText: string | undefined;

        try {
          const response = await fetch(
            `/api/attendance/reverse-geocode?latitude=${latitude}&longitude=${longitude}`,
          );

          if (response.ok) {
            const data = (await response.json()) as { addressText?: string | null };
            addressText = data.addressText ?? undefined;
          }
        } catch {
          addressText = undefined;
        }

        setRemoteLocation({
          latitude,
          longitude,
          addressText,
        });
        setIsCapturingLocation(false);
        setMessage(
          addressText
            ? `Current location captured: ${addressText}`
            : "Current location captured for remote attendance.",
        );
      },
      (geoError) => {
        setIsCapturingLocation(false);
        setError(
          geoError.message || "Location permission was denied or unavailable.",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }

  async function performCheckIn() {
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attendanceMode: checkInMode,
          officeLocationId:
            checkInMode === "OFFICE" ? officeLocationId || undefined : undefined,
          note: checkInNote || undefined,
          workSummary: workSummary || undefined,
          remoteLatitude:
            checkInMode === "REMOTE" ? remoteLocation.latitude : undefined,
          remoteLongitude:
            checkInMode === "REMOTE" ? remoteLocation.longitude : undefined,
          remoteAddressText:
            checkInMode === "REMOTE" ? remoteLocation.addressText : undefined,
        }),
      });

      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? "Unable to check in.");
        setIsSubmitting(false);
        return;
      }

      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to check in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function performCheckOut() {
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: checkOutNote || undefined,
          workSummary: workSummary || undefined,
          remoteLatitude:
            activeMode === "REMOTE" ? remoteLocation.latitude : undefined,
          remoteLongitude:
            activeMode === "REMOTE" ? remoteLocation.longitude : undefined,
          remoteAddressText:
            activeMode === "REMOTE" ? remoteLocation.addressText : undefined,
        }),
      });

      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? "Unable to check out.");
        setIsSubmitting(false);
        return;
      }

      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to check out.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Attendance
          </p>
          <h4 className="text-2xl font-semibold text-foreground">
            {openEntry
              ? "Your attendance session is in progress."
              : todayEntry?.checkOutAt
                ? "Your last attendance session is closed. Start a new one if needed."
                : "Check in with the right attendance mode for today."}
          </h4>
          <p className="max-w-2xl text-muted">
            Office and remote attendance use the same flow, while the system
            keeps the data ready for exports, reporting, payroll, and future
            device integrations.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
<Button
  variant="primary"
  size="lg"
  disabled={isSubmitting || !canCheckIn}
  loading={isSubmitting && canCheckIn}
  loadingText="Checking in..."
  onClick={performCheckIn}
  type="button"
>
  Check in
</Button>
<Button
  variant="secondary"
  size="lg"
  disabled={isSubmitting || !canCheckOut}
  loading={isSubmitting && canCheckOut}
  loadingText="Checking out..."
  onClick={performCheckOut}
  type="button"
  className="text-muted hover:text-foreground"
>
  Check out
</Button>
        </div>
      </div>

      {openEntry ? (
        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <InfoTile
            label="Status"
            value={<AttendanceStatusBadge status={openEntry.status} />}
          />
          <InfoTile
            label="Mode"
            value={formatAttendanceMode(openEntry.attendanceMode)}
          />
          <InfoTile
            label="Check in"
            value={
              openEntry.checkInAt ? formatDateTime(openEntry.checkInAt) : "Not recorded"
            }
          />
          <InfoTile
            label="Check out"
            value={
              openEntry.checkOutAt
                ? formatDateTime(openEntry.checkOutAt)
                : "Pending"
            }
          />
          <InfoTile
            label="Location"
            value={
              openEntry.officeLocation?.name ??
              openEntry.remoteAddressText ??
              "No location captured"
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Attendance mode</span>
            <select
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) =>
                setCheckInMode(event.target.value as AttendanceMode)
              }
              value={checkInMode}
            >
              <option value="OFFICE">Office</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </label>

          {checkInMode === "OFFICE" ? (
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Office location</span>
              <select
                className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                onChange={(event) => setOfficeLocationId(event.target.value)}
                value={officeLocationId}
              >
                <option value="">Select office location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} ({location.city})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-white/80 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Remote location capture
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Capture browser coordinates when remote work policies require
                    location proof.
                  </p>
                </div>
                <button
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                  disabled={isCapturingLocation}
                  onClick={captureBrowserLocation}
                  type="button"
                >
                  {isCapturingLocation ? "Capturing..." : "Use current location"}
                </button>
              </div>
              {remoteLocation.latitude && remoteLocation.longitude ? (
                <p className="mt-3 text-sm text-muted">
                  Captured:{" "}
                  {remoteLocation.addressText ??
                    `${remoteLocation.latitude}, ${remoteLocation.longitude}`}
                </p>
              ) : null}
            </div>
          )}

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Check-in note</span>
            <textarea
              className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) => setCheckInNote(event.target.value)}
              placeholder="Optional details, remote note, or late reason."
              value={checkInNote}
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Work summary</span>
            <textarea
              className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) => setWorkSummary(event.target.value)}
              placeholder="Optional summary for today."
              value={workSummary}
            />
          </label>
        </div>
      )}

      {!openEntry && todayEntry?.checkOutAt ? (
        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <InfoTile
            label="Last status"
            value={<AttendanceStatusBadge status={todayEntry.status} />}
          />
          <InfoTile
            label="Last mode"
            value={formatAttendanceMode(todayEntry.attendanceMode)}
          />
          <InfoTile
            label="Last check in"
            value={
              todayEntry.checkInAt
                ? formatDateTime(todayEntry.checkInAt)
                : "Not recorded"
            }
          />
          <InfoTile
            label="Last check out"
            value={
              todayEntry.checkOutAt
                ? formatDateTime(todayEntry.checkOutAt)
                : "Pending"
            }
          />
          <InfoTile
            label="Last location"
            value={
              todayEntry.officeLocation?.name ??
              todayEntry.remoteAddressText ??
              "No location captured"
            }
          />
        </div>
      ) : null}

      {openEntry && !canCheckOut && openEntry.checkOutBlockedReason ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Check-out unavailable: {openEntry.checkOutBlockedReason}
        </p>
      ) : null}

      {openEntry ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Check-out note</span>
            <textarea
              className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) => setCheckOutNote(event.target.value)}
              placeholder="Optional note for checkout or exception handling."
              value={checkOutNote}
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Work summary</span>
            <textarea
              className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) => setWorkSummary(event.target.value)}
              placeholder="Optional end-of-day summary."
              value={workSummary}
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {!error && message ? (
        <p className="mt-4 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function InfoTile({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-border bg-white/80 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-2 text-sm font-medium text-foreground">{value}</div>
    </article>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function formatAttendanceMode(value: AttendanceMode) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
