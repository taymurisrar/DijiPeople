"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type FormControlOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type FormControlType =
  | "text"
  | "email"
  | "number"
  | "password"
  | "tel"
  | "url"
  | "date"
  | "datetime-local"
  | "time"
  | "textarea"
  | "select"
  | "multiselect"
  | "checkbox"
  | "switch"
  | "radio"
  | "currency"
  | "percent"
  | "lookup"
  | "readonly";

export type FormControlValue = string | string[] | boolean | number | null;

export type FormControlProps = {
  type?: FormControlType;
  label: string;
  value: FormControlValue;
  onChange?: (value: FormControlValue) => void;
  options?: ReadonlyArray<FormControlOption>;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  fieldKey?: string;
  helpText?: string;
  className?: string;
  rows?: number;
};

function buildId(label: string, fieldKey?: string) {
  return (
    fieldKey ??
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

function FieldLabel({
  label,
  required,
  helpText,
  error,
}: {
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string;
}) {
  return (
    <span className="flex min-h-5 items-center gap-1 text-sm font-medium text-slate-700">
      <span>
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>

      {helpText ? (
        <span className="group relative inline-flex">
          <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500">
            i
          </span>

          <span className="pointer-events-none absolute left-1/2 top-6 z-40 hidden w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-normal leading-5 text-slate-600 shadow-xl group-hover:block">
            {helpText}
          </span>
        </span>
      ) : null}

      {error ? (
        <span
          aria-label={error}
          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-50 text-[10px] font-bold text-red-600"
          title={error}
        >
          !
        </span>
      ) : null}
    </span>
  );
}

export function FormControl({
  type = "text",
  label,
  value,
  onChange,
  options = [],
  placeholder,
  disabled = false,
  required = false,
  error,
  fieldKey,
  helpText,
  className,
  rows = 4,
}: FormControlProps) {
  const id = buildId(label, fieldKey);
  const describedBy = error ? `${id}-error` : helpText ? `${id}-help` : undefined;

  const inputClass = [
    "mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition",
    "focus:border-slate-500 focus:ring-4 focus:ring-slate-100",
    "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
    error ? "border-red-500 bg-red-50/30" : "border-slate-300",
  ].join(" ");

  const labelNode = (
    <FieldLabel
      error={error}
      helpText={helpText}
      label={label}
      required={required}
    />
  );

  const errorNode = error ? (
    <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-600">
      {error}
    </p>
  ) : null;

  if (type === "readonly") {
    return (
      <div className={className}>
        {labelNode}
        <div
          className={[
            "mt-2 min-h-[46px] rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-700",
            error ? "border-red-500" : "border-slate-200",
          ].join(" ")}
          data-field-key={fieldKey}
          title={error}
        >
          {String(value || "Not available")}
        </div>
        {errorNode}
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <label className={["block", className].filter(Boolean).join(" ")}>
        {labelNode}
        <textarea
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={inputClass}
          data-field-key={fieldKey}
          disabled={disabled}
          id={id}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          required={required}
          rows={rows}
          value={String(value ?? "")}
        />
        {errorNode}
      </label>
    );
  }

  if (type === "lookup") {
    return (
      <LookupControl
        className={className}
        disabled={disabled}
        error={error}
        errorNode={errorNode}
        fieldKey={fieldKey}
        id={id}
        labelNode={labelNode}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        required={required}
        value={String(value ?? "")}
      />
    );
  }

  if (type === "select") {
    return (
      <label className={["block", className].filter(Boolean).join(" ")}>
        {labelNode}
        <select
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={inputClass}
          data-field-key={fieldKey}
          disabled={disabled}
          id={id}
          onChange={(event) => onChange?.(event.target.value)}
          required={required}
          value={String(value ?? "")}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}

          {options.map((option) => (
            <option
              disabled={option.disabled}
              key={option.value || option.label}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
        {errorNode}
      </label>
    );
  }

  if (type === "multiselect") {
    return (
      <label className={["block", className].filter(Boolean).join(" ")}>
        {labelNode}
        <select
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={inputClass}
          data-field-key={fieldKey}
          disabled={disabled}
          id={id}
          multiple
          onChange={(event) =>
            onChange?.(
              Array.from(event.target.selectedOptions).map(
                (option) => option.value,
              ),
            )
          }
          required={required}
          value={Array.isArray(value) ? value : []}
        >
          {options.map((option) => (
            <option
              disabled={option.disabled}
              key={option.value || option.label}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
        {errorNode}
      </label>
    );
  }

  if (type === "checkbox" || type === "switch") {
    return (
      <label
        className={[
          "flex min-h-[70px] items-start gap-3 rounded-2xl border bg-slate-50 px-4 py-3",
          disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
          error ? "border-red-500" : "border-slate-200",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <input
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          checked={Boolean(value)}
          className={type === "switch" ? "sr-only" : "mt-1 h-4 w-4"}
          data-field-key={fieldKey}
          disabled={disabled}
          id={id}
          onChange={(event) => onChange?.(event.target.checked)}
          type="checkbox"
        />

        {type === "switch" ? (
          <span
            className={[
              "mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition",
              value
                ? "border-slate-950 bg-slate-950"
                : "border-slate-300 bg-slate-200",
            ].join(" ")}
          >
            <span
              className={[
                "h-5 w-5 rounded-full bg-white shadow-sm transition",
                value ? "translate-x-5" : "translate-x-0.5",
              ].join(" ")}
            />
          </span>
        ) : null}

        <span className="min-w-0">
          {labelNode}
          {errorNode}
        </span>
      </label>
    );
  }

  if (type === "radio") {
    return (
      <fieldset className={["block", className].filter(Boolean).join(" ")}>
        {labelNode}

        <div
          className={[
            "mt-2 rounded-2xl border px-4 py-3",
            error ? "border-red-500 bg-red-50/30" : "border-slate-200",
          ].join(" ")}
        >
          <div className="space-y-2">
            {options.map((option) => (
              <label
                className={[
                  "flex items-center gap-2 text-sm text-slate-700",
                  option.disabled || disabled
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer",
                ].join(" ")}
                key={option.value}
              >
                <input
                  checked={value === option.value}
                  data-field-key={fieldKey}
                  disabled={disabled || option.disabled}
                  onChange={() => onChange?.(option.value)}
                  type="radio"
                  value={option.value}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {errorNode}
      </fieldset>
    );
  }

  const htmlType =
    type === "currency" || type === "percent" ? "number" : type;

  return (
    <label className={["block", className].filter(Boolean).join(" ")}>
      {labelNode}

      <input
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        className={inputClass}
        data-field-key={fieldKey}
        disabled={disabled}
        id={id}
        inputMode={
          type === "currency" || type === "percent" || type === "number"
            ? "decimal"
            : undefined
        }
        onChange={(event) => {
          const nextValue =
            type === "number" || type === "currency" || type === "percent"
              ? event.target.value === ""
                ? ""
                : Number(event.target.value)
              : event.target.value;

          onChange?.(nextValue);
        }}
        placeholder={placeholder}
        required={required}
        step={type === "currency" || type === "percent" ? "0.01" : undefined}
        type={htmlType}
        value={String(value ?? "")}
      />

      {errorNode}
    </label>
  );
}

function LookupControl({
  id,
  labelNode,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  required,
  error,
  errorNode,
  fieldKey,
  className,
}: {
  id: string;
  labelNode: React.ReactNode;
  value: string;
  onChange?: (value: FormControlValue) => void;
  options: ReadonlyArray<FormControlOption>;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  errorNode: React.ReactNode;
  fieldKey?: string;
  className?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = options.find((option) => option.value === value);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) return options;

    return options.filter((option) => {
      return [option.label, option.value, option.description]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(normalized));
    });
  }, [options, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectOption(option: FormControlOption) {
    if (option.disabled) return;

    onChange?.(option.value);
    setOpen(false);
    setQuery("");
  }

  return (
    <div
      className={["relative", className].filter(Boolean).join(" ")}
      ref={wrapperRef}
    >
      {labelNode}

      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={Boolean(error)}
        className={[
          "mt-2 flex min-h-[46px] w-full items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 text-left text-sm outline-none transition",
          "focus:border-slate-500 focus:ring-4 focus:ring-slate-100",
          disabled
            ? "cursor-not-allowed bg-slate-100 text-slate-500"
            : "text-slate-900",
          error ? "border-red-500 bg-red-50/30" : "border-slate-300",
        ].join(" ")}
        data-field-key={fieldKey}
        disabled={disabled}
        id={id}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={selectedOption ? "truncate" : "truncate text-slate-400"}>
          {selectedOption?.label ?? placeholder ?? "Select value"}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {value ? (
            <span
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              onClick={(event) => {
                event.stopPropagation();
                onChange?.("");
              }}
              role="button"
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}

          <ChevronDown
            className={[
              "h-4 w-4 text-slate-400 transition",
              open ? "rotate-180" : "",
            ].join(" ")}
          />
        </span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              autoFocus
              className="h-9 w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search..."
              value={query}
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const selected = option.value === value;

                return (
                  <button
                    className={[
                      "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                      selected
                        ? "bg-slate-100 text-slate-950"
                        : "text-slate-700 hover:bg-slate-50",
                      option.disabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer",
                    ].join(" ")}
                    disabled={option.disabled}
                    key={option.value || option.label}
                    onClick={() => selectOption(option)}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {option.description}
                        </span>
                      ) : null}
                    </span>

                    {selected ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-900" />
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-6 text-center text-sm text-slate-500">
                No matching options found.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {errorNode}
    </div>
  );
}