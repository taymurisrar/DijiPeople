"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  RuntimeFieldDefinition,
  RuntimeFormDefinition,
} from "@/lib/runtime/platform-runtime.types";
import { ContractDocumentEditor } from "@/app/_components/documents/contract-document-editor";

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
}) {
  const [activeTab, setActiveTab] = useState(definition.tabs?.[0]?.key ?? "");
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
      className="space-y-5"
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
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-5">
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
              className={`grid gap-4 ${section.columns === 3 ? "md:grid-cols-2 xl:grid-cols-3" : section.columns === 2 ? "md:grid-cols-2" : "grid-cols-1"}`}
            >
              {fields.map((field) => (
                <RuntimeField
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  values={values}
                  error={errors[field.key]}
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
    field.required ||
    Boolean(
      field.requiredWhen &&
      values[field.requiredWhen.field] === field.requiredWhen.equals,
    );
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
      className={`grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 ${span}`}
    >
      <span>
        {field.label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {field.description ? (
        <span className="text-[11px] font-normal normal-case tracking-normal text-slate-400">
          {field.description}
        </span>
      ) : null}
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
  const className = `min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10 disabled:bg-slate-50 disabled:text-slate-500`;
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
  if (field.type === "boolean")
    return (
      <input
        className="h-5 w-5 rounded border-slate-300"
        disabled={readOnly}
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
      />
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
  const [options, setOptions] = useState<
    Array<{ value: string; label: string }>
  >(field.options ?? []);
  const [loading, setLoading] = useState(Boolean(field.lookupPath));
  useEffect(() => {
    if (!field.lookupPath) return;
    const controller = new AbortController();
    let active = true;
    fetch(
      `/api/platform-runtime/lookups?path=${encodeURIComponent(field.lookupPath)}`,
      { signal: controller.signal },
    )
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        const items = Array.isArray(payload) ? payload : (payload.items ?? []);
        setOptions(
          items.map((item: Record<string, unknown>) => ({
            value: String(item.id ?? item.value ?? ""),
            label: String(
              item.fullName ??
                item.displayName ??
                item.name ??
                (item.customer && typeof item.customer === "object"
                  ? (item.customer as Record<string, unknown>).companyName
                  : undefined) ??
                item.companyName ??
                item.label ??
                item.email ??
                item.id ??
                "",
            ),
          })),
        );
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        console.error("Runtime lookup failed", error);
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
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
  }
  return errors;
}
