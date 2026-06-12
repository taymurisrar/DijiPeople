"use client";

import type { FormMetadata } from "../../../lib/runtime/metadata-runtime.types";

export function ModuleFormSelector({
  activeFormId,
  className,
  disabled = false,
  forms,
  onFormChange,
}: {
  readonly activeFormId?: string | null;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly forms: readonly FormMetadata[];
  readonly onFormChange: (formId: string) => void;
}) {
  if (forms.length <= 1) return null;

  return (
    <label className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <span className="text-sm font-medium text-muted">Form</span>
      <select
        className="h-9 min-w-[220px] rounded-md border border-border bg-white px-3 text-sm font-semibold text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        value={activeFormId ?? forms[0]?.id ?? ""}
        onChange={(event) => onFormChange(event.target.value)}
      >
        {forms.map((form) => (
          <option key={form.id} value={form.id}>
            {form.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
