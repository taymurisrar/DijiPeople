"use client";

import { ChevronDown } from "lucide-react";

export function ModuleRecordStatusSummary({
  disabledReason,
  onToggle,
  open,
  owner,
  status,
  subStatus,
}: {
  readonly disabledReason?: string;
  readonly onToggle: () => void;
  readonly open: boolean;
  readonly owner: string;
  readonly status: string;
  readonly subStatus?: string;
}) {
  const summary = [status, subStatus, owner]
    .filter((value) => value && value !== "Not set")
    .join(" / ");

  return (
    <button
      aria-expanded={open}
      aria-haspopup="dialog"
      className="inline-flex h-12 min-w-[240px] max-w-full items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 text-left text-sm text-foreground shadow-sm transition hover:bg-muted/10"
      onClick={onToggle}
      title={disabledReason}
      type="button"
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase text-muted">
          Record Status
        </span>
        <span className="block truncate font-medium">
          {summary || "Owner, Status, Sub Status"}
        </span>
      </span>
      <ChevronDown
        className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}
