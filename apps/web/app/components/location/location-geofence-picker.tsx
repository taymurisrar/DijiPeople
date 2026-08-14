"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { NumberField, TextField } from "@/app/components/ui/form-control";
import { captureDeviceLocation } from "@/lib/location/location-capture";
import {
  isValidLatitude,
  isValidLongitude,
  normalizeCoordinates,
  parseCoordinate,
  zoomForRadius,
  type Coordinates,
} from "@/lib/location/geo";
import {
  CUSTOM_PRESET_KEY,
  GEOFENCE_RADIUS_PRESETS,
  normalizeMeters,
  presetDescription,
  resolvePresetKey,
  type NumericPreset,
} from "@/lib/location/geofence-presets";
import { GeofenceMap } from "./geofence-map";

export type LocationGeofenceValue = {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly radiusMeters: number | null;
};

type AddressSuggestion = {
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly city?: string;
  readonly state?: string;
  readonly country?: string;
  readonly postalCode?: string;
};

/**
 * Pin, geofence circle and radius, as one control.
 *
 * Location-generic on purpose: nothing here knows what the circle is used for,
 * so client sites, project sites and field boundaries can reuse it. The caller
 * supplies the labels that carry business meaning.
 *
 * The map is never the only way in. Every value it produces is also editable as
 * a number, which keeps the control usable by keyboard and when tiles fail.
 */
export function LocationGeofencePicker({
  value,
  onChange,
  disabled = false,
  addressText,
  onAddressSelected,
  radiusPresets = GEOFENCE_RADIUS_PRESETS,
  radiusLabel = "Geofence radius",
  radiusHint,
  defaultRadiusMeters = 100,
  fallbackCenter = { latitude: 24.8607, longitude: 67.0011 },
  geocodeEndpoint = "/api/locations/geocode",
  mapHeight = 340,
  errors,
}: {
  readonly value: LocationGeofenceValue;
  readonly onChange: (next: LocationGeofenceValue) => void;
  readonly disabled?: boolean;
  readonly addressText?: string;
  readonly onAddressSelected?: (suggestion: AddressSuggestion) => void;
  readonly radiusPresets?: readonly NumericPreset[];
  readonly radiusLabel?: string;
  readonly radiusHint?: string;
  readonly defaultRadiusMeters?: number;
  readonly fallbackCenter?: Coordinates;
  readonly geocodeEndpoint?: string;
  readonly mapHeight?: number;
  readonly errors?: {
    readonly latitude?: string;
    readonly longitude?: string;
    readonly radiusMeters?: string;
  };
}) {
  const hasCoordinates =
    isValidLatitude(value.latitude) && isValidLongitude(value.longitude);
  const center: Coordinates = hasCoordinates
    ? { latitude: value.latitude as number, longitude: value.longitude as number }
    : fallbackCenter;

  const [latitudeText, setLatitudeText] = useState(() => coordinateText(value.latitude));
  const [longitudeText, setLongitudeText] = useState(() =>
    coordinateText(value.longitude),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [nearbyAddress, setNearbyAddress] = useState<AddressSuggestion | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateMessage, setLocateMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(() =>
    zoomForRadius(value.radiusMeters ?? defaultRadiusMeters, center.latitude, mapHeight),
  );
  const suppressTextSync = useRef(false);

  /* Coordinates changed elsewhere (map click, current location, search) must
   * show up in the manual fields — the two are one value, not two. */
  useEffect(() => {
    if (suppressTextSync.current) {
      suppressTextSync.current = false;
      return;
    }
    setLatitudeText(coordinateText(value.latitude));
    setLongitudeText(coordinateText(value.longitude));
  }, [value.latitude, value.longitude]);

  const radiusPresetKey = resolvePresetKey(value.radiusMeters, radiusPresets);

  const applyCoordinates = useCallback(
    (next: Coordinates) => {
      const normalized = normalizeCoordinates(next);
      setNearbyAddress(null);
      onChange({
        ...value,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        // Placing a pin without a radius would save a point nothing can test
        // against, so the first placement seeds the default.
        radiusMeters: value.radiusMeters ?? defaultRadiusMeters,
      });
    },
    [defaultRadiusMeters, onChange, value],
  );

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSearchMessage("Enter at least 3 characters to search.");
      setSuggestions([]);
      return;
    }

    setSearching(true);
    setSearchMessage(null);
    try {
      const response = await fetch(
        `${geocodeEndpoint}?q=${encodeURIComponent(trimmed)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as {
        results?: AddressSuggestion[];
      } | null;
      const results = payload?.results ?? [];
      setSuggestions(results);
      setSearchMessage(
        results.length
          ? null
          : "No matching places were found. You can still place the pin on the map.",
      );
    } catch {
      setSuggestions([]);
      setSearchMessage(
        "Address search is unavailable right now. Place the pin on the map instead.",
      );
    } finally {
      setSearching(false);
    }
  }, [geocodeEndpoint, query]);

  const suggestNearbyAddress = useCallback(async () => {
    if (!hasCoordinates) return;
    setNearbyAddress(null);
    try {
      const response = await fetch(
        `${geocodeEndpoint}?latitude=${encodeURIComponent(
          String(value.latitude),
        )}&longitude=${encodeURIComponent(String(value.longitude))}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as {
        results?: AddressSuggestion[];
      } | null;
      setNearbyAddress(payload?.results?.[0] ?? null);
    } catch {
      setNearbyAddress(null);
    }
  }, [geocodeEndpoint, hasCoordinates, value.latitude, value.longitude]);

  const moveToCurrentLocation = useCallback(async () => {
    setLocating(true);
    setLocateMessage(null);
    try {
      const result = await captureDeviceLocation({ highAccuracy: true });
      if (!result.ok) {
        setLocateMessage(result.message);
        return;
      }
      applyCoordinates({ latitude: result.latitude, longitude: result.longitude });
      setZoom(
        zoomForRadius(
          value.radiusMeters ?? defaultRadiusMeters,
          result.latitude,
          mapHeight,
        ),
      );
      setLocateMessage(
        result.accuracyMeters === undefined
          ? "Pin moved to your current location."
          : `Pin moved to your current location (accuracy ${Math.round(
              result.accuracyMeters,
            )} m).`,
      );
    } finally {
      setLocating(false);
    }
  }, [applyCoordinates, defaultRadiusMeters, mapHeight, value.radiusMeters]);

  const radiusDescription = useMemo(
    () => presetDescription(value.radiusMeters, radiusPresets),
    [radiusPresets, value.radiusMeters],
  );

  return (
    <div className="grid gap-4">
      {!disabled ? (
        <div className="grid gap-3 rounded-2xl border border-border bg-white p-4">
          <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <TextField
              hint="Search a place, then choose a result to move the pin."
              label="Search location"
              onChange={setQuery}
              placeholder="Karachi Office, Clifton, Shahrah-e-Faisal…"
              type="search"
              value={query}
            />
            <Button
              loading={searching}
              onClick={() => void runSearch()}
              type="button"
              variant="secondary"
            >
              Locate address on map
            </Button>
            <Button
              loading={locating}
              onClick={() => void moveToCurrentLocation()}
              type="button"
              variant="secondary"
            >
              Use my current location
            </Button>
          </div>

          {searchMessage ? (
            <p className="text-sm text-muted">{searchMessage}</p>
          ) : null}

          {suggestions.length ? (
            <ul className="grid gap-1">
              {suggestions.map((suggestion) => (
                <li key={`${suggestion.latitude}:${suggestion.longitude}:${suggestion.label}`}>
                  <button
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-foreground hover:border-accent"
                    onClick={() => {
                      applyCoordinates(suggestion);
                      setZoom(
                        zoomForRadius(
                          value.radiusMeters ?? defaultRadiusMeters,
                          suggestion.latitude,
                          mapHeight,
                        ),
                      );
                      setSuggestions([]);
                      onAddressSelected?.(suggestion);
                    }}
                    type="button"
                  >
                    {suggestion.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {locateMessage ? (
            <p className="text-sm text-muted">{locateMessage}</p>
          ) : null}
        </div>
      ) : null}

      <GeofenceMap
        ariaLabel="Location and geofence map"
        center={center}
        height={mapHeight}
        interactive={!disabled}
        onCenterChange={disabled ? undefined : applyCoordinates}
        onZoomChange={setZoom}
        radiusMeters={value.radiusMeters}
        zoom={zoom}
      />

      {!hasCoordinates ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No coordinates are configured yet. Search for the address, click the map,
          or enter latitude and longitude under Advanced location settings.
        </p>
      ) : (
        <p className="text-sm text-muted">
          {disabled
            ? "Coordinates and geofence as configured."
            : "Click the map or drag to move the pin. The circle shows the geofence radius."}
        </p>
      )}

      {!disabled && hasCoordinates ? (
        <div className="grid gap-2">
          <div>
            <Button
              onClick={() => void suggestNearbyAddress()}
              size="sm"
              type="button"
              variant="ghost"
            >
              Suggest an address for this pin
            </Button>
          </div>
          {nearbyAddress ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Suggested address
                </p>
                <p className="text-sm text-foreground">{nearbyAddress.label}</p>
              </div>
              {onAddressSelected ? (
                <Button
                  onClick={() => onAddressSelected(nearbyAddress)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Use this address
                </Button>
              ) : null}
            </div>
          ) : null}
          {addressText ? (
            <p className="text-xs text-muted">Saved address: {addressText}</p>
          ) : null}
        </div>
      ) : null}

      <fieldset className="grid gap-3 rounded-2xl border border-border bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          {radiusLabel}
        </legend>
        <div className="flex flex-wrap gap-2">
          {radiusPresets.map((preset) => (
            <button
              aria-pressed={radiusPresetKey === String(preset.value)}
              className={presetButtonClass(radiusPresetKey === String(preset.value))}
              disabled={disabled}
              key={preset.value}
              onClick={() => onChange({ ...value, radiusMeters: preset.value })}
              type="button"
            >
              {preset.label}
              <span className="ml-1 text-xs font-normal opacity-80">
                {preset.value} m
              </span>
            </button>
          ))}
          <button
            aria-pressed={radiusPresetKey === CUSTOM_PRESET_KEY}
            className={presetButtonClass(radiusPresetKey === CUSTOM_PRESET_KEY)}
            disabled={disabled}
            onClick={() =>
              onChange({
                ...value,
                radiusMeters: value.radiusMeters ?? defaultRadiusMeters,
              })
            }
            type="button"
          >
            Custom
          </button>
        </div>

        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Radius slider</span>
            <input
              aria-label="Geofence radius in metres"
              className="w-full accent-[color:var(--color-accent,#2563eb)]"
              disabled={disabled}
              max={1000}
              min={10}
              onChange={(event) =>
                onChange({
                  ...value,
                  radiusMeters: normalizeMeters(event.target.value, {
                    min: 1,
                    max: 100_000,
                  }),
                })
              }
              step={10}
              type="range"
              value={value.radiusMeters ?? defaultRadiusMeters}
            />
          </label>
          <NumberField
            disabled={disabled}
            error={errors?.radiusMeters}
            label="Exact radius (m)"
            min={1}
            onChange={(next) =>
              onChange({
                ...value,
                radiusMeters: normalizeMeters(next, { min: 1, max: 100_000 }),
              })
            }
            step={1}
            touched
            value={value.radiusMeters ?? null}
          />
        </div>

        <p className="text-sm text-muted">
          {radiusDescription ||
            radiusHint ||
            "Presets are recommendations, not standards. Real coverage varies with buildings, weather and device hardware."}
        </p>
      </fieldset>

      <details
        className="rounded-2xl border border-border bg-white p-4"
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        open={advancedOpen}
      >
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Advanced location settings
        </summary>
        <p className="mt-2 text-sm text-muted">
          Exact coordinates for technical administrators. Editing them moves the
          pin.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField
            disabled={disabled}
            error={errors?.latitude}
            hint="-90 to 90"
            label="Latitude"
            onChange={(next) => {
              suppressTextSync.current = true;
              setLatitudeText(next);
              const parsed = parseCoordinate(next);
              if (parsed !== null && isValidLatitude(parsed)) {
                onChange({ ...value, latitude: parsed });
              } else if (next.trim() === "") {
                onChange({ ...value, latitude: null });
              }
            }}
            touched
            value={latitudeText}
          />
          <TextField
            disabled={disabled}
            error={errors?.longitude}
            hint="-180 to 180"
            label="Longitude"
            onChange={(next) => {
              suppressTextSync.current = true;
              setLongitudeText(next);
              const parsed = parseCoordinate(next);
              if (parsed !== null && isValidLongitude(parsed)) {
                onChange({ ...value, longitude: parsed });
              } else if (next.trim() === "") {
                onChange({ ...value, longitude: null });
              }
            }}
            touched
            value={longitudeText}
          />
        </div>
      </details>
    </div>
  );
}

function presetButtonClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-sm font-medium transition ${
    active
      ? "border-accent bg-accent-soft text-accent"
      : "border-border bg-white text-foreground hover:border-accent"
  } disabled:opacity-50`;
}

function coordinateText(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? ""
    : String(value);
}
