"use client";

import { ProjectStatus } from "../types";

const styles: Record<ProjectStatus, string> = {
  PLANNING: "bg-slate-200 text-slate-700",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  ON_HOLD: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-sky-100 text-sky-800",
  CANCELLED: "bg-rose-100 text-rose-800",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${styles[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
