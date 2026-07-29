"use client";

import { TimesheetStatus } from "../types";

const statusStyles: Record<TimesheetStatus, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-700",
  DRAFT: "bg-slate-200 text-slate-700",
  IN_PROGRESS: "bg-sky-100 text-sky-800",
  SUBMITTED: "bg-amber-100 text-amber-800",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  PARTIALLY_APPROVED: "bg-cyan-100 text-cyan-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  OVERDUE: "bg-orange-100 text-orange-800",
  PAYROLL_READY: "bg-teal-100 text-teal-800",
  PAYROLL_PROCESSED: "bg-emerald-200 text-emerald-900",
  LOCKED: "bg-slate-900 text-white",
  NOT_REQUIRED: "bg-slate-100 text-slate-600",
  AUTO_COMPLETED: "bg-emerald-100 text-emerald-800",
  EXCEPTION: "bg-rose-100 text-rose-900",
  CANCELLED: "bg-slate-200 text-slate-600",
};

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusStyles[status]}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
