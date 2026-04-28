import { ReactNode } from "react";

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "good" | "muted" | "neutral";
  children: ReactNode;
}) {
  const className =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "muted"
        ? "border-slate-200 bg-slate-50 text-slate-600"
        : "border-accent/20 bg-accent-soft text-accent";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}
