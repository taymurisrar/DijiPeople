"use client";

import { captureIpFallbackLocation as captureIpFallbackLocationProvider } from "./ip-location-provider";

export type LocationCapturePermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

export type LocationCaptureResult =
  | {
      ok: true;
      source: "GPS" | "WIFI" | "IP";
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      confidence: "HIGH" | "MEDIUM" | "LOW";
      capturedAt: string;
      permissionState?: LocationCapturePermissionState | string;
      failureReason?: string;
      addressText?: string;
    }
  | {
      ok: false;
      reason:
        | "PERMISSION_DENIED"
        | "POSITION_UNAVAILABLE"
        | "TIMEOUT"
        | "UNSUPPORTED"
        | "IP_FALLBACK_DISABLED"
        | "UNKNOWN";
      message: string;
      permissionState?: LocationCapturePermissionState | string;
    };

export type LocationCaptureOptions = {
  readonly timeoutSeconds?: number;
  readonly highAccuracy?: boolean;
  readonly allowIpFallback?: boolean;
  readonly retryAttempts?: number;
};

export async function getLocationPermissionState(): Promise<LocationCapturePermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions) {
    return "unsupported";
  }

  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    return status.state;
  } catch {
    return "unsupported";
  }
}

export async function captureDeviceLocation(
  options: LocationCaptureOptions = {},
): Promise<LocationCaptureResult> {
  const permissionState = await getLocationPermissionState();

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      ok: false,
      reason: "UNSUPPORTED",
      message: "This device or browser does not support location capture.",
      permissionState,
    };
  }

  const timeout = Math.max(1, options.timeoutSeconds ?? 15) * 1000;

  return new Promise<LocationCaptureResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy =
          typeof position.coords.accuracy === "number"
            ? Math.round(position.coords.accuracy)
            : undefined;
        resolve({
          ok: true,
          source: accuracy !== undefined && accuracy <= 100 ? "GPS" : "WIFI",
          latitude: roundCoordinate(position.coords.latitude),
          longitude: roundCoordinate(position.coords.longitude),
          accuracyMeters: accuracy,
          confidence:
            accuracy === undefined
              ? "MEDIUM"
              : accuracy <= 100
                ? "HIGH"
                : "MEDIUM",
          capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
          permissionState,
        });
      },
      (error) => {
        resolve(mapGeolocationError(error, permissionState));
      },
      {
        enableHighAccuracy: options.highAccuracy ?? true,
        maximumAge: 0,
        timeout,
      },
    );
  });
}

export async function captureAttendanceLocation(
  options: LocationCaptureOptions = {},
): Promise<LocationCaptureResult> {
  const retryAttempts = Math.max(0, Math.min(3, options.retryAttempts ?? 2));
  let result: LocationCaptureResult | null = null;

  for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
    result = await captureDeviceLocation(options);
    if (result.ok) break;
    if (
      result.reason === "PERMISSION_DENIED" ||
      result.reason === "UNSUPPORTED"
    ) {
      return result;
    }
  }

  if (!result || !result.ok) {
    return (
      result ?? {
        ok: false,
        reason: "UNKNOWN",
        message: "Unable to capture device location.",
      }
    );
  }

  const addressText = await reverseGeocodeCoordinates(
    result.latitude,
    result.longitude,
  );

  return addressText ? { ...result, addressText } : result;
}

export function googleMapsLocationUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${encodeURIComponent(
    `${roundCoordinate(latitude)},${roundCoordinate(longitude)}`,
  )}`;
}

export async function captureIpFallbackLocation(
  enabled: boolean,
): Promise<LocationCaptureResult> {
  if (!enabled) {
    return {
      ok: false,
      reason: "IP_FALLBACK_DISABLED",
      message: "Approximate location is not allowed by tenant policy.",
      permissionState: await getLocationPermissionState(),
    };
  }

  return captureIpFallbackLocationProvider();
}

export function buildLocationPayload(
  result: LocationCaptureResult,
  options: {
    readonly userAgent?: string;
    readonly failureReason?: string;
    readonly manualLocationExceptionRequested?: boolean;
  } = {},
) {
  const base = {
    userAgent: options.userAgent,
    manualLocationExceptionRequested:
      options.manualLocationExceptionRequested || undefined,
  };

  if (!result.ok) {
    return {
      ...base,
      locationPermissionState: result.permissionState,
      locationFailureReason: options.failureReason ?? result.reason,
    };
  }

  return {
    ...base,
    locationLatitude: result.latitude,
    locationLongitude: result.longitude,
    locationAccuracyMeters: result.accuracyMeters,
    locationSource: result.source,
    locationConfidence: result.confidence,
    locationCapturedAt: result.capturedAt,
    locationPermissionState: result.permissionState,
    locationFailureReason: result.failureReason ?? options.failureReason,
    remoteLatitude: result.latitude,
    remoteLongitude: result.longitude,
    locationAccuracy: result.accuracyMeters,
    remoteAddressText: result.addressText,
  };
}

function mapGeolocationError(
  error: GeolocationPositionError,
  permissionState: LocationCapturePermissionState,
): LocationCaptureResult {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      ok: false,
      reason: "PERMISSION_DENIED",
      message:
        "Location permission is required for attendance. Please enable location access for this site from browser settings.",
      permissionState,
    };
  }

  if (error.code === error.TIMEOUT) {
    return {
      ok: false,
      reason: "TIMEOUT",
      message:
        "Location capture timed out. Please make sure device location is enabled, move near a window, and try again.",
      permissionState,
    };
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return {
      ok: false,
      reason: "POSITION_UNAVAILABLE",
      message:
        "Device location is unavailable. Please turn on location services and try again.",
      permissionState,
    };
  }

  return {
    ok: false,
    reason: "UNKNOWN",
    message: "Unable to capture device location.",
    permissionState,
  };
}

async function reverseGeocodeCoordinates(latitude: number, longitude: number) {
  try {
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
    });
    const response = await fetch(`/api/attendance/reverse-geocode?${query}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { addressText?: unknown };
    return typeof data.addressText === "string" && data.addressText.trim()
      ? data.addressText.trim()
      : null;
  } catch {
    return null;
  }
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
