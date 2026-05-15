"use client";

import { LeaveRequestStatus } from "../types";

const statusStyles: Record<LeaveRequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  Cancelled: "bg-slate-200 text-slate-700",
};

export function LeaveRequestStatusBadge({
  status,
}: {
  status: LeaveRequestStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}
