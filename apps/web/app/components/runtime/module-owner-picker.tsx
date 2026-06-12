"use client";

import {
  LookupField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import type { ModuleOwnerOption } from "@/lib/runtime/module-data-adapter.types";
import { normalizeOwnerOption } from "@/lib/runtime/owner-display.resolver";

export function ModuleOwnerPicker({
  disabled = false,
  error,
  label = "Owner",
  onChange,
  onSearch,
  options,
  value,
}: {
  readonly disabled?: boolean;
  readonly error?: string | null;
  readonly label?: string;
  readonly onChange: (ownerId: string) => void;
  readonly onSearch?: (query: string) => void;
  readonly options: readonly ModuleOwnerOption[];
  readonly value: string;
}) {
  return (
    <div className="grid gap-1">
      <LookupField
        disabled={disabled}
        label={label}
        noResultsText={error ? "Unable to load users." : "No users found."}
        onChange={onChange}
        onSearch={onSearch}
        options={options.map(toLookupOption)}
        placeholder="Search users"
        value={value}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function toLookupOption(option: ModuleOwnerOption): LookupOption {
  const normalized = normalizeOwnerOption(option);

  return {
    id: normalized.id,
    name: normalized.name,
    code: normalized.code,
    subtitle: normalized.subtitle,
  };
}
