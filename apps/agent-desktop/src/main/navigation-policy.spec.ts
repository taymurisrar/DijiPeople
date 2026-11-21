import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  isAllowedNavigation,
  isTrustedIpcSender,
  knownIpcChannels,
  rendererPagePaths,
  validateDevicePermissions,
  validateLocationResult,
} from "./navigation-policy";

// Built from the platform's own path rules so the tests are not tied to Windows
// or POSIX separators.
const dir = path.resolve("/agent/app/renderer");
const page = (name: string) => pathToFileURL(path.join(dir, name)).href;
const paths = rendererPagePaths(dir);

describe("isAllowedNavigation", () => {
  it("allows exactly the approved page, with or without a fragment", () => {
    expect(isAllowedNavigation(page("login.html"), [paths.login])).toBe(true);
    expect(
      isAllowedNavigation(`${page("login.html")}#section`, [paths.login]),
    ).toBe(true);
  });

  it("refuses another approved page when only this window's own page is approved", () => {
    expect(
      isAllowedNavigation(page("device-permissions.html"), [paths.login]),
    ).toBe(false);
  });

  it("refuses a local file that is not an approved page", () => {
    expect(isAllowedNavigation(page("secret.html"), [paths.login])).toBe(false);
    expect(
      isAllowedNavigation(pathToFileURL(path.resolve("/etc/hosts")).href, [
        paths.login,
      ]),
    ).toBe(false);
  });

  it("refuses a path that traverses out of the renderer directory", () => {
    const traversal = `${pathToFileURL(dir).href}/../../../etc/passwd`;
    expect(isAllowedNavigation(traversal, [paths.login])).toBe(false);
    expect(
      isAllowedNavigation(`${pathToFileURL(dir).href}/%2e%2e/login.html`, [
        paths.login,
      ]),
    ).toBe(false);
  });

  it("refuses a query string, which a premature form submit would add", () => {
    expect(
      isAllowedNavigation(`${page("login.html")}?email=a&password=b`, [
        paths.login,
      ]),
    ).toBe(false);
  });

  it("refuses a file URL that names a host (UNC share)", () => {
    expect(
      isAllowedNavigation("file://attacker.example/share/login.html", [
        paths.login,
      ]),
    ).toBe(false);
  });

  it.each([
    "https://example.com/",
    "http://localhost:3001/",
    "data:text/html,<script>alert(1)</script>",
    "javascript:alert(1)",
    "blob:https://example.com/abc",
    "ftp://example.com/x",
    "custom-scheme://anything",
    "about:blank",
    "",
    "not a url",
    "//example.com/x",
  ])("refuses %p", (url) => {
    expect(isAllowedNavigation(url, [paths.login])).toBe(false);
  });

  it("refuses everything when nothing is approved", () => {
    expect(isAllowedNavigation(page("login.html"), [])).toBe(false);
  });
});

describe("isTrustedIpcSender", () => {
  it("accepts a channel from the page that uses it, in the main frame", () => {
    expect(
      isTrustedIpcSender("agent:login", page("login.html"), true, dir),
    ).toBe(true);
    expect(
      isTrustedIpcSender(
        "agent:submit-location-result",
        page("location-request.html"),
        true,
        dir,
      ),
    ).toBe(true);
  });

  it("refuses a channel from a page that does not use it", () => {
    expect(
      isTrustedIpcSender(
        "agent:login",
        page("device-permissions.html"),
        true,
        dir,
      ),
    ).toBe(false);
    expect(
      isTrustedIpcSender(
        "agent:submit-location-result",
        page("login.html"),
        true,
        dir,
      ),
    ).toBe(false);
  });

  it("refuses sub-frames, remote pages, missing URLs and unknown channels", () => {
    expect(
      isTrustedIpcSender("agent:login", page("login.html"), false, dir),
    ).toBe(false);
    expect(
      isTrustedIpcSender("agent:login", "https://evil.example/", true, dir),
    ).toBe(false);
    expect(isTrustedIpcSender("agent:login", undefined, true, dir)).toBe(false);
    expect(
      isTrustedIpcSender("agent:new-unlisted", page("login.html"), true, dir),
    ).toBe(false);
  });

  it("covers every channel the preload bridge invokes", () => {
    expect(knownIpcChannels().sort()).toEqual(
      [
        "agent:capture-desktop-location",
        "agent:get-device-permission-config",
        "agent:get-location-request",
        "agent:login",
        "agent:probe-location-permission",
        "agent:resume-session",
        "agent:submit-location-result",
        "agent:update-device-permissions",
      ].sort(),
    );
  });
});

describe("validateDevicePermissions", () => {
  const ok = {
    cameraPermission: "GRANTED",
    microphonePermission: "DENIED",
    locationPermission: "PROMPT",
  };
  it("accepts exactly the three known statuses", () => {
    expect(validateDevicePermissions(ok)).toEqual(ok);
  });
  it.each([
    null,
    undefined,
    "x",
    [],
    { ...ok, extra: 1 },
    { cameraPermission: "GRANTED", microphonePermission: "DENIED" },
    { ...ok, cameraPermission: "ADMIN" },
    { ...ok, locationPermission: 1 },
  ])("refuses %p", (value) => {
    expect(validateDevicePermissions(value)).toBeNull();
  });
});

describe("validateLocationResult", () => {
  const ok = {
    requestId: "req-1",
    deviceId: "dev-1",
    status: "CAPTURED",
    latitude: 25.2,
    longitude: 55.3,
    accuracyMeters: 12,
    capturedAt: "2026-11-22T10:00:00.000Z",
  };
  it("accepts a well-formed captured result and rebuilds it", () => {
    expect(validateLocationResult(ok)).toEqual(ok);
  });
  it("accepts a denied result without coordinates", () => {
    expect(
      validateLocationResult({
        requestId: "r",
        deviceId: "d",
        status: "DENIED",
        errorMessage: "User denied",
      }),
    ).not.toBeNull();
  });
  it.each([
    ["not an object", "x"],
    ["array", []],
    ["unknown field", { ...ok, isAdmin: true }],
    ["missing request id", { ...ok, requestId: "" }],
    ["oversized id", { ...ok, deviceId: "x".repeat(129) }],
    ["unknown status", { ...ok, status: "OK" }],
    ["latitude out of range", { ...ok, latitude: 91 }],
    ["longitude out of range", { ...ok, longitude: -181 }],
    ["NaN coordinate", { ...ok, latitude: Number.NaN }],
    ["negative accuracy", { ...ok, accuracyMeters: -1 }],
    ["string coordinate", { ...ok, longitude: "55.3" }],
    ["oversized message", { ...ok, errorMessage: "x".repeat(501) }],
    ["bad timestamp", { ...ok, capturedAt: "yesterday" }],
    [
      "captured without coordinates",
      {
        requestId: "r",
        deviceId: "d",
        status: "CAPTURED",
      },
    ],
  ])("refuses %s", (_name, value) => {
    expect(validateLocationResult(value)).toBeNull();
  });
});
