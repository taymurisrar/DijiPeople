"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  SelectField,
  TextAreaField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import {
  buildLocationPayload,
  captureDeviceLocation,
  captureIpFallbackLocation,
  type LocationCaptureResult,
} from "@/lib/location/location-capture";
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
  const [locationFailure, setLocationFailure] =
    useState<LocationCaptureResult | null>(null);
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
      const location = await captureDeviceLocation({
        timeoutSeconds: readNumber(
          context,
          "policy.locationTimeoutSeconds",
          15,
        ),
        highAccuracy: readBoolean(
          context,
          "policy.highAccuracyLocation",
          true,
        ),
      });
      if (!location.ok) {
        setLocationFailure(location);
        setError(location.message);
        setLoading(false);
        return;
      }
      setLocationFailure(null);
      Object.assign(
        payload,
        buildLocationPayload(location, {
          userAgent:
            readBoolean(context, "policy.storeUserAgent", false) &&
            typeof navigator !== "undefined"
              ? navigator.userAgent
              : undefined,
        }),
      );
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
              Location will be captured when you submit.
            </p>
          ) : null}
          {locationFailure && !locationFailure.ok ? (
            <div className="grid gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
              <p className="text-danger">{locationFailure.message}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-foreground"
                  disabled={loading}
                  onClick={() => void submit()}
                  type="button"
                >
                  Retry Location
                </button>
                {readBoolean(context, "policy.allowIpFallback", false) ? (
                  <button
                    className="rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-foreground"
                    disabled={loading}
                    onClick={() => void submitWithApproximateLocation()}
                    type="button"
                  >
                    Use Approximate Location
                  </button>
                ) : null}
                {readBoolean(
                  context,
                  "policy.allowManualLocationException",
                  false,
                ) ? (
                  <button
                    className="rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-foreground"
                    disabled={loading}
                    onClick={() => void submitManualLocationException()}
                    type="button"
                  >
                    Request Manual Checkout
                  </button>
                ) : null}
              </div>
            </div>
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

  async function submitWithApproximateLocation() {
    setError("");
    setLoading(true);
    const location = await captureIpFallbackLocation(
      readBoolean(context, "policy.allowIpFallback", false),
    );
    if (!location.ok) {
      setLocationFailure(location);
      setError(location.message);
      setLoading(false);
      return;
    }

    try {
      await onSubmit({
        ...values,
        ...buildLocationPayload(location, {
          failureReason: location.failureReason,
          userAgent:
            readBoolean(context, "policy.storeUserAgent", false) &&
            typeof navigator !== "undefined"
              ? navigator.userAgent
              : undefined,
        }),
      });
      setValues({});
      setLocationFailure(null);
    } finally {
      setLoading(false);
    }
  }

  async function submitManualLocationException() {
    setError("");
    setLoading(true);
    try {
      await onSubmit({
        ...values,
        ...buildLocationPayload(
          locationFailure ?? {
            ok: false,
            reason: "UNKNOWN",
            message: "Manual location exception requested.",
          },
          {
            manualLocationExceptionRequested: true,
            userAgent:
              readBoolean(context, "policy.storeUserAgent", false) &&
              typeof navigator !== "undefined"
                ? navigator.userAgent
                : undefined,
          },
        ),
      });
      setValues({});
      setLocationFailure(null);
    } finally {
      setLoading(false);
    }
  }
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
  if (!schema.geolocation) return false;
  const mode =
    values.attendanceMode ||
    readString(context, "todayAttendance.attendanceMode") ||
    readString(context, "defaultAttendanceMode");
  const modes = readStringArray(context, "policy.locationRequiredForModes");
  const commandRequiresCapture =
    schema.key === "attendance.checkIn"
      ? readBoolean(context, "policy.captureLocationOnCheckIn", false)
      : readBoolean(context, "policy.captureLocationOnCheckOut", false);

  return Boolean(commandRequiresCapture && mode && modes.includes(mode));
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

function readStringArray(source: JsonRecord, path: string) {
  const value = readPath(source, path);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readBoolean(source: JsonRecord, path: string, fallback: boolean) {
  const value = readPath(source, path);
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(source: JsonRecord, path: string, fallback: number) {
  const value = readPath(source, path);
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
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
