import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: LucideIcon;
};

export function MetricCard({ label, value, description, icon: Icon }: MetricCardProps) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        {Icon ? (
          <div className="rounded-2xl bg-slate-50 p-2.5 text-slate-700 ring-1 ring-slate-200">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      {description ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}
