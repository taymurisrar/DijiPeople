"use client";

import { useState } from "react";
import type { FieldValueMap } from "@/app/components/metadata/runtime-metadata-form-renderer";
import { LocationGeofencePicker } from "@/app/components/location/location-geofence-picker";
import { Button } from "@/app/components/ui/button";
import { NumberField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { captureDeviceLocation } from "@/lib/location/location-capture";
import { isValidLatitude, isValidLongitude } from "@/lib/location/geo";
import {
  CUSTOM_PRESET_KEY,
  LOCATION_ACCURACY_PRESETS,
  normalizeMeters,
  resolvePresetKey,
} from "@/lib/location/geofence-presets";
import {
  evaluateGeofenceTest,
  geofenceTestVerdictLabel,
  type GeofenceTestResult,
} from "@/lib/location/geofence-test";
import {
  metersLabel,
  validateWorkSiteDraft,
  type WorkSiteReadinessPayload,
} from "../../_lib/work-site-configuration";

type SectionContext = {
  readonly values: FieldValueMap;
  readonly mode: "detail" | "edit" | "new";
  readonly onValuesChange?: (values: FieldValueMap) => void;
};

/**
 * Map, pin and geofence radius for the Work Site record.
 *
 * Writes straight into the record's draft values through the same change
 * handler every other field uses, so there is one save, one validation pass and
 * one API call. The picker itself is location-generic; this wrapper is the only
 * part that knows the column names.
 */
export function WorkSiteGeofenceSection({
  context,
  readiness,
}: {
  readonly context: SectionContext;
  readonly readiness: WorkSiteReadinessPayload | null;
}) {
  const { values, mode, onValuesChange } = context;
  const readOnly = mode === "detail" || !onValuesChange;
  const latitude = numberOrNull(values.latitude);
  const longitude = numberOrNull(values.longitude);
  const radiusMeters = numberOrNull(values.allowedRadiusMeters);
  const errors = validateWorkSiteDraft(values);
  const inheritedRadius = readiness?.tenantDefaults.radiusMeters ?? null;

  if (readOnly) {
    return (
      <div className="grid gap-3">
        <ReadOnlyRow
          label="Coordinates"
          value={
            isValidLatitude(latitude) && isValidLongitude(longitude)
              ? `${latitude}, ${longitude}`
              : "Not configured"
          }
        />
        <ReadOnlyRow
          label="Geofence radius"
          value={
            radiusMeters
              ? metersLabel(radiusMeters)
              : inheritedRadius
                ? `${metersLabel(inheritedRadius)} (tenant setting)`
                : "Not configured"
          }
        />
        {isValidLatitude(latitude) && isValidLongitude(longitude) ? (
          <LocationGeofencePicker
            disabled
            onChange={() => undefined}
            value={{ latitude, longitude, radiusMeters: radiusMeters ?? inheritedRadius }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <LocationGeofencePicker
      addressText={stringOrEmpty(values.addressLine1)}
      defaultRadiusMeters={inheritedRadius ?? 100}
      errors={{
        latitude: errors.latitude,
        longitude: errors.longitude,
        radiusMeters: errors.allowedRadiusMeters,
      }}
      onAddressSelected={(suggestion) =>
        onValuesChange?.({
          addressLine1: suggestion.label,
          ...(suggestion.city ? { city: suggestion.city } : {}),
          ...(suggestion.state ? { state: suggestion.state } : {}),
          ...(suggestion.postalCode ? { zipCode: suggestion.postalCode } : {}),
        })
      }
      onChange={(next) =>
        onValuesChange?.({
          latitude: next.latitude,
          longitude: next.longitude,
          allowedRadiusMeters: next.radiusMeters,
        })
      }
      radiusHint="Presets are recommendations, not standards."
      value={{ latitude, longitude, radiusMeters }}
    />
  );
}

/**
 * How precise a device's own position report must be before it is trusted.
 *
 * Presented in business terms with the exact metres still editable. Blank means
 * the tenant setting applies, which is stated rather than implied.
 */
export function WorkSiteAccuracySection({
  context,
  readiness,
}: {
  readonly context: SectionContext;
  readonly readiness: WorkSiteReadinessPayload | null;
}) {
  const { values, mode, onValuesChange } = context;
  const readOnly = mode === "detail" || !onValuesChange;
  const value = numberOrNull(values.maximumAccuracyMeters);
  const tenantValue = readiness?.tenantDefaults.maximumAccuracyMeters ?? null;
  const presetKey = resolvePresetKey(value, LOCATION_ACCURACY_PRESETS);
  const errors = validateWorkSiteDraft(values);

  const explanation = (
    <p className="text-sm text-muted">
      If an employee&rsquo;s device cannot determine its location accurately
      enough, DijiPeople will ask them to improve location accuracy and try
      again. Accuracy depends on the device, the building and the weather, so a
      stricter setting is not a guarantee of a genuine location.
    </p>
  );

  if (readOnly) {
    return (
      <div className="grid gap-2">
        <ReadOnlyRow
          label="Location accuracy requirement"
          value={
            value
              ? metersLabel(value)
              : tenantValue
                ? `${metersLabel(tenantValue)} (tenant setting)`
                : "Use tenant setting"
          }
        />
        {explanation}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          aria-pressed={value === null}
          className={presetButtonClass(value === null)}
          onClick={() => onValuesChange?.({ maximumAccuracyMeters: null })}
          type="button"
        >
          Use tenant setting
          <span className="ml-1 text-xs font-normal opacity-80">
            {tenantValue ? `${tenantValue} m` : "not set"}
          </span>
        </button>
        {LOCATION_ACCURACY_PRESETS.map((preset) => (
          <button
            aria-pressed={presetKey === String(preset.value)}
            className={presetButtonClass(presetKey === String(preset.value))}
            key={preset.value}
            onClick={() =>
              onValuesChange?.({ maximumAccuracyMeters: preset.value })
            }
            type="button"
          >
            {preset.label}
            <span className="ml-1 text-xs font-normal opacity-80">
              {preset.value} m
            </span>
          </button>
        ))}
        <button
          aria-pressed={presetKey === CUSTOM_PRESET_KEY}
          className={presetButtonClass(presetKey === CUSTOM_PRESET_KEY)}
          onClick={() => onValuesChange?.({ maximumAccuracyMeters: value ?? 100 })}
          type="button"
        >
          Custom
        </button>
      </div>

      <NumberField
        error={errors.maximumAccuracyMeters}
        hint="Leave empty to use the tenant setting."
        label="Exact accuracy requirement (m)"
        min={1}
        onChange={(next) =>
          onValuesChange?.({
            maximumAccuracyMeters: normalizeMeters(next, { min: 1, max: 100_000 }),
          })
        }
        touched
        value={value}
      />

      {explanation}
    </div>
  );
}

/**
 * Configuration validation, not attendance.
 *
 * Runs only on an explicit click, reads the browser position once, and compares
 * it with the configured circle in the browser. It posts nothing: no
 * AttendanceLocationEvidence, no RawAttendanceEvent, no attendance record of any
 * kind is created by using it.
 */
export function WorkSiteTestLocationSection({
  context,
  readiness,
}: {
  readonly context: SectionContext;
  readonly readiness: WorkSiteReadinessPayload | null;
}) {
  const { values } = context;
  const [result, setResult] = useState<GeofenceTestResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const latitude = numberOrNull(values.latitude);
  const longitude = numberOrNull(values.longitude);
  const radiusMeters =
    numberOrNull(values.allowedRadiusMeters) ??
    readiness?.tenantDefaults.radiusMeters ??
    null;
  const maximumAccuracyMeters =
    numberOrNull(values.maximumAccuracyMeters) ??
    readiness?.tenantDefaults.maximumAccuracyMeters ??
    null;
  const ready =
    isValidLatitude(latitude) && isValidLongitude(longitude) && Boolean(radiusMeters);

  async function runTest() {
    if (!ready) return;
    setTesting(true);
    setMessage(null);
    setResult(null);
    try {
      const captured = await captureDeviceLocation({ highAccuracy: true });
      if (!captured.ok) {
        setMessage(captured.message);
        return;
      }
      setResult(
        evaluateGeofenceTest({
          site: { latitude: latitude as number, longitude: longitude as number },
          captured: {
            latitude: captured.latitude,
            longitude: captured.longitude,
          },
          radiusMeters: radiusMeters as number,
          accuracyMeters: captured.accuracyMeters ?? null,
          maximumAccuracyMeters,
        }),
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-white p-4">
      <p className="text-sm text-muted">
        Check the geofence from where you are standing. This reads your browser
        location once, on this click only, and creates no attendance record.
      </p>
      <div>
        <Button
          disabled={!ready}
          loading={testing}
          onClick={() => void runTest()}
          type="button"
          variant="secondary"
        >
          Test this location
        </Button>
      </div>
      {!ready ? (
        <p className="text-sm text-muted">
          Configure coordinates and a geofence radius before testing.
        </p>
      ) : null}
      {message ? <p className="text-sm text-amber-700">{message}</p> : null}
      {result ? (
        <dl className="grid gap-2 sm:grid-cols-4">
          <TestMetric label="Distance from work site" value={`${result.distanceMeters} m`} />
          <TestMetric
            label="Reported accuracy"
            value={
              result.accuracyMeters === null
                ? "Not reported"
                : `${result.accuracyMeters} m`
            }
          />
          <TestMetric label="Geofence" value={`${result.radiusMeters} m`} />
          <div className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Result
            </dt>
            <dd className="mt-1">
              <StatusPill
                tone={
                  result.verdict === "INSIDE"
                    ? "good"
                    : result.verdict === "OUTSIDE"
                      ? "danger"
                      : "warning"
                }
              >
                {geofenceTestVerdictLabel(result)}
              </StatusPill>
            </dd>
          </div>
          {result.accuracyExceedsRequirement ? (
            <p className="text-sm text-amber-700 sm:col-span-4">
              This reading is less accurate than the configured requirement, so a
              real punch from here would be asked to try again.
            </p>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

function TestMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function ReadOnlyRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function presetButtonClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-sm font-medium transition ${
    active
      ? "border-accent bg-accent-soft text-accent"
      : "border-border bg-white text-foreground hover:border-accent"
  }`;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value : "";
}
