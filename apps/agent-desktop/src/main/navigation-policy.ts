/*
 * Navigation, IPC-sender and payload policy for the agent's own windows.
 *
 * The agent shows three local HTML pages (login, device permissions, location
 * request) through `loadFile`. None of them has a reason to open another
 * window, navigate to another page, or attach a webview. Without an explicit
 * policy Electron allows all three, so a single injected link or `window.open`
 * in a renderer page would put a web page into a window that has the preload
 * bridge (`contextBridge`) attached, on an employee's machine.
 *
 * Everything here is a pure function with no `electron` import, so it can be
 * unit-tested with ts-jest. The Electron-dependent wiring is in `main.ts`; that
 * wiring cannot be exercised without a real window, and a real-device check is
 * required before a build that contains it is distributed (ITEM-0234). A passing
 * unit test here is evidence about the decision, not about window behaviour.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** The only pages the agent ever loads, relative to the renderer directory. */
export const RENDERER_PAGES = {
  login: "login.html",
  devicePermissions: "device-permissions.html",
  locationRequest: "location-request.html",
} as const;

export type RendererPage = keyof typeof RENDERER_PAGES;

function normalise(filePath: string): string {
  const resolved = path.resolve(filePath);
  // Windows paths are case-insensitive; compare them that way.
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * The local file a URL points at, or null when it is not a plain local file.
 * Refuses non-file schemes, a non-empty host (a UNC share on Windows), and any
 * query string; a fragment is ignored because it never leaves the page.
 */
function localFileOf(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "file:") return null;
  if (parsed.host !== "") return null;
  if (parsed.search !== "") return null;
  try {
    return normalise(fileURLToPath(parsed));
  } catch {
    return null;
  }
}

export function rendererPagePaths(
  rendererDir: string,
): Record<RendererPage, string> {
  return {
    login: normalise(path.join(rendererDir, RENDERER_PAGES.login)),
    devicePermissions: normalise(
      path.join(rendererDir, RENDERER_PAGES.devicePermissions),
    ),
    locationRequest: normalise(
      path.join(rendererDir, RENDERER_PAGES.locationRequest),
    ),
  };
}

/**
 * A renderer-initiated navigation is allowed only to one of the explicitly
 * approved page files (for a window, normally just its own page, which makes a
 * reload work). Not "any file:" — that would let a renderer navigate into any
 * local HTML file on the machine.
 */
export function isAllowedNavigation(
  rawUrl: string,
  approvedPaths: readonly string[],
): boolean {
  const target = localFileOf(rawUrl);
  if (target === null) return false;
  return approvedPaths.map(normalise).includes(target);
}

/**
 * Which page may call which IPC channel. A channel is reachable only from the
 * page that legitimately uses it, so a compromised permissions page cannot call
 * `agent:login` and a navigated-away frame calls nothing.
 */
const CHANNEL_PAGES: Record<string, readonly RendererPage[]> = {
  "agent:login": ["login"],
  "agent:resume-session": ["login"],
  "agent:update-device-permissions": ["devicePermissions"],
  "agent:get-device-permission-config": [
    "devicePermissions",
    "locationRequest",
  ],
  "agent:get-location-request": ["locationRequest"],
  "agent:capture-desktop-location": ["locationRequest"],
  "agent:probe-location-permission": ["devicePermissions", "locationRequest"],
  "agent:submit-location-result": ["locationRequest"],
};

export function knownIpcChannels(): string[] {
  return Object.keys(CHANNEL_PAGES);
}

/**
 * Whether an IPC call on `channel` from a frame at `senderUrl` is trusted.
 * `isMainFrame` must be true: a sub-frame is never trusted. An unknown channel
 * is refused, so adding a handler without a policy entry fails closed.
 */
export function isTrustedIpcSender(
  channel: string,
  senderUrl: string | undefined,
  isMainFrame: boolean,
  rendererDir: string,
): boolean {
  if (!isMainFrame || !senderUrl) return false;
  const pages = CHANNEL_PAGES[channel];
  if (!pages) return false;
  const paths = rendererPagePaths(rendererDir);
  return isAllowedNavigation(
    senderUrl,
    pages.map((page) => paths[page]),
  );
}

const PERMISSION_STATUSES = [
  "GRANTED",
  "DENIED",
  "PROMPT",
  "RESTRICTED",
  "UNAVAILABLE",
  "UNKNOWN",
] as const;

export type ValidDevicePermissions = {
  cameraPermission: (typeof PERMISSION_STATUSES)[number];
  microphonePermission: (typeof PERMISSION_STATUSES)[number];
  locationPermission: (typeof PERMISSION_STATUSES)[number];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatus(
  value: unknown,
): value is (typeof PERMISSION_STATUSES)[number] {
  return (
    typeof value === "string" &&
    (PERMISSION_STATUSES as readonly string[]).includes(value)
  );
}

/** Exactly the three known fields, each a known status; anything else is null. */
export function validateDevicePermissions(
  value: unknown,
): ValidDevicePermissions | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "cameraPermission,locationPermission,microphonePermission") {
    return null;
  }
  const { cameraPermission, microphonePermission, locationPermission } = value;
  if (
    !isStatus(cameraPermission) ||
    !isStatus(microphonePermission) ||
    !isStatus(locationPermission)
  ) {
    return null;
  }
  return { cameraPermission, microphonePermission, locationPermission };
}

export type ValidLocationResult = {
  requestId: string;
  deviceId: string;
  status: "CAPTURED" | "DENIED" | "FAILED";
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  errorMessage?: string;
  capturedAt?: string;
};

const MAX_ID = 128;
const MAX_MESSAGE = 500;

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function finiteInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * A location result from the renderer: bounded ids, a known status, coordinates
 * that are real and in range, nothing extra. Returns a rebuilt object so an
 * unexpected field never reaches the API client.
 */
export function validateLocationResult(
  value: unknown,
): ValidLocationResult | null {
  if (!isRecord(value)) return null;
  const allowed = [
    "requestId",
    "deviceId",
    "status",
    "latitude",
    "longitude",
    "accuracyMeters",
    "errorMessage",
    "capturedAt",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null;
  if (!boundedString(value.requestId, MAX_ID)) return null;
  if (!boundedString(value.deviceId, MAX_ID)) return null;
  if (
    value.status !== "CAPTURED" &&
    value.status !== "DENIED" &&
    value.status !== "FAILED"
  ) {
    return null;
  }
  const result: ValidLocationResult = {
    requestId: value.requestId,
    deviceId: value.deviceId,
    status: value.status,
  };
  if (value.latitude !== undefined) {
    if (!finiteInRange(value.latitude, -90, 90)) return null;
    result.latitude = value.latitude;
  }
  if (value.longitude !== undefined) {
    if (!finiteInRange(value.longitude, -180, 180)) return null;
    result.longitude = value.longitude;
  }
  if (value.accuracyMeters !== undefined) {
    if (!finiteInRange(value.accuracyMeters, 0, 1_000_000)) return null;
    result.accuracyMeters = value.accuracyMeters;
  }
  if (value.errorMessage !== undefined) {
    if (
      typeof value.errorMessage !== "string" ||
      value.errorMessage.length > MAX_MESSAGE
    ) {
      return null;
    }
    result.errorMessage = value.errorMessage;
  }
  if (value.capturedAt !== undefined) {
    if (
      !boundedString(value.capturedAt, 64) ||
      Number.isNaN(Date.parse(value.capturedAt))
    ) {
      return null;
    }
    result.capturedAt = value.capturedAt;
  }
  if (
    result.status === "CAPTURED" &&
    (result.latitude === undefined || result.longitude === undefined)
  ) {
    return null;
  }
  return result;
}
