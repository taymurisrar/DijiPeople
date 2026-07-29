"use client";

import { SelectField, TextField } from "@/app/components/ui/form-control";
import { debugRuntime } from "@/lib/runtime/runtime-debug";
import type {
  RuntimeRecordData,
  RuntimeStatusGroupConfig,
} from "./module-runtime-ui.types";
import { ModuleOwnerPicker } from "./module-owner-picker";

type RuntimeOption = {
  readonly value: string;
  readonly label: string;
  readonly parentValue?: string;
};

export function ModuleRecordStatusPopover({
  config,
  disabled,
  record,
}: {
  readonly config: RuntimeStatusGroupConfig;
  readonly disabled: boolean;
  readonly record?: RuntimeRecordData | null;
}) {
  const ownerOptions = (config.ownerOptions ?? []).map((option) => ({
    id: option.value,
    name: option.label,
  }));
  const ownerValue = config.ownerFieldLogicalName
    ? readRecordValue(record, config.ownerFieldLogicalName)
    : "";
  const statusValue = readRecordValue(record, config.statusFieldLogicalName);
  const subStatusOptions = filterSubStatusOptions(
    config.subStatusField?.options ?? [],
    statusValue,
  );
  const ownerReadonly = config.ownerField?.behavior === "readonly";
  const statusReadonly = config.statusField?.behavior === "readonly";
  const subStatusReadonly = config.subStatusField?.behavior === "readonly";

  debugRuntime("ModuleRecordStatusPopover rendered", {
    disabled,
    disabledReason: config.disabledReason,
    owner: {
      fieldLogicalName: config.ownerFieldLogicalName,
      value: ownerValue,
      display: config.ownerFieldLogicalName
        ? displayRecordValue(
            record,
            config.ownerFieldLogicalName,
            ownerOptions,
            config.lookupDisplayValues,
          )
        : "",
    },
    status: {
      fieldLogicalName: config.statusFieldLogicalName,
      value: statusValue,
    },
    subStatus: config.subStatusFieldLogicalName
      ? {
          fieldLogicalName: config.subStatusFieldLogicalName,
          value: readRecordValue(record, config.subStatusFieldLogicalName),
          optionCount: subStatusOptions.length,
        }
      : null,
  });

  return (
    <div
      className="absolute right-0 top-full z-40 mt-2 grid w-full min-w-0 gap-3 overflow-hidden rounded-lg border border-border bg-surface p-3 shadow-xl"
      role="dialog"
    >
      {config.ownerFieldLogicalName ? (
        <StatusLookup
          disabled={disabled || !config.ownerField || ownerReadonly}
          label="Owner"
          onChange={(value) =>
            config.ownerFieldLogicalName
              ? config.onValueChange?.(config.ownerFieldLogicalName, value)
              : undefined
          }
          options={ownerOptions}
          readOnlyValue={displayRecordValue(
            record,
            config.ownerFieldLogicalName,
            ownerOptions,
            config.lookupDisplayValues,
          )}
          value={ownerValue}
        />
      ) : null}
      <StatusSelect
        disabled={disabled || !config.statusField || statusReadonly}
        label="Status"
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
        options={config.statusField?.options ?? []}
        value={statusValue}
      />
      {config.subStatusFieldLogicalName ? (
        <StatusSelect
          disabled={disabled || !config.subStatusField || subStatusReadonly}
          label="Sub Status"
          onChange={(value) =>
            config.subStatusFieldLogicalName
              ? config.onValueChange?.(config.subStatusFieldLogicalName, value)
              : undefined
          }
          options={subStatusOptions}
          value={readRecordValue(record, config.subStatusFieldLogicalName)}
        />
      ) : null}
    </div>
  );
}

export function buildRecordStatusSummary(
  record: RuntimeRecordData | null | undefined,
  config: RuntimeStatusGroupConfig | null | undefined,
) {
  if (!config) {
    return { owner: "", status: "", subStatus: "" };
  }

  const ownerOptions = (config.ownerOptions ?? []).map((option) => ({
    id: option.value,
    name: option.label,
  }));
  const statusValue = readRecordValue(record, config.statusFieldLogicalName);

  return {
    owner: displayRecordValue(
      record,
      config.ownerFieldLogicalName ?? "",
      ownerOptions,
      config.lookupDisplayValues,
    ),
    status: displayChoiceValue(statusValue, config.statusField?.options ?? []),
    subStatus: config.subStatusFieldLogicalName
      ? displayChoiceValue(
          readRecordValue(record, config.subStatusFieldLogicalName),
          filterSubStatusOptions(
            config.subStatusField?.options ?? [],
            statusValue,
          ),
        )
      : "",
  };
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
  readonly options: readonly RuntimeOption[];
  readonly value?: string;
}) {
  const resolvedOptions =
    options.length || !value ? options : [{ value, label: value }];

  return disabled ? (
    <TextField
      className="min-w-0"
      disabled
      label={label}
      onChange={() => undefined}
      value={
        resolvedOptions.find((option) => option.value === value)?.label ??
        value ??
        ""
      }
    />
  ) : (
    <SelectField
      className="min-w-0"
      disabled={resolvedOptions.length === 0}
      label={label}
      onChange={onChange}
      options={resolvedOptions}
      placeholder="Select"
      value={value ?? ""}
    />
  );
}

function StatusLookup({
  disabled,
  label,
  onChange,
  options,
  readOnlyValue,
  value,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly { readonly id: string; readonly name: string }[];
  readonly readOnlyValue: string;
  readonly value?: string;
}) {
  return disabled ? (
    <TextField
      className="min-w-0"
      disabled
      label={label}
      onChange={() => undefined}
      value={readOnlyValue || ""}
    />
  ) : (
    <ModuleOwnerPicker
      disabled={options.length === 0}
      className="min-w-0"
      label={label}
      onChange={onChange}
      options={options}
      value={value ?? ""}
    />
  );
}

function filterSubStatusOptions(
  options: readonly RuntimeOption[],
  statusValue: string,
) {
  const scopedOptions = options.filter(
    (option) => !option.parentValue || option.parentValue === statusValue,
  );

  return scopedOptions.length ? scopedOptions : options;
}

function defaultSubStatusValue(
  options: readonly RuntimeOption[],
  statusValue: string,
) {
  return filterSubStatusOptions(options, statusValue)[0]?.value ?? "";
}

function displayChoiceValue(value: string, options: readonly RuntimeOption[]) {
  if (!value) return "";
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
  options: readonly { readonly id: string; readonly name: string }[],
  lookupDisplayValues?: Readonly<Record<string, string>>,
) {
  const displayValue = lookupDisplayValues?.[fieldLogicalName];
  if (displayValue) return displayValue;

  const value = readRecordValue(record, fieldLogicalName);
  if (!value) return "";
  return options.find((option) => option.id === value)?.name ?? value;
}
