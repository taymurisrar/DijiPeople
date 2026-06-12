"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SelectField, TextField } from "@/app/components/ui/form-control";
import type { ModuleOwnerOption } from "@/lib/runtime/module-data-adapter.types";
import {
  normalizeOwnerOption,
  resolveOwnerDisplayName,
} from "@/lib/runtime/owner-display.resolver";
import { debugRuntime } from "@/lib/runtime/runtime-debug";
import type { ModuleRuntimeContext } from "../../../lib/runtime/module-runtime.types";
import type {
  RuntimeCommandHandler,
  RuntimeRecordData,
  RuntimeStatusGroupConfig,
} from "./module-runtime-ui.types";
import { ModuleOwnerPicker } from "./module-owner-picker";
import { Button } from "../ui/button";

export function ModuleCommandBarStatusGroup({
  config,
  disabled = false,
  loading = false,
  record,
  runtime,
}: {
  readonly config?: RuntimeStatusGroupConfig | null;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly onCommand: RuntimeCommandHandler;
  readonly record?: RuntimeRecordData | null;
  readonly runtime: ModuleRuntimeContext;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | PointerEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!config?.enabled) return null;

  const isDisabled = disabled || loading;

  const ownerOptions = (config.ownerOptions ?? []).map(toOwnerOption);
  const statusValue = readRecordValue(record, config.statusFieldLogicalName);
  const subStatusOptions = filterSubStatusOptions(
    config.subStatusField?.options ?? [],
    statusValue,
  );
  const summary = buildStatusSummary(record, config, ownerOptions, runtime);

  debugRuntime("Status Group rendered", {
    disabled: isDisabled,
    ownerField: {
      fieldLogicalName: config.ownerFieldLogicalName,
      editable: !isDisabled && Boolean(config.ownerField),
      value: readRecordValue(record, config.ownerFieldLogicalName),
      display: displayRecordValue(
        record,
        config.ownerFieldLogicalName,
        ownerOptions,
        config.lookupDisplayValues,
        runtime,
      ),
      ownerOptionsCount: ownerOptions.length,
      ownerOptionsError: config.ownerOptionsError,
    },
    statusField: {
      fieldLogicalName: config.statusFieldLogicalName,
      editable: !isDisabled && Boolean(config.statusField),
      value: readRecordValue(record, config.statusFieldLogicalName),
    },
    subStatusField: config.subStatusFieldLogicalName
      ? {
          fieldLogicalName: config.subStatusFieldLogicalName,
          editable: !isDisabled && Boolean(config.subStatusField),
          value: readRecordValue(record, config.subStatusFieldLogicalName),
        }
      : null,
  });

  return (
    <div className="relative ml-auto min-w-[240px]" ref={containerRef}>
      <Button
        aria-expanded={open}
        variant="outline"
        className="h-9 w-full justify-between gap-2 rounded-md bg-surface/70 px-3 text-left font-normal hover:bg-muted/20"
        onClick={() => setOpen((current) => !current)}
        title={config.disabledReason}
        type="button"
      >
        <span className="min-w-0">
          <span className="block text-xs font-medium uppercase text-muted">
            Status Group
          </span>
          <span className="block truncate text-sm font-medium">{summary}</span>
        </span>

        <ChevronDown
          className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-lg border border-border bg-surface p-3 shadow-xl">
          <StatusLookup
            disabled={isDisabled || !config.ownerField}
            label="Owner"
            value={readRecordValue(record, config.ownerFieldLogicalName)}
            options={ownerOptions}
            readOnlyValue={displayRecordValue(
              record,
              config.ownerFieldLogicalName,
              ownerOptions,
              config.lookupDisplayValues,
              runtime,
            )}
            onChange={(value) =>
              config.onValueChange?.(config.ownerFieldLogicalName, value)
            }
            onSearch={config.onOwnerSearch}
            error={config.ownerOptionsError}
          />
          <StatusSelect
            disabled={isDisabled || !config.statusField}
            label="Status"
            value={statusValue}
            options={config.statusField?.options ?? []}
            onChange={(value) => {
              config.onValueChange?.(config.statusFieldLogicalName, value);
              if (config.subStatusFieldLogicalName) {
                config.onValueChange?.(
                  config.subStatusFieldLogicalName,
                  defaultSubStatusValue(
                    config.subStatusField?.options ?? [],
                    value,
                  ),
                );
              }
            }}
          />
          {config.subStatusFieldLogicalName ? (
            <StatusSelect
              disabled={isDisabled || !config.subStatusField}
              label="Sub Status"
              value={readRecordValue(record, config.subStatusFieldLogicalName)}
              options={subStatusOptions}
              onChange={(value) =>
                config.subStatusFieldLogicalName
                  ? config.onValueChange?.(
                      config.subStatusFieldLogicalName,
                      value,
                    )
                  : undefined
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusSelect({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly value?: string;
}) {
  const hasOptions = options.length > 0;
  const resolvedOptions =
    !hasOptions && value ? [{ value, label: value }] : options;

  return disabled ? (
    <ReadOnlyStatusField
      label={label}
      value={
        resolvedOptions.find((option) => option.value === value)?.label ??
        value ??
        "Not set"
      }
    />
  ) : (
    <SelectField
      disabled={disabled || resolvedOptions.length === 0}
      label={label}
      onChange={(nextValue) => {
        onChange(nextValue);
      }}
      options={resolvedOptions}
      placeholder="Read only"
      value={value ?? ""}
    />
  );
}

function StatusLookup({
  disabled,
  error,
  label,
  onChange,
  onSearch,
  options,
  readOnlyValue,
  value,
}: {
  readonly disabled: boolean;
  readonly error?: string | null;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly onSearch?: (query: string) => void;
  readonly options: readonly { readonly id: string; readonly name: string }[];
  readonly readOnlyValue: string;
  readonly value?: string;
}) {
  return disabled ? (
    <ReadOnlyStatusField label={label} value={readOnlyValue} />
  ) : (
    <ModuleOwnerPicker
      disabled={disabled}
      label={label}
      onChange={(nextValue) => {
        debugRuntime("Status Group owner selected", {
          ownerId: nextValue,
          ownerOptionsCount: options.length,
        });
        onChange(nextValue);
      }}
      onSearch={onSearch}
      options={options}
      error={error}
      value={value ?? ""}
    />
  );
}

function ReadOnlyStatusField({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <TextField
      disabled
      label={label}
      onChange={() => undefined}
      value={value || "Not set"}
    />
  );
}

function buildStatusSummary(
  record: RuntimeRecordData | null | undefined,
  config: RuntimeStatusGroupConfig,
  ownerOptions: readonly ModuleOwnerOption[],
  runtime: ModuleRuntimeContext,
) {
  const owner = displayRecordValue(
    record,
    config.ownerFieldLogicalName,
    ownerOptions,
    config.lookupDisplayValues,
    runtime,
  );
  const status = displayChoiceValue(
    readRecordValue(record, config.statusFieldLogicalName),
    config.statusField?.options ?? [],
  );
  const subStatus = config.subStatusFieldLogicalName
    ? displayChoiceValue(
        readRecordValue(record, config.subStatusFieldLogicalName),
        filterSubStatusOptions(
          config.subStatusField?.options ?? [],
          readRecordValue(record, config.statusFieldLogicalName),
        ),
      )
    : "";

  return (
    [owner, status, subStatus]
      .filter((value) => value && value !== "Not set")
      .join(" / ") || "Owner, Status, Sub Status"
  );
}

function filterSubStatusOptions(
  options: readonly {
    readonly value: string;
    readonly label: string;
    readonly parentValue?: string;
  }[],
  statusValue: string,
) {
  const scopedOptions = options.filter(
    (option) => !option.parentValue || option.parentValue === statusValue,
  );

  return scopedOptions.length ? scopedOptions : options;
}

function defaultSubStatusValue(
  options: readonly {
    readonly value: string;
    readonly label: string;
    readonly parentValue?: string;
  }[],
  statusValue: string,
) {
  return filterSubStatusOptions(options, statusValue)[0]?.value ?? "";
}

function displayChoiceValue(
  value: string,
  options: readonly { readonly value: string; readonly label: string }[],
) {
  if (!value) return "Not set";
  return options.find((option) => option.value === value)?.label ?? value;
}

function readRecordValue(
  record: RuntimeRecordData | null | undefined,
  fieldLogicalName?: string,
) {
  if (!record || !fieldLogicalName) return "";
  const value = record[fieldLogicalName];
  return value === null || value === undefined ? "" : String(value);
}

function displayRecordValue(
  record: RuntimeRecordData | null | undefined,
  fieldLogicalName: string,
  options: readonly ModuleOwnerOption[],
  lookupDisplayValues?: Readonly<Record<string, string>>,
  runtime?: ModuleRuntimeContext,
) {
  return resolveOwnerDisplayName({
    lookupDisplayValue: lookupDisplayValues?.[fieldLogicalName],
    ownerId: readRecordValue(record, fieldLogicalName),
    ownerOptions: options,
    principal: runtime?.security.principal,
    record,
  });
}

function toOwnerOption(option: {
  readonly value: string;
  readonly label: string;
  readonly email?: string | null;
}): ModuleOwnerOption {
  return normalizeOwnerOption({
    id: option.value,
    name: option.label,
    email: option.email,
  });
}
