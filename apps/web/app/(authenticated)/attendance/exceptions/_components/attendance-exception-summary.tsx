import Link from "next/link";

import type { AttendanceExceptionSummaryResponse } from "../_lib/types";

/**
 * Quick filters over what is actually open.
 *
 * Every number is a real count from the caller's own scope — nothing is
 * estimated and nothing is a placeholder. A tile reading "12" that opens onto
 * three rows would teach a reviewer to distrust the whole page.
 *
 * Tiles with nothing in them stay visible but muted: "no leave conflicts" is
 * useful information, and a grid that reshuffles as counts change is harder to
 * scan than one that holds still.
 */
export function AttendanceExceptionSummary({
  summary,
}: {
  summary: AttendanceExceptionSummaryResponse;
}) {
  const tiles = [
    { label: "Open", count: summary.open, href: "?status=OPEN", tone: "neutral" },
    {
      label: "Critical",
      count: summary.critical,
      href: "?status=OPEN",
      tone: "danger",
    },
    {
      label: "Missing punch",
      count: summary.missingPunch,
      href: "?status=OPEN&type=MISSING_CHECKOUT",
      tone: "warning",
    },
    {
      label: "Leave conflict",
      count: summary.leaveConflict,
      href: "?status=OPEN&type=ATTENDANCE_DURING_LEAVE",
      tone: "warning",
    },
    {
      label: "Work site conflict",
      count: summary.workSiteConflict,
      href: "?status=OPEN&type=UNAUTHORIZED_WORK_SITE",
      tone: "warning",
    },
    {
      label: "Locked period",
      count: summary.lockedPeriod,
      href: "?status=OPEN&type=LOCKED_PERIOD_EVENT",
      tone: "danger",
    },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <Link
          className={`rounded-2xl border px-4 py-3 transition hover:bg-surface-strong ${
            tile.count === 0
              ? "border-border opacity-60"
              : tile.tone === "danger"
                ? "border-red-300"
                : tile.tone === "warning"
                  ? "border-amber-300"
                  : "border-border"
          }`}
          href={`/attendance/exceptions${tile.href}`}
          key={tile.label}
        >
          <span className="block text-xs font-medium uppercase tracking-wide text-muted">
            {tile.label}
          </span>
          <span
            className={`mt-1 block text-2xl font-semibold ${
              tile.count === 0
                ? "text-muted"
                : tile.tone === "danger"
                  ? "text-red-600"
                  : "text-foreground"
            }`}
          >
            {tile.count}
          </span>
        </Link>
      ))}
    </div>
  );
}
