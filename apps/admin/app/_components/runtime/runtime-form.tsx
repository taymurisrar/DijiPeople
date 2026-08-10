"use client";

import { useEffect, useMemo, useState } from "react";
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
            isVisible(field, values) &&
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
                  value={values[field.key]}
                  values={values}
                  error={errors[field.key]}
                  alignControl={section.columns !== 1}
                  readOnly={
                    mode === "read" ||
                    field.readOnly ||
                    isConditionallyReadOnly(field, values)
                  }
                  onChange={(value) => onChange(field.key, value)}
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
  alignControl,
  readOnly,
  onChange,
  custom,
}: {
  field: RuntimeFieldDefinition;
  value: unknown;
  values: RuntimeValues;
  error?: string;
  alignControl: boolean;
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
    <label
      data-field-key={field.key}
      className={`flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 ${span}`}
    >
      <span className={alignControl ? "md:h-14" : undefined}>
        <span className="block">
          {field.label}
          {required ? <span className="ml-1 text-rose-600">*</span> : null}
        </span>
        {field.description ? (
          <span className="mt-1 block line-clamp-2 text-[11px] font-normal normal-case tracking-normal text-slate-400">
            {field.description}
          </span>
        ) : null}
      </span>
      <FieldControl
        field={field}
        value={value}
        readOnly={readOnly}
        required={required}
        onChange={onChange}
      />
      {error ? (
        <span className="text-xs font-normal normal-case tracking-normal text-rose-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}
function FieldControl({
  field,
  value,
  readOnly,
  required,
  onChange,
}: {
  field: RuntimeFieldDefinition;
  value: unknown;
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
      <select
        className={className}
        disabled={readOnly}
        required={required}
        multiple={field.type === "multiSelect"}
        value={
          field.type === "multiSelect"
            ? Array.isArray(value)
              ? value.map(String)
              : []
            : String(value ?? "")
        }
        onChange={(event) =>
          onChange(
            field.type === "multiSelect"
              ? [...event.currentTarget.selectedOptions].map(
                  (option) => option.value,
                )
              : event.target.value === "" && !required
                ? null
                : event.target.value,
          )
        }
      >
        <option value="">Select {field.label.toLowerCase()}</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
  const [options, setOptions] = useState<RuntimeLookupOption[]>(field.options ?? []);
  const [search, setSearch] = useState("");
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
            !Array.isArray(payload) ? payload?.message : "Unable to load lookup.",
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
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredOptions = normalizedSearch
    ? options.filter((option) =>
        option.label.toLocaleLowerCase().includes(normalizedSearch),
      )
    : options;
  return (
    <div className="space-y-1.5 font-normal normal-case tracking-normal">
      {!disabled && field.lookupPath ? (
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${field.label.toLowerCase()}...`}
          aria-label={`Search ${field.label}`}
          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10"
        />
      ) : null}
      <select
      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal"
      disabled={disabled || loading}
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">
        {loading ? "Loading…" : `Select ${field.label.toLowerCase()}`}
      </option>
      {filteredOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      </select>
      {lookupError ? (
        <p className="text-xs text-rose-700" role="alert">
          {lookupError}
        </p>
      ) : null}
    </div>
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isVisible(field: RuntimeFieldDefinition, values: RuntimeValues) {
  if (field.hidden) return false;
  if (!field.visibleWhen) return true;
  return values[field.visibleWhen.field] === field.visibleWhen.equals;
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
    if (typeof value === "number" && field.min !== undefined && value < field.min)
      errors[field.key] = `Minimum value is ${field.min}.`;
    if (typeof value === "number" && field.max !== undefined && value > field.max)
      errors[field.key] = `Maximum value is ${field.max}.`;
  }
  validateDateOrder(errors, values, "effectiveDate", "expiryDate", "Expiry date must be after the effective date.", true);
  validateDateOrder(errors, values, "effectiveFrom", "effectiveUntil", "Terms effective until must be on or after terms effective from.");
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
