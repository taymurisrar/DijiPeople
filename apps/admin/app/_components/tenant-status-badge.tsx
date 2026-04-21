const statusStyles: Record<string, string> = {
  LEAD: "border-slate-200 bg-slate-100 text-slate-700",
  PROSPECT: "border-indigo-200 bg-indigo-50 text-indigo-700",
  ONBOARDING: "border-sky-200 bg-sky-50 text-sky-700",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  SUSPENDED: "border-rose-200 bg-rose-50 text-rose-700",
  CHURNED: "border-slate-300 bg-slate-200 text-slate-700",
  TRIALING: "border-amber-200 bg-amber-50 text-amber-700",
  PAST_DUE: "border-orange-200 bg-orange-50 text-orange-700",
  CANCELLED: "border-slate-200 bg-slate-100 text-slate-700",
  DRAFT: "border-slate-200 bg-slate-100 text-slate-700",
  ISSUED: "border-blue-200 bg-blue-50 text-blue-700",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
  OVERDUE: "border-rose-200 bg-rose-50 text-rose-700",
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  SUCCEEDED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-rose-200 bg-rose-50 text-rose-700",
  REFUNDED: "border-violet-200 bg-violet-50 text-violet-700",
};

type StatusBadgeProps = {
  value: string;
};

export function TenantStatusBadge({ value }: StatusBadgeProps) {
  const className =
    statusStyles[value] ?? "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${className}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
