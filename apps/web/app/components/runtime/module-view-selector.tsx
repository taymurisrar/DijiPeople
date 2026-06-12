"use client";

import type { ViewMetadata } from "../../../lib/runtime/metadata-runtime.types";

export function ModuleViewSelector({
  activeViewId,
  className,
  disabled = false,
  onViewChange,
  views,
}: {
  readonly activeViewId?: string | null;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onViewChange: (viewId: string) => void;
  readonly views: readonly ViewMetadata[];
}) {
  if (views.length === 0) return null;

  return (
    <label className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <span className="text-sm font-medium text-muted">View</span>
      <select
        className="h-9 min-w-[220px] rounded-md border border-border bg-white px-3 text-sm font-semibold text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        value={activeViewId ?? views[0]?.viewId ?? views[0]?.id ?? ""}
        onChange={(event) => onViewChange(event.target.value)}
      >
        {views.map((view) => (
          <option key={view.viewId ?? view.id} value={view.viewId ?? view.id}>
            {view.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
