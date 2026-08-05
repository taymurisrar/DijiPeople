import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DesktopLocationResult =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      capturedAt: string;
      source: "windows-location" | "ip-location";
    }
  | {
      ok: false;
      message: string;
    };

export async function captureDesktopLocation(): Promise<DesktopLocationResult> {
  const windowsLocation =
    process.platform === "win32" ? await captureWindowsLocation() : null;

  if (windowsLocation?.ok) {
    return windowsLocation;
  }

  const ipLocation = await captureIpLocation();

  if (ipLocation.ok) {
    return ipLocation;
  }

  return {
    ok: false,
    message:
      windowsLocation && !windowsLocation.ok
        ? `${windowsLocation.message} ${ipLocation.message}`
        : ipLocation.message,
  };
}

async function captureWindowsLocation(): Promise<DesktopLocationResult> {
  const script = [
    "Add-Type -AssemblyName System.Device;",
    "$watcher = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::High);",
    "$started = $watcher.TryStart($false, [TimeSpan]::FromSeconds(15));",
    "$coord = $watcher.Position.Location;",
    "if (-not $started -or $coord.IsUnknown) { throw 'Windows Location Services did not return a position.' }",
    "$accuracy = if ($coord.HorizontalAccuracy -ge 0) { $coord.HorizontalAccuracy } else { '' };",
    "Write-Output (('{0}|{1}|{2}' -f $coord.Latitude, $coord.Longitude, $accuracy));",
  ].join(" ");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      { timeout: 20_000, windowsHide: true },
    );

    const [latitudeRaw, longitudeRaw, accuracyRaw] = stdout.trim().split("|");
    const latitude = Number(latitudeRaw);
    const longitude = Number(longitudeRaw);
    const accuracyMeters = Number(accuracyRaw);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return {
        ok: false,
        message: "Windows Location Services returned an invalid position.",
      };
    }

    return {
      ok: true,
      latitude,
      longitude,
      ...(Number.isFinite(accuracyMeters) ? { accuracyMeters } : {}),
      capturedAt: new Date().toISOString(),
      source: "windows-location",
    };
  } catch (error) {
    return {
      ok: false,
      message: normalizeWindowsLocationError(error),
    };
  }
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
    message: `IP location lookup failed. ${errors.join(" ")}`,
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
        message: `${url} did not return coordinates.`,
      };
    }

    return {
      ok: true,
      latitude,
      longitude,
      accuracyMeters: 50_000,
      capturedAt: new Date().toISOString(),
      source: "ip-location",
    };
  } catch (error) {
    return {
      ok: false,
      message: `${url} failed: ${readNetworkErrorReason(error)}.`,
    };
  }
}

function normalizeWindowsLocationError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Windows Location Services failed.";

  if (/GeoCoordinateWatcher|System\.Device|TryStart|powershell/i.test(message)) {
    return "Windows Location Services could not provide a position. Check that Windows Location is enabled for desktop apps.";
  }

  if (/timed out|timeout/i.test(message)) {
    return "Windows Location Services timed out.";
  }

  return "Windows Location Services failed.";
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
