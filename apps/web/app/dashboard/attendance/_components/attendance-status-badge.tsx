"use client";

import { AttendanceEntryStatus } from "../types";

const statusStyles: Record<AttendanceEntryStatus, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800",
  LATE: "bg-amber-100 text-amber-800",
  ABSENT: "bg-rose-100 text-rose-800",
  HALF_DAY: "bg-sky-100 text-sky-800",
  MISSED_CHECK_OUT: "bg-orange-100 text-orange-800",
  ON_LEAVE: "bg-violet-100 text-violet-800",
};

export function AttendanceStatusBadge({
  status,
}: {
  status: AttendanceEntryStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusStyles[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
