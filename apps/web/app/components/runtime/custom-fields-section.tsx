"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckboxField,
  DateField,
  LookupField,
  MultiSelectField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import {
  buildCustomFieldMetadata,
  supportedCustomFields,
  type CustomFieldDefinition,
} from "@/lib/runtime/custom-fields";
import { loadLookupOptions } from "@/lib/runtime/custom-lookup-options";

/**
 * A system module's custom fields inside a bespoke form — TASK-0035, ADR-0024.
 *
 * The generic record pages place custom fields themselves; a hand-built form
 * (policies, holidays, job openings) embeds this and adds the values it hands
 * back to its own save body as `customFields`. It renders nothing when the
 * tenant has no published custom field on the table.
 */
export function CustomFieldsSection({
  tableKey,
  value,
  onChange,
  errors,
  disabled,
}: {
  readonly tableKey: string;
  /** The record's `customFields`, or {} for a new record. */
  readonly value: Readonly<Record<string, unknown>>;
  readonly onChange: (next: Record<string, unknown>) => void;
  /** Field errors keyed by field, e.g. from `customFieldErrors`. */
  readonly errors?: Readonly<Record<string, readonly string[]>>;
  readonly disabled?: boolean;
}) {
  const [definitions, setDefinitions] = useState<
    readonly CustomFieldDefinition[]
  >([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/custom-fields/${encodeURIComponent(tableKey)}`, {
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (active && Array.isArray(data)) {
          setDefinitions(
            supportedCustomFields(data as CustomFieldDefinition[]),
          );
        }
      })
      /* Without definitions the form is the form it was before. */
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [tableKey]);

  const fields = useMemo(
    () => buildCustomFieldMetadata(definitions, tableKey),
    [definitions, tableKey],
  );

  if (!definitions.length) return null;

  const set = (key: string, next: unknown) =>
    onChange({ ...value, [key]: next });

  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold text-foreground">
        Additional information
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        {definitions.map((definition, index) => {
          const key = definition.logicalName;
          const common = {
            label: definition.displayName,
            required: definition.required,
            error: errors?.[key]?.[0],
          };
          const isDisabled = disabled || definition.readOnly;
          const current = value[key];
          const text = typeof current === "string" ? current : "";

          switch (definition.dataType) {
            case "boolean":
              return (
                <CheckboxField
                  key={key}
                  {...common}
                  checked={current === true}
                  disabled={isDisabled}
                  onChange={(checked) => set(key, checked)}
                />
              );
            case "number":
            case "decimal":
            case "currency":
              return (
                <NumberField
                  key={key}
                  {...common}
                  value={typeof current === "number" ? current : null}
                  disabled={isDisabled}
                  onChange={(next) => set(key, next)}
                />
              );
            case "date":
            case "datetime":
              return (
                <DateField
                  key={key}
                  {...common}
                  value={text.slice(0, 10)}
                  disabled={isDisabled}
                  onChange={(next) => set(key, next || null)}
                />
              );
            case "select":
              return (
                <SelectField
                  key={key}
                  {...common}
                  value={text}
                  options={definition.options.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  disabled={isDisabled}
                  onChange={(next) => set(key, next || null)}
                />
              );
            case "multiselect":
              return (
                <MultiSelectField
                  key={key}
                  {...common}
                  value={Array.isArray(current) ? (current as string[]) : []}
                  options={definition.options.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  disabled={isDisabled}
                  onChange={(next) => set(key, next)}
                />
              );
            case "lookup":
              return (
                <CustomLookupInput
                  key={key}
                  {...common}
                  field={fields[index]}
                  value={text}
                  disabled={isDisabled}
                  onChange={(next) => set(key, next || null)}
                />
              );
            case "textarea":
              return (
                <TextAreaField
                  key={key}
                  {...common}
                  value={text}
                  disabled={isDisabled}
                  onChange={(next) => set(key, next)}
                />
              );
            default:
              return (
                <TextField
                  key={key}
                  {...common}
                  value={text}
                  maxLength={definition.maxLength ?? undefined}
                  disabled={isDisabled}
                  onChange={(next) => set(key, next)}
                />
              );
          }
        })}
      </div>
    </section>
  );
}

function CustomLookupInput({
  field,
  value,
  onChange,
  ...rest
}: {
  readonly field:
    | ReturnType<typeof buildCustomFieldMetadata>[number]
    | undefined;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly label: string;
  readonly required: boolean;
  readonly error?: string;
  readonly disabled?: boolean;
}) {
  const [options, setOptions] = useState<LookupOption[]>([]);
  const target = field?.lookupTargets?.[0];

  const search = (query: string) => {
    if (!target) return;
    void loadLookupOptions(target, query)
      .then((next) => setOptions(next.map((option) => ({ ...option }))))
      .catch(() => setOptions([]));
  };

  useEffect(() => {
    if (!target) return;
    let active = true;
    void loadLookupOptions(target)
      .then((next) => {
        if (active) setOptions(next.map((option) => ({ ...option })));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [target]);

  return (
    <LookupField
      {...rest}
      value={value}
      options={options}
      onChange={onChange}
      onSearch={search}
    />
  );
}
