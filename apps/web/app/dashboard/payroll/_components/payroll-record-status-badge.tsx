import { PayrollRecordStatus } from "../types";

export function PayrollRecordStatusBadge({
  status,
}: {
  status: PayrollRecordStatus;
}) {
  const tone =
    status === "FINALIZED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "REVIEWED"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

