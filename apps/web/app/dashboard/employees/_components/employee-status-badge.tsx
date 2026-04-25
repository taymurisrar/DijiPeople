import { EmployeeEmploymentStatus } from "../types";

const statusStyles: Record<EmployeeEmploymentStatus, string> = {
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PROBATION: "bg-amber-50 text-amber-700 border-amber-200",
  NOTICE: "bg-orange-50 text-orange-700 border-orange-200",
  TERMINATED: "bg-rose-50 text-rose-700 border-rose-200",
};

export function EmployeeStatusBadge({
  status,
}: {
  status: EmployeeEmploymentStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.12em] uppercase ${statusStyles[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
