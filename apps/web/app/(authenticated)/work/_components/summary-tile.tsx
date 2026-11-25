import type { ReactNode } from "react";

/** One labelled figure. The label is real text so the figure reads without colour. */
export function SummaryTile({
  detail,
  label,
  value,
}: {
  detail?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div
      className="rounded-[20px] border border-border bg-surface p-4"
      role="group"
      aria-label={label}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

/** A progress bar with its figure as text. A null percent draws an empty track. */
export function ProgressBar({
  label,
  percent,
}: {
  label: string;
  percent: number | null;
}) {
  const width = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent ?? undefined}
      aria-valuetext={percent === null ? "No work yet" : `${percent}%`}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-strong"
      role="progressbar"
    >
      <div
        className="h-full rounded-full bg-accent"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
