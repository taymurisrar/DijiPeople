"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  SelectField,
  TextAreaField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import type { CommandPayloadSchema } from "@/lib/runtime/command-payload-schema";

type JsonRecord = Record<string, unknown>;

export function ModuleCommandActionDialog({
  onCancel,
  onSubmit,
  open,
  schema,
}: {
  readonly onCancel: () => void;
  readonly onSubmit: (payload: JsonRecord) => Promise<void>;
  readonly open: boolean;
  readonly schema: CommandPayloadSchema | null;
}) {
  const [context, setContext] = useState<JsonRecord>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !schema?.contextPath) return;
    const contextPath = schema.contextPath;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError("");
      fetch(contextPath)
        .then(async (response) => {
          const data = (await response
            .json()
            .catch(() => null)) as JsonRecord | null;
          if (!response.ok) {
            throw new Error(readMessage(data) || "Unable to load action data.");
          }
          if (!cancelled) setContext(data ?? {});
        })
        .catch((caught) => {
          if (!cancelled) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Unable to load action data.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [open, schema]);

  const visibleFields = useMemo(
    () =>
      (schema?.fields ?? []).filter(
        (field) =>
          !field.visibleWhen ||
          values[field.visibleWhen.field] === field.visibleWhen.equals,
      ),
    [schema, values],
  );

  if (!open || !schema) return null;
  const activeSchema = schema;

  async function submit() {
    setError("");
    for (const field of visibleFields) {
      if (field.required && !values[field.key]) {
        setError(`${field.label} is required.`);
        return;
      }
    }

    const payload: JsonRecord = { ...values };
    if (requiresGeolocation(activeSchema, values, context)) {
      setLoading(true);
      try {
        Object.assign(payload, await captureBrowserLocation());
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Browser location is required.",
        );
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      await onSubmit(payload);
      setValues({});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <aside
        aria-label={schema.title}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface shadow-2xl"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {schema.title}
            </h2>
            {readString(context, "resolvedShift.name") ? (
              <p className="mt-1 text-xs text-muted">
                Shift: {readString(context, "resolvedShift.name")}
              </p>
            ) : null}
          </div>
          <button
            aria-label="Close action"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-muted/20"
            onClick={onCancel}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-4 p-5">
          {visibleFields.map((field) => {
            const options = readOptions(context, field.optionsSource);
            if (field.type === "multiline") {
              return (
                <TextAreaField
                  key={field.key}
                  label={field.label}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, [field.key]: value }))
                  }
                  value={values[field.key] ?? ""}
                />
              );
            }
            return (
              <SelectField
                key={field.key}
                label={field.label}
                onChange={(value) =>
                  setValues((current) => ({ ...current, [field.key]: value }))
                }
                options={options}
                required={field.required}
                value={values[field.key] ?? ""}
              />
            );
          })}
          {requiresGeolocation(activeSchema, values, context) ? (
            <p className="rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-foreground">
              Browser location will be captured when you submit.
            </p>
          ) : null}
          {readString(context, "blockedReason") ? (
            <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              {readString(context, "blockedReason")}
            </p>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              className="rounded-md border border-border px-4 py-2 text-sm font-medium"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={
                loading || Boolean(readString(context, "blockedReason"))
              }
              onClick={() => void submit()}
              type="button"
            >
              {loading ? "Working..." : schema.submitLabel}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function readOptions(context: JsonRecord, source?: string): LookupOption[] {
  const value = source ? readPath(context, source) : null;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") {
      return [{ id: item, name: titleCase(item) }];
    }
    if (!item || typeof item !== "object") return [];
    const record = item as JsonRecord;
    const id = String(record.id ?? record.value ?? "");
    const name = String(record.name ?? record.label ?? id);
    return id ? [{ id, name }] : [];
  });
}

function requiresGeolocation(
  schema: CommandPayloadSchema,
  values: Record<string, string>,
  context: JsonRecord,
) {
  const rule = schema.geolocation?.requiredWhen;
  if (!rule) return false;
  const value = rule.field.includes(".")
    ? readPath(context, rule.field)
    : values[rule.field];
  return typeof value === "string" && rule.values.includes(value);
}

function captureBrowserLocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Browser geolocation is unavailable."));
  }
  return new Promise<JsonRecord>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          remoteLatitude: position.coords.latitude,
          remoteLongitude: position.coords.longitude,
          locationAccuracy: position.coords.accuracy,
          locationCapturedAt: new Date(position.timestamp).toISOString(),
        }),
      () => reject(new Error("Browser location permission is required.")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
    );
  });
}

function readPath(source: JsonRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    return (value as JsonRecord)[key];
  }, source);
}

function readString(source: JsonRecord, path: string) {
  const value = readPath(source, path);
  return typeof value === "string" ? value : "";
}

function readMessage(source: JsonRecord | null) {
  return source && typeof source.message === "string" ? source.message : "";
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/(^|_)([a-z])/g, (_match, _prefix, letter: string) =>
      letter.toUpperCase(),
    );
}
