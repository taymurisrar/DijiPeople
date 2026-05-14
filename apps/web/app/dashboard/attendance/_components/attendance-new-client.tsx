"use client";

import { useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SideToast } from "@/app/components/notifications";
import { formatDateTime } from "@/lib/formatting-context";
import { useResolvedSettings } from "../../_components/resolved-settings-provider";
import type {
  AttendanceEntryRecord,
  AttendanceLocationOption,
  AttendanceMode,
} from "../types";
import { AttendanceCommandBar } from "./attendance-command-bar";
import { AttendanceStatusBadge } from "./attendance-status-badge";

type AttendanceNewClientProps = {
  activeEntry: AttendanceEntryRecord | null;
  locations: AttendanceLocationOption[];
  todayEntry: AttendanceEntryRecord | null;
};

export function AttendanceNewClient({
  activeEntry,
  locations,
  todayEntry,
}: AttendanceNewClientProps) {
  const router = useRouter();
  const resolvedSettings = useResolvedSettings();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<AttendanceMode>("OFFICE");
  const [officeLocationId, setOfficeLocationId] = useState(locations[0]?.id ?? "");
  const [checkInNote, setCheckInNote] = useState("");
  const [checkOutNote, setCheckOutNote] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [toast, setToast] = useState<{
    title: string;
    description?: string;
    variant: "success" | "error" | "warning" | "info";
  } | null>(null);

  const activeMode = useMemo(
    () => activeEntry?.attendanceMode ?? mode,
    [activeEntry?.attendanceMode, mode],
  );
  const canCheckIn = !activeEntry;
  const canCheckOut = activeEntry?.canCurrentUserCheckOut ?? false;
  const checkInDisabled =
    isPending || !canCheckIn || (mode === "OFFICE" && !officeLocationId);
  const checkOutDisabled = isPending || !canCheckOut;

  async function readResponseMessage(response: Response, fallback: string) {
    const data = (await response.json().catch(() => null)) as {
      message?: unknown;
      description?: unknown;
    } | null;

    return (
      (typeof data?.description === "string" && data.description) ||
      (typeof data?.message === "string" && data.message) ||
      fallback
    );
  }

  function submitCheckIn() {
    if (checkInDisabled) return;

    startTransition(async () => {
      const response = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendanceMode: mode,
          officeLocationId:
            mode === "OFFICE" ? officeLocationId || undefined : undefined,
          note: checkInNote || undefined,
          workSummary: workSummary || undefined,
        }),
      });

      if (!response.ok) {
        setToast({
          title: "Check-in failed",
          description: await readResponseMessage(response, "Unable to check in."),
          variant: "error",
        });
        return;
      }

      setToast({ title: "Checked in", variant: "success" });
      router.refresh();
    });
  }

  function submitCheckOut() {
    if (checkOutDisabled) return;

    startTransition(async () => {
      const response = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: checkOutNote || undefined,
          workSummary: workSummary || undefined,
        }),
      });

      if (!response.ok) {
        setToast({
          title: "Check-out failed",
          description: await readResponseMessage(response, "Unable to check out."),
          variant: "error",
        });
        return;
      }

      setToast({ title: "Checked out", variant: "success" });
      router.refresh();
    });
  }

  return (
    <>
      <AttendanceCommandBar
        canCheckIn={canCheckIn}
        canCheckOut={Boolean(activeEntry)}
        checkInDisabled={checkInDisabled}
        checkOutDisabled={checkOutDisabled}
        context="new"
        onCheckIn={submitCheckIn}
        onCheckOut={submitCheckOut}
      />

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Attendance mode</span>
            <select
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              disabled={Boolean(activeEntry)}
              onChange={(event) => setMode(event.target.value as AttendanceMode)}
              value={activeMode}
            >
              <option value="OFFICE">Office</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Office location</span>
            <select
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              disabled={Boolean(activeEntry) || activeMode !== "OFFICE"}
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

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Check-in note</span>
            <textarea
              className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              disabled={Boolean(activeEntry)}
              onChange={(event) => setCheckInNote(event.target.value)}
              placeholder="Optional check-in note."
              value={checkInNote}
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Check-out note</span>
            <textarea
              className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              disabled={!activeEntry}
              onChange={(event) => setCheckOutNote(event.target.value)}
              placeholder="Optional check-out note."
              value={checkOutNote}
            />
          </label>

          <label className="space-y-2 text-sm lg:col-span-2">
            <span className="font-medium text-foreground">Work summary</span>
            <textarea
              className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) => setWorkSummary(event.target.value)}
              placeholder="Optional work summary."
              value={workSummary}
            />
          </label>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <InfoTile label="Current status">
            {activeEntry ? (
              <AttendanceStatusBadge status={activeEntry.status} />
            ) : todayEntry ? (
              <AttendanceStatusBadge status={todayEntry.status} />
            ) : (
              "No attendance recorded today"
            )}
          </InfoTile>
          <InfoTile label="Check in">
            {activeEntry?.checkInAt ?? todayEntry?.checkInAt
              ? formatDateTime(
                  activeEntry?.checkInAt ?? todayEntry?.checkInAt ?? "",
                  resolvedSettings,
                )
              : "Pending"}
          </InfoTile>
          <InfoTile label="Check out">
            {activeEntry?.checkOutAt ?? todayEntry?.checkOutAt
              ? formatDateTime(
                  activeEntry?.checkOutAt ?? todayEntry?.checkOutAt ?? "",
                  resolvedSettings,
                )
              : "Pending"}
          </InfoTile>
        </div>
      </section>

      {toast ? (
        <SideToast
          isOpen
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      ) : null}
    </>
  );
}

function InfoTile({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-border bg-white/80 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-2 text-sm font-medium text-foreground">{children}</div>
    </article>
  );
}
