"use client";

import type { LocationCaptureResult } from "./location-capture";

export async function captureIpFallbackLocation(): Promise<LocationCaptureResult> {
  return {
    ok: false,
    reason: "POSITION_UNAVAILABLE",
    message:
      "Approximate IP location is not configured for this tenant environment.",
    permissionState: await readPermissionState(),
  };
}

async function readPermissionState() {
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
