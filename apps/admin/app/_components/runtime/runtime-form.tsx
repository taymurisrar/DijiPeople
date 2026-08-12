"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  RuntimeFieldDefinition,
  RuntimeFormDefinition,
} from "@/lib/runtime/platform-runtime.types";
import { ContractDocumentEditor } from "@/app/_components/documents/contract-document-editor";
import type { RuntimeLookupOption } from "@/lib/runtime/runtime-lookups";

type RuntimeValues = Record<string, unknown>;
export function RuntimeForm({
  definition,
  values,
  mode,
  roleKeys = [],
  errors = {},
  onChange,
  formId,
  onSubmit,
  childrenByField = {},
  activeTab: controlledActiveTab,
  onTabChange,
}: {
  definition: RuntimeFormDefinition;
  values: RuntimeValues;
  mode: "create" | "read" | "edit";
  roleKeys?: string[];
  errors?: Record<string, string>;
  onChange: (field: string, value: unknown) => void;
  formId?: string;
  onSubmit?: () => void;
  childrenByField?: Record<string, React.ReactNode>;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}) {
  const [localActiveTab, setLocalActiveTab] = useState(
    definition.tabs?.[0]?.key ?? "",
  );
  const activeTab = controlledActiveTab ?? localActiveTab;
  const setActiveTab = (tab: string) => {
    setLocalActiveTab(tab);
    onTabChange?.(tab);
  };
  const visibleSections = definition.sections.filter(
    (section) => !section.tab || section.tab === activeTab,
  );
  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className="space-y-4"
    >
      {definition.tabs?.length ? (
        <div className="flex overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
          {definition.tabs.map((tab) => (
            <button
              type="button"
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === tab.key ? "bg-[var(--admin-primary)] text-white" : "text-slate-600"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      {visibleSections.map((section) => {
        const fields = definition.fields.filter(
          (field) =>
            field.section === section.key &&
            (!field.tab || field.tab === activeTab) &&
            isVisible(field, values, mode) &&
            (!field.roles?.length ||
              field.roles.some((role) => roleKeys.includes(role))),
        );
        if (!fields.length) return null;
        return (
          <section
            key={section.key}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3">
              <h2 className="text-base font-semibold text-slate-950">
                {section.label}
              </h2>
              {section.description ? (
                <p className="mt-1 text-sm text-slate-500">
                  {section.description}
                </p>
              ) : null}
            </div>
            <div
              className={`grid gap-3 ${section.columns === 3 ? "md:grid-cols-2 xl:grid-cols-3" : section.columns === 2 ? "md:grid-cols-2" : "grid-cols-1"}`}
            >
              {fields.map((field) => (
                <RuntimeField
                  key={field.key}
                  field={field}
                  value={readRuntimeValue(values, field.key)}
                  values={values}
                  error={errors[field.key]}
                  readOnly={
                    mode === "read" ||
                    field.readOnly ||
                    isConditionallyReadOnly(field, values)
                  }
                  onChange={(value) => {
                    onChange(field.key, value);
                    for (const dependentField of definition.fields) {
                      if (
                        dependentField.optionsByFieldValue?.field !== field.key
                      )
                        continue;
                      const nextOptions =
                        dependentField.optionsByFieldValue.values[
                          String(value ?? "")
                        ] ?? [];
                      const currentValue = readRuntimeValue(
                        values,
                        dependentField.key,
                      );
                      if (
                        currentValue &&
                        !nextOptions.some(
                          (option) => option.value === String(currentValue),
                        )
                      )
                        onChange(
                          dependentField.key,
                          nextOptions[0]?.value ?? null,
                        );
                    }
                  }}
                  custom={childrenByField[field.key]}
                />
              ))}
            </div>
          </section>
        );
      })}
    </form>
  );
}

function RuntimeField({
  field,
  value,
  values,
  error,
  readOnly,
  onChange,
  custom,
}: {
  field: RuntimeFieldDefinition;
  value: unknown;
  values: RuntimeValues;
  error?: string;
  readOnly: boolean;
  onChange: (value: unknown) => void;
  custom?: React.ReactNode;
}) {
  const required =
    !readOnly &&
    (field.required ||
      Boolean(
        field.requiredWhen &&
        values[field.requiredWhen.field] === field.requiredWhen.equals,
      ));
  const span =
    field.columnSpan === 3
      ? "md:col-span-2 xl:col-span-3"
      : field.columnSpan === 2
        ? "md:col-span-2"
        : "";
  if (custom) return <div className={span}>{custom}</div>;
  if (
    field.type === "timeline" ||
    field.type === "relatedRecords" ||
    field.type === "process"
  )
    return null;
  if (field.type === "documentEditor") {
    return (
      <div className={span}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          {field.label}
          {required ? <span className="ml-1 text-rose-600">*</span> : null}
        </div>
        <ContractDocumentEditor
          value={String(value ?? "")}
          onChange={onChange}
          readOnly={readOnly}
        />
        {error ? (
          <span className="mt-1 block text-xs text-rose-600">{error}</span>
        ) : null}
      </div>
    );
  }
  return (
    <div
      data-field-key={field.key}
      className={`flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 ${span}`}
    >
      <span className="block min-h-4">
        {field.label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      <FieldControl
        field={field}
        value={value}
        values={values}
        readOnly={readOnly}
        required={required}
        onChange={onChange}
      />
      {error ? (
        <span className="text-xs font-normal normal-case tracking-normal text-rose-600">
          {error}
        </span>
      ) : null}
      {field.description ? (
        <span className="text-[11px] font-normal leading-4 normal-case tracking-normal text-slate-400">
          {field.description}
        </span>
      ) : null}
    </div>
  );
}
function FieldControl({
  field,
  value,
  values,
  readOnly,
  required,
  onChange,
}: {
  field: RuntimeFieldDefinition;
  value: unknown;
  values: RuntimeValues;
  readOnly: boolean;
  required: boolean;
  onChange: (value: unknown) => void;
}) {
  const className = `min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10 disabled:bg-slate-50 disabled:text-slate-500`;
  if (field.type === "richText")
    return (
      <ContractDocumentEditor
        value={String(value ?? "")}
        onChange={onChange}
        readOnly={readOnly}
        placeholders={[]}
      />
    );
  if (field.type === "longText")
    return (
      <textarea
        rows={4}
        className={`${className} py-3`}
        disabled={readOnly}
        required={required}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  if (field.type === "json")
    return (
      <textarea
        rows={6}
        className={`${className} py-3 font-mono text-xs`}
        disabled
        value={
          value == null
            ? ""
            : typeof value === "string"
              ? value
              : JSON.stringify(value, null, 2)
        }
        readOnly
      />
    );
  if (field.type === "boolean")
    return (
      <span
        className={`flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal ${readOnly ? "bg-slate-50 text-slate-500" : "bg-white text-slate-700"}`}
      >
        <input
          className="h-4 w-4 rounded border-slate-300 accent-[var(--admin-primary)]"
          disabled={readOnly}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{Boolean(value) ? "Yes" : "No"}</span>
      </span>
    );
  if (field.type === "option" || field.type === "multiSelect")
    return (
      <SearchableSelect
        ariaLabel={field.label}
        options={resolveFieldOptions(field, values)}
        disabled={readOnly}
        required={required}
        multiple={field.type === "multiSelect"}
        placeholder={`Select ${field.label.toLowerCase()}`}
        value={
          field.type === "multiSelect"
            ? Array.isArray(value)
              ? value.map(String)
              : []
            : String(value ?? "")
        }
        onChange={(next) => onChange(next || (required ? "" : null))}
      />
    );
  if (field.type.includes("Lookup") || field.type === "lookup")
    return (
      <RuntimeLookup
        field={field}
        value={String(value ?? "")}
        disabled={readOnly}
        required={required}
        onChange={onChange}
      />
    );
  if (field.type === "file")
    return (
      <RuntimeFileInput
        field={field}
        value={value}
        disabled={readOnly}
        required={required}
        onChange={onChange}
      />
    );
  if (field.type === "signature")
    return (
      <input
        className={className}
        disabled={readOnly}
        required={required}
        value={
          value && typeof value === "object"
            ? String((value as Record<string, unknown>).typedName ?? "")
            : String(value ?? "")
        }
        onChange={(event) =>
          onChange({ method: "TYPED", typedName: event.target.value })
        }
        placeholder="Full legal name"
        autoComplete="name"
      />
    );
  const type =
    field.type === "email"
      ? "email"
      : field.type === "phone"
        ? "tel"
        : field.type === "url"
          ? "url"
          : field.type === "date"
            ? "date"
            : field.type === "dateTime"
              ? "datetime-local"
              : ["integer", "decimal", "currency", "percentage"].includes(
                    field.type,
                  )
                ? "number"
                : "text";
  return (
    <input
      className={className}
      disabled={readOnly}
      required={required}
      type={type}
      min={field.min}
      max={field.max}
      maxLength={field.maxLength}
      step={
        field.type === "integer"
          ? 1
          : field.type === "percentage"
            ? 0.01
            : "any"
      }
      placeholder={field.placeholder}
      value={String(value ?? "")}
      onChange={(event) =>
        onChange(
          type === "number"
            ? event.target.value === ""
              ? null
              : Number(event.target.value)
            : event.target.value,
        )
      }
    />
  );
}
function RuntimeFileInput({
  field,
  value,
  disabled,
  required,
  onChange,
}: {
  field: RuntimeFieldDefinition;
  value: unknown;
  disabled: boolean;
  required: boolean;
  onChange: (value: unknown) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const current =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm font-normal normal-case tracking-normal">
      <input
        type="file"
        disabled={disabled}
        required={required && !current}
        accept={field.acceptedFileTypes?.join(",")}
        className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const maximum = field.maxFileSizeBytes ?? 10 * 1024 * 1024;
          if (file.size > maximum) {
            setMessage(
              `File exceeds the ${Math.round(maximum / 1024 / 1024)} MB limit.`,
            );
            event.currentTarget.value = "";
            return;
          }
          if (
            field.acceptedFileTypes?.length &&
            !field.acceptedFileTypes.includes(file.type)
          ) {
            setMessage("This file type is not allowed.");
            event.currentTarget.value = "";
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            setMessage(null);
            onChange({
              fileName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              dataUrl: String(reader.result ?? ""),
            });
          };
          reader.onerror = () => setMessage("Unable to read this file.");
          reader.readAsDataURL(file);
        }}
      />
      {current?.fileName ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-xs text-slate-600">
          <span className="truncate">{String(current.fileName)}</span>
          {!disabled ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="font-semibold text-rose-700"
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="mt-2 text-xs text-rose-700">{message}</p> : null}
    </div>
  );
}

function RuntimeLookup({
  field,
  value,
  disabled,
  required,
  onChange,
}: {
  field: RuntimeFieldDefinition;
  value: string;
  disabled: boolean;
  required: boolean;
  onChange: (value: unknown) => void;
}) {
  const [options, setOptions] = useState<RuntimeLookupOption[]>(
    field.options ?? [],
  );
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(field.lookupPath));
  useEffect(() => {
    if (!field.lookupPath) return;
    const controller = new AbortController();
    let active = true;
    fetch(
      `/api/platform-runtime/lookups?path=${encodeURIComponent(field.lookupPath)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { items?: RuntimeLookupOption[]; message?: string }
          | RuntimeLookupOption[]
          | null;
        if (!response.ok) {
          throw new Error(
            !Array.isArray(payload)
              ? payload?.message
              : "Unable to load lookup.",
          );
        }
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        const items = Array.isArray(payload) ? payload : (payload?.items ?? []);
        setOptions(items);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        console.error("Runtime lookup failed", error);
        if (active) {
          setLookupError(
            error instanceof Error ? error.message : "Unable to load lookup.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [field.lookupPath]);
  return (
    <div className="space-y-1.5 font-normal normal-case tracking-normal">
      <SearchableSelect
        ariaLabel={field.label}
        options={options}
        disabled={disabled || loading}
        required={required}
        value={value}
        placeholder={
          loading ? "Loading..." : `Select ${field.label.toLowerCase()}`
        }
        onChange={(next) => onChange(next || (required ? "" : null))}
      />
      {lookupError ? (
        <p className="text-xs text-rose-700" role="alert">
          {lookupError}
        </p>
      ) : null}
    </div>
  );
}

function SearchableSelect({
  ariaLabel,
  options,
  value,
  placeholder,
  disabled = false,
  required = false,
  multiple = false,
  onChange,
}: {
  ariaLabel: string;
  options: RuntimeLookupOption[];
  value: string | string[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  multiple?: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const selectedLabels = selected.map(
    (item) => options.find((option) => option.value === item)?.label ?? item,
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) =>
        `${option.label} ${option.value}`
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : options;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function choose(next: string) {
    if (multiple) {
      onChange(
        selected.includes(next)
          ? selected.filter((item) => item !== next)
          : [...selected, next],
      );
      return;
    }
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div
      ref={rootRef}
      className="relative font-normal normal-case tracking-normal"
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-900 outline-none transition focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
      >
        <span
          className={
            selectedLabels.length ? "truncate" : "truncate text-slate-400"
          }
        >
          {selectedLabels.length ? selectedLabels.join(", ") : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1.5 w-full min-w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (event.key === "Enter" && filtered[0]) {
                  event.preventDefault();
                  choose(filtered[0].value);
                }
              }}
              placeholder={`Search ${ariaLabel.toLowerCase()}...`}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)]"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div
            role="listbox"
            aria-multiselectable={multiple || undefined}
            className="mt-1 max-h-64 overflow-y-auto"
          >
            {!required && !multiple ? (
              <button
                type="button"
                role="option"
                aria-selected={!selected.length}
                onClick={() => choose("")}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
              >
                No selection
                {!selected.length ? <Check className="h-4 w-4" /> : null}
              </button>
            ) : null}
            {filtered.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  key={option.value}
                  onClick={() => choose(option.value)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? (
                    <Check className="h-4 w-4 shrink-0 text-[var(--admin-primary)]" />
                  ) : null}
                </button>
              );
            })}
            {!filtered.length ? (
              <p className="px-3 py-4 text-center text-sm text-slate-500">
                No matching options.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function readRuntimeValue(values: RuntimeValues, path: string) {
  if (path in values) return values[path];
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    return (current as Record<string, unknown>)[part];
  }, values);
}

function isVisible(
  field: RuntimeFieldDefinition,
  values: RuntimeValues,
  mode?: "create" | "read" | "edit",
) {
  if (field.hidden || (mode === "create" && field.hideOnCreate)) return false;
  if (
    mode === "read" &&
    field.hideWhenEmpty &&
    (readRuntimeValue(values, field.key) == null ||
      readRuntimeValue(values, field.key) === "")
  )
    return false;
  if (field.visibleWhenAny?.length)
    return field.visibleWhenAny.some((condition) =>
      matchesVisibilityCondition(condition, values),
    );
  if (!field.visibleWhen) return true;
  return matchesVisibilityCondition(field.visibleWhen, values);
}

function matchesVisibilityCondition(
  condition: NonNullable<RuntimeFieldDefinition["visibleWhen"]>,
  values: RuntimeValues,
) {
  const value = readRuntimeValue(values, condition.field);
  if (condition.hasValue !== undefined)
    return condition.hasValue
      ? value != null && value !== ""
      : value == null || value === "";
  if (condition.in) return condition.in.includes(value);
  return value === condition.equals;
}
function isConditionallyReadOnly(
  field: RuntimeFieldDefinition,
  values: RuntimeValues,
) {
  return Boolean(
    field.readOnlyWhen &&
    values[field.readOnlyWhen.field] === field.readOnlyWhen.equals,
  );
}

function resolveFieldOptions(
  field: RuntimeFieldDefinition,
  values: RuntimeValues,
) {
  const dependent = field.optionsByFieldValue;
  if (!dependent) return field.options ?? [];
  return dependent.values[String(values[dependent.field] ?? "")] ?? [];
}

export function useRuntimeFormState(initialValues: RuntimeValues) {
  const [values, setValues] = useState(initialValues);
  const initial = useMemo(() => JSON.stringify(initialValues), [initialValues]);
  const isDirty = JSON.stringify(values) !== initial;
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);
  return {
    values,
    setValues,
    isDirty,
    update: (field: string, value: unknown) =>
      setValues((current) => ({ ...current, [field]: value })),
    reset: () => setValues(initialValues),
  };
}

export function validateRuntimeValues(
  definition: RuntimeFormDefinition,
  values: RuntimeValues,
) {
  const errors: Record<string, string> = {};
  for (const field of definition.fields) {
    if (!isVisible(field, values)) continue;
    if (field.readOnly || isConditionallyReadOnly(field, values)) continue;
    const required =
      field.required ||
      Boolean(
        field.requiredWhen &&
        values[field.requiredWhen.field] === field.requiredWhen.equals,
      );
    const value = values[field.key];
    if (
      required &&
      (value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0))
    )
      errors[field.key] = "This field is required.";
    if (
      typeof value === "string" &&
      field.maxLength &&
      value.length > field.maxLength
    )
      errors[field.key] = `Maximum length is ${field.maxLength}.`;
    if (
      field.type === "option" &&
      typeof value === "string" &&
      value &&
      !resolveFieldOptions(field, values).some(
        (option) => option.value === value,
      )
    )
      errors[field.key] = `Select a valid ${field.label.toLowerCase()}.`;
    if (
      typeof value === "number" &&
      field.min !== undefined &&
      value < field.min
    )
      errors[field.key] = `Minimum value is ${field.min}.`;
    if (
      typeof value === "number" &&
      field.max !== undefined &&
      value > field.max
    )
      errors[field.key] = `Maximum value is ${field.max}.`;
  }
  validateDateOrder(
    errors,
    values,
    "effectiveDate",
    "expiryDate",
    "Expiry date must be after the effective date.",
    true,
  );
  validateDateOrder(
    errors,
    values,
    "effectiveFrom",
    "effectiveUntil",
    "Terms effective until must be on or after terms effective from.",
  );
  return errors;
}

function validateDateOrder(
  errors: Record<string, string>,
  values: RuntimeValues,
  fromKey: string,
  untilKey: string,
  message: string,
  strictlyAfter = false,
) {
  const from = values[fromKey];
  const until = values[untilKey];
  if (!from || !until) return;
  const fromTime = new Date(String(from)).getTime();
  const untilTime = new Date(String(until)).getTime();
  if (Number.isNaN(fromTime) || Number.isNaN(untilTime)) return;
  if (strictlyAfter ? untilTime <= fromTime : untilTime < fromTime)
    errors[untilKey] = message;
}
