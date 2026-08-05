import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Chromium's navigator.geolocation is deliberately not used here. In Electron it
// resolves positions through Google's network location service, which requires a
// GOOGLE_API_KEY baked into the runtime; without one every fix fails with
// "Failed to query location from network service". Windows Location Services is
// the primary source instead, with IP lookup as an approximate last resort.
const WINDOWS_LOCATION_TIMEOUT_SECONDS = 20;
const POWERSHELL_TIMEOUT_MS = (WINDOWS_LOCATION_TIMEOUT_SECONDS + 10) * 1_000;
const IP_LOCATION_ACCURACY_METERS = 50_000;

export type DesktopLocationSource = "windows-location" | "ip-location";

export type DesktopLocationPermission =
  | "GRANTED"
  | "DENIED"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type DesktopLocationFailureReason = "denied" | "unavailable" | "error";

export type DesktopLocationResult =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      capturedAt: string;
      source: DesktopLocationSource;
    }
  | {
      ok: false;
      reason: DesktopLocationFailureReason;
      message: string;
    };

export async function captureDesktopLocation(): Promise<DesktopLocationResult> {
  if (process.platform !== "win32") {
    return captureIpLocation();
  }

  const windowsLocation = await captureWindowsLocation();

  if (windowsLocation.ok) {
    return windowsLocation;
  }

  const ipLocation = await captureIpLocation();

  if (ipLocation.ok) {
    return ipLocation;
  }

  // Windows is the source that can actually produce a usable fix, so its reason
  // is what the employee needs to act on.
  return {
    ok: false,
    reason: windowsLocation.reason,
    message: `${windowsLocation.message} ${ipLocation.message}`,
  };
}

export async function probeDesktopLocationPermission(): Promise<DesktopLocationPermission> {
  if (process.platform !== "win32") {
    return "UNAVAILABLE";
  }

  const consent = await readWindowsLocationConsent();

  if (consent === "DENIED") {
    return "DENIED";
  }

  const capture = await captureWindowsLocation();

  if (capture.ok) {
    return "GRANTED";
  }

  if (capture.reason === "denied") {
    return "DENIED";
  }

  // Consent is on the device even though no fix was available right now (no
  // Wi-Fi scan, radio off, service still warming up). Permission and fix
  // availability are different things, so report the permission we actually have.
  return consent === "GRANTED" ? "GRANTED" : consent;
}

async function readWindowsLocationConsent(): Promise<DesktopLocationPermission> {
  const script = [
    "$paths = @(",
    "'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location',",
    "'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location'",
    ")",
    "$seen = $false",
    "foreach ($path in $paths) {",
    "  $entry = Get-ItemProperty -Path $path -Name 'Value' -ErrorAction SilentlyContinue",
    "  if ($null -eq $entry) { continue }",
    "  $seen = $true",
    "  if ($entry.Value -ne 'Allow') { Write-Output 'DENIED'; exit 0 }",
    "}",
    "if ($seen) { Write-Output 'GRANTED' } else { Write-Output 'UNKNOWN' }",
  ].join("\n");

  try {
    const { stdout } = await runPowerShell(script, 15_000);
    const value = stdout.trim().toUpperCase();

    if (value === "DENIED" || value === "GRANTED") {
      return value;
    }

    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

async function captureWindowsLocation(): Promise<DesktopLocationResult> {
  // Latitude/longitude are formatted with the invariant culture so a comma
  // decimal separator on non-English Windows cannot corrupt the coordinates.
  const script = [
    "Add-Type -AssemblyName System.Device",
    "$invariant = [System.Globalization.CultureInfo]::InvariantCulture",
    "$watcher = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::High)",
    "$watcher.MovementThreshold = 0",
    `[void]$watcher.TryStart($false, [TimeSpan]::FromSeconds(${WINDOWS_LOCATION_TIMEOUT_SECONDS}))`,
    `$deadline = (Get-Date).AddSeconds(${WINDOWS_LOCATION_TIMEOUT_SECONDS})`,
    "while ($watcher.Position.Location.IsUnknown -and (Get-Date) -lt $deadline -and $watcher.Permission -ne [System.Device.Location.GeoPositionPermission]::Denied) {",
    "  Start-Sleep -Milliseconds 500",
    "}",
    "if ($watcher.Permission -eq [System.Device.Location.GeoPositionPermission]::Denied) { Write-Output 'DENIED'; exit 0 }",
    "$coord = $watcher.Position.Location",
    "if ($coord.IsUnknown) { Write-Output 'UNAVAILABLE'; exit 0 }",
    "$accuracy = ''",
    "if ($coord.HorizontalAccuracy -ge 0) { $accuracy = $coord.HorizontalAccuracy.ToString($invariant) }",
    "Write-Output ('OK|' + $coord.Latitude.ToString($invariant) + '|' + $coord.Longitude.ToString($invariant) + '|' + $accuracy)",
  ].join("\n");

  try {
    const { stdout } = await runPowerShell(script, POWERSHELL_TIMEOUT_MS);
    const output = stdout.trim();

    if (output === "DENIED") {
      return {
        ok: false,
        reason: "denied",
        message:
          "Windows location access is turned off for desktop apps. Enable Settings > Privacy & security > Location, including \"Let desktop apps access your location\".",
      };
    }

    if (output === "UNAVAILABLE" || !output.startsWith("OK|")) {
      return {
        ok: false,
        reason: "unavailable",
        message:
          "Windows Location Services did not return a position. Make sure location is enabled and the device has a Wi-Fi or network connection it can position from.",
      };
    }

    const [, latitudeRaw, longitudeRaw, accuracyRaw] = output.split("|");
    const latitude = Number(latitudeRaw);
    const longitude = Number(longitudeRaw);
    const accuracyMeters = Number(accuracyRaw);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return {
        ok: false,
        reason: "error",
        message: "Windows Location Services returned an invalid position.",
      };
    }

    return {
      ok: true,
      latitude,
      longitude,
      ...(Number.isFinite(accuracyMeters) && accuracyMeters > 0
        ? { accuracyMeters }
        : {}),
      capturedAt: new Date().toISOString(),
      source: "windows-location",
    };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: normalizeWindowsLocationError(error),
    };
  }
}

function runPowerShell(script: string, timeoutMs: number) {
  // -EncodedCommand avoids every quoting and escaping pitfall of passing a
  // multi-line script through -Command.
  const encoded = Buffer.from(script, "utf16le").toString("base64");

  return execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encoded,
    ],
    { timeout: timeoutMs, windowsHide: true },
  );
}

async function captureIpLocation(): Promise<DesktopLocationResult> {
  const providers = [
    {
      url: "https://ipapi.co/json/",
      read: (data: Record<string, unknown>) => ({
        latitude: data.latitude,
        longitude: data.longitude,
      }),
    },
    {
      url: "https://ipwho.is/",
      read: (data: Record<string, unknown>) => ({
        latitude: data.latitude,
        longitude: data.longitude,
      }),
    },
  ];
  const errors: string[] = [];

  for (const provider of providers) {
    const result = await captureIpLocationFromProvider(provider.url, provider.read);

    if (result.ok) {
      return result;
    }

    errors.push(result.message);
  }

  return {
    ok: false,
    reason: "unavailable",
    message: `IP location lookup also failed. ${errors.join(" ")}`,
  };
}

async function captureIpLocationFromProvider(
  url: string,
  readCoordinates: (data: Record<string, unknown>) => {
    latitude: unknown;
    longitude: unknown;
  },
): Promise<DesktopLocationResult> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: "unavailable",
        message: `${url} returned ${response.status}.`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const coordinates = readCoordinates(data);
    const latitude = Number(coordinates.latitude);
    const longitude = Number(coordinates.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return {
        ok: false,
        reason: "unavailable",
        message: `${url} did not return coordinates.`,
      };
    }

    return {
      ok: true,
      latitude,
      longitude,
      accuracyMeters: IP_LOCATION_ACCURACY_METERS,
      capturedAt: new Date().toISOString(),
      source: "ip-location",
    };
  } catch (error) {
    return {
      ok: false,
      reason: "unavailable",
      message: `${url} failed: ${readNetworkErrorReason(error)}.`,
    };
  }
}

function normalizeWindowsLocationError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Windows Location Services failed.";

  if (/timed out|timeout|ETIMEDOUT/i.test(message)) {
    return "Windows Location Services timed out before returning a position.";
  }

  if (/ENOENT|not recognized/i.test(message)) {
    return "Windows PowerShell is unavailable, so Windows Location Services could not be queried.";
  }

  return "Windows Location Services could not provide a position. Check that location is enabled for desktop apps.";
}

function readNetworkErrorReason(error: unknown) {
  if (!(error instanceof Error)) {
    return "network request failed";
  }

  if (/timed out|timeout|aborted/i.test(error.message)) {
    return "request timed out";
  }

  if (/fetch failed|network/i.test(error.message)) {
    return "network service unavailable";
  }

  return "network request failed";
}
