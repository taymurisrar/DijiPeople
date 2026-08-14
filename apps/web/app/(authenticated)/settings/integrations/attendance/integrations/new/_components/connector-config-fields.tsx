"use client";

import type { ConnectorField, SecretState } from "../../../_lib/types";

/**
 * Renders a connector's configuration form from the schema the API returned.
 *
 * Nothing about any specific connector is hard-coded here. Adding Hikvision or
 * Suprema later means the API returns a different field list and this component
 * renders it — no change to this file.
 *
 * SECRETS. A secret field is never populated with a value, because the API never
 * sends one. When a secret is already stored the input renders empty with a
 * "Configured" marker, and leaving it empty means "keep what is stored". That is
 * what stops an edit from wiping a working comm key simply because the browser
 * had nothing to put in the box.
 */
export function ConnectorConfigFields({
  fields,
  values,
  secretState,
  errors,
  disabled,
  onChange,
}: {
  fields: ConnectorField[];
  values: Record<string, string>;
  /** Existing stored secrets, by field key. Absent when creating. */
  secretState?: Record<string, SecretState>;
  errors?: Record<string, string>;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted">
        This connector needs no additional connection settings.
      </p>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {fields.map((field) => {
        const isSecret = field.secret || field.type === "secret";
        const stored = secretState?.[field.key];
        const error = errors?.[field.key];
        const inputId = `connector-field-${field.key}`;

        return (
          <div
            key={field.key}
            className={field.type === "select" ? "sm:col-span-1" : undefined}
          >
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor={inputId}
            >
              {field.label}
              {field.required ? (
                <span className="ml-1 text-red-600" aria-hidden="true">
                  *
                </span>
              ) : null}
            </label>

            {field.type === "select" && field.options ? (
              <select
                id={inputId}
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                value={values[field.key] ?? ""}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.value)}
              >
                <option value="">Select…</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === "boolean" ? (
              <select
                id={inputId}
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                value={values[field.key] ?? ""}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.value)}
              >
                <option value="">Select…</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                id={inputId}
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                // A secret uses a password control and is never pre-filled.
                type={
                  isSecret ? "password" : field.type === "number" ? "number" : "text"
                }
                inputMode={field.type === "number" ? "numeric" : undefined}
                autoComplete={isSecret ? "new-password" : "off"}
                placeholder={
                  isSecret && stored?.configured
                    ? "Leave blank to keep the current value"
                    : field.placeholder
                }
                min={field.min}
                max={field.max}
                value={values[field.key] ?? ""}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
            )}

            <div className="mt-1 flex flex-wrap items-center gap-2">
              {isSecret && stored?.configured ? (
                <span
                  className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                  data-testid={`secret-configured-${field.key}`}
                >
                  Configured
                </span>
              ) : null}
              {isSecret && !stored?.configured ? (
                <span className="text-xs text-muted">
                  Stored securely. It cannot be viewed again after saving.
                </span>
              ) : null}
            </div>

            {field.helpText ? (
              <p className="mt-1 text-xs leading-5 text-muted">
                {field.helpText}
              </p>
            ) : null}

            {error ? (
              <p
                className="mt-1 text-xs font-medium text-red-600"
                data-testid={`field-error-${field.key}`}
              >
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
