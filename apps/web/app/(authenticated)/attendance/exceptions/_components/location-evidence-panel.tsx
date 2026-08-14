"use client";

import { useState } from "react";

import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import type { LocationEvidenceRow } from "../_lib/detail-types";

/**
 * The precise location evidence behind a decision, fetched only when asked for.
 *
 * BEHIND A DELIBERATE CLICK. The coordinates are not part of the exception
 * payload and are not loaded with the page: someone reviewing a missing-punch
 * exception has no reason to pull an employee's position, and every retrieval is
 * audited server-side. Making it an explicit action keeps the audit trail
 * meaningful — an entry means somebody chose to look.
 *
 * `viewable` comes from the server, which has already decided whether this caller
 * holds `attendance.locationEvidence.read`. Holding `attendance.manage` is not
 * enough, so the button is simply absent for most reviewers rather than present
 * and refused.
 */
export function LocationEvidencePanel({
  employeeId,
  attendanceDate,
  viewable,
}: {
  employeeId: string;
  attendanceDate: string;
  viewable: boolean;
}) {
  const [rows, setRows] = useState<LocationEvidenceRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const search = new URLSearchParams({
        employeeId,
        from: attendanceDate,
        to: attendanceDate,
      });

      const response = await fetch(
        `/api/attendance/engine/location-evidence?${search.toString()}`,
      );

      if (!response.ok) {
        setError(
          response.status === 403
            ? "You do not have permission to view location evidence."
            : "That could not be loaded. Try again.",
        );
        return;
      }

      const data = (await response.json()) as { items: LocationEvidenceRow[] };
      setRows(data.items ?? []);
    } catch {
      setError("That could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!viewable) {
    return (
      <SectionCard
        title="Location evidence"
        description="Restricted to attendance audit access."
      >
        <p className="text-sm text-muted">
          This exception involves a location check. The exact coordinates are kept
          separately and need attendance audit permission to view — managing
          attendance is not sufficient on its own.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Location evidence"
      description="The position and policy behind the decision. Every retrieval is recorded."
    >
      {rows === null ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted">
            Precise coordinates are not loaded by default. Opening them is logged
            against your account.
          </p>
          <button
            className="w-fit rounded-2xl border border-border px-4 py-2 text-sm font-semibold transition hover:bg-surface-strong disabled:opacity-50"
            disabled={loading}
            onClick={() => void load()}
            type="button"
          >
            {loading ? "Loading…" : "Show location evidence"}
          </button>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          No location evidence was recorded for this day.
        </p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li className="rounded-2xl border border-border px-4 py-3" key={row.id}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <StatusPill tone={row.outcome === "ALLOW" ? "good" : "danger"}>
                  {row.outcome === "ALLOW" ? "Accepted" : "Refused"}
                </StatusPill>
                <span className="text-sm font-medium text-foreground">
                  {row.action === "CHECK_IN" ? "Check-in" : "Check-out"}
                </span>
                <span className="text-sm text-muted">
                  {new Date(row.capturedAt).toLocaleString()}
                </span>
                <span className="text-xs text-muted">{row.captureSource}</span>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Row label="Latitude">{formatCoordinate(row.latitude)}</Row>
                <Row label="Longitude">{formatCoordinate(row.longitude)}</Row>
                <Row label="Reported accuracy">{formatMeters(row.accuracyMeters)}</Row>
                <Row label="Accuracy limit applied">
                  {formatMeters(row.effectiveAccuracyLimitMeters)}
                </Row>
                <Row label="Matched work site">
                  {row.matchedWorkSite?.name ?? "None"}
                </Row>
                <Row label="Distance">{formatMeters(row.distanceMeters)}</Row>
                <Row label="Radius configured">
                  {formatMeters(row.geofenceRadiusMeters)}
                </Row>
                <Row label="Inside geofence">
                  {row.insideGeofence === null
                    ? "—"
                    : row.insideGeofence
                      ? "Yes"
                      : "No"}
                </Row>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Six decimals: about a tenth of a metre, finer than any GPS fix. */
function formatCoordinate(value: number | null): string {
  return value === null ? "—" : value.toFixed(6);
}

function formatMeters(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${value} m`;
}
