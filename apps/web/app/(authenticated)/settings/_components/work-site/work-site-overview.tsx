"use client";

import Link from "next/link";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  READINESS_STATUS_LABELS,
  buildWorkSiteReadinessChecks,
  buildWorkSiteSummaryRows,
  type ReadinessStatus,
  type WorkSiteReadinessPayload,
} from "../../_lib/work-site-configuration";

/**
 * The one-glance operational view, rendered as the first section of the Summary
 * tab.
 *
 * IT APPEARS EXACTLY ONCE. This block used to sit above the tab strip, so every
 * tab carried it and the Summary tab then repeated the same facts underneath.
 * It also repeated the record header's name, code, status and place. Both
 * duplications are gone: the header names the record, this section describes how
 * it is configured.
 *
 * Every value comes from the API's own resolver. Where a value is not
 * configured it says so; it never substitutes a plausible default for a fact
 * the platform does not have.
 */
export function WorkSiteOverview({
  readiness,
  error,
}: {
  readonly readiness: WorkSiteReadinessPayload | null;
  readonly error?: string | null;
}) {
  if (!readiness) {
    return (
      <p className="text-sm text-muted">
        {error ??
          "Operational summary and readiness could not be loaded for this work site."}
      </p>
    );
  }

  const summary = buildWorkSiteSummaryRows(readiness);
  const checks = buildWorkSiteReadinessChecks(readiness);

  return (
    <section className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <dl className="grid gap-2 sm:grid-cols-2">
          {summary.map((row) => (
            <div
              className="min-w-0 rounded-xl border border-border bg-white px-3 py-2"
              key={row.label}
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                {row.label}
              </dt>
              <dd className="mt-0.5 break-words text-sm font-medium text-foreground">
                {row.value}
                {row.source ? (
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted">
                    {row.source}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>

        <div className="rounded-xl border border-border bg-white p-3">
          <h4 className="text-sm font-semibold text-foreground">
            Attendance readiness
          </h4>
          <ul className="mt-2 grid gap-2">
            {checks.map((check) => (
              <li className="grid gap-0.5" key={check.key}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground">{check.label}</span>
                  <StatusPill tone={readinessTone(check.status)}>
                    {READINESS_STATUS_LABELS[check.status]}
                  </StatusPill>
                </div>
                <span className="text-xs text-muted">{check.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * Related records, with counts the API actually returned.
 *
 * Counts come from count queries on the API side, so opening this tab does not
 * pull employee or attendance rows into the browser to arrive at a number.
 */
export function WorkSiteRelatedRecords({
  readiness,
}: {
  readonly readiness: WorkSiteReadinessPayload | null;
}) {
  if (!readiness) {
    return (
      <p className="text-sm text-muted">
        Related record counts are unavailable for this work site.
      </p>
    );
  }

  const { counts, devices, gateways } = readiness;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-2xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {counts.authorizedEmployees} authorized employee
              {counts.authorizedEmployees === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted">
              {counts.assignedEmployees} explicitly assigned to this work site
              {counts.primaryOnlyEmployees
                ? `, ${counts.primaryOnlyEmployees} authorized through their primary work site only`
                : ""}
              .
            </p>
          </div>
          <Link className="text-sm font-medium text-accent hover:underline" href="/employees">
            View employees
          </Link>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">
            {counts.attendanceDevices} attendance device
            {counts.attendanceDevices === 1 ? "" : "s"}
          </p>
          <Link
            className="text-sm font-medium text-accent hover:underline"
            href="/settings/integrations/attendance/devices"
          >
            View all devices
          </Link>
        </div>
        {devices.length ? (
          <ul className="grid gap-2">
            {devices.map((device) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                key={device.id}
              >
                <div className="min-w-0">
                  <Link
                    className="text-sm font-medium text-accent hover:underline"
                    href={`/settings/integrations/attendance/devices/${device.id}`}
                  >
                    {device.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {[device.model, device.code, device.provider]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={device.isEnabled ? "good" : "muted"}>
                    {device.isEnabled ? "Enabled" : "Disabled"}
                  </StatusPill>
                  <StatusPill tone={deviceHealthTone(device.healthStatus)}>
                    {deviceHealthLabel(device.healthStatus)}
                  </StatusPill>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No devices assigned</p>
        )}
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Gateways</p>
          <Link
            className="text-sm font-medium text-accent hover:underline"
            href="/settings/integrations/attendance/gateways"
          >
            View gateways
          </Link>
        </div>
        {gateways.length ? (
          <ul className="grid gap-2">
            {gateways.map((gateway) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                key={gateway.id}
              >
                <span className="text-sm font-medium text-foreground">
                  {gateway.name}
                </span>
                <StatusPill tone={gatewayTone(gateway)}>
                  {gateway.lastHeartbeatAt
                    ? gatewayStatusText(gateway.status)
                    : "Not yet reported"}
                </StatusPill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            No device at this work site uses a local gateway.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold text-foreground">Recent attendance</p>
        <p className="mt-1 text-sm text-muted">
          {counts.recentAttendanceSessions} attendance session
          {counts.recentAttendanceSessions === 1 ? "" : "s"} recorded at this work
          site in the last 7 days.
        </p>
        <Link
          className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
          href="/attendance"
        >
          Open attendance
        </Link>
      </div>
    </div>
  );
}

function readinessTone(status: ReadinessStatus) {
  if (status === "ready") return "good" as const;
  if (status === "needs-configuration") return "warning" as const;
  if (status === "pending") return "info" as const;
  return "muted" as const;
}

function gatewayTone(gateway: { status: string; lastHeartbeatAt: string | null }) {
  if (!gateway.lastHeartbeatAt) return "muted" as const;
  if (gateway.status === "ONLINE") return "good" as const;
  if (gateway.status === "DEGRADED") return "warning" as const;
  if (gateway.status === "REVOKED" || gateway.status === "OFFLINE") {
    return "danger" as const;
  }
  return "info" as const;
}

function gatewayStatusText(status: string) {
  switch (status) {
    case "ONLINE":
      return "Online";
    case "OFFLINE":
      return "Offline";
    case "DEGRADED":
      return "Degraded";
    case "REVOKED":
      return "Revoked";
    default:
      return "Awaiting connection";
  }
}

function deviceHealthLabel(status: string) {
  switch (status) {
    case "HEALTHY":
      return "Healthy";
    case "DEGRADED":
      return "Degraded";
    case "UNREACHABLE":
      return "Unreachable";
    default:
      return "Not yet reported";
  }
}

function deviceHealthTone(status: string) {
  if (status === "HEALTHY") return "good" as const;
  if (status === "DEGRADED") return "warning" as const;
  if (status === "UNREACHABLE") return "danger" as const;
  return "muted" as const;
}
