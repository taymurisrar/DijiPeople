import { JobOpeningStatus } from "../types";

const statusStyles: Record<JobOpeningStatus, string> = {
  DRAFT:
    "border-slate-200 bg-slate-50 text-slate-700 ring-1 ring-slate-200/70",
  OPEN:
    "border-emerald-200 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70",
  ON_HOLD:
    "border-amber-200 bg-amber-50 text-amber-700 ring-1 ring-amber-200/70",
  CLOSED:
    "border-zinc-200 bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/70",
  FILLED:
    "border-sky-200 bg-sky-50 text-sky-700 ring-1 ring-sky-200/70",
  Cancelled:
    "border-rose-200 bg-rose-50 text-rose-700 ring-1 ring-rose-200/70",
};

const statusDotStyles: Record<JobOpeningStatus, string> = {
  DRAFT: "bg-slate-500",
  OPEN: "bg-emerald-500",
  ON_HOLD: "bg-amber-500",
  CLOSED: "bg-zinc-500",
  FILLED: "bg-sky-500",
  Cancelled: "bg-rose-500",
};

const fallbackStatus: JobOpeningStatus = "DRAFT";

function isJobOpeningStatus(value: string): value is JobOpeningStatus {
  return [
    "DRAFT",
    "OPEN",
    "ON_HOLD",
    "CLOSED",
    "FILLED",
    "Cancelled",
  ].includes(value);
}

export function JobOpeningStatusBadge({
  status,
}: {
  status: string;
}) {
  const safeStatus = isJobOpeningStatus(status) ? status : fallbackStatus;

  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusStyles[safeStatus]}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${statusDotStyles[safeStatus]}`}
        aria-hidden="true"
      />
      {safeStatus.replaceAll("_", " ")}
    </span>
  );
}