import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BACKGROUND_REQUEST_HEADER,
  backgroundRequestInit,
  isBackgroundRequest,
  isSessionHeartbeat,
  SESSION_HEARTBEAT_PATH,
  shouldRaiseErrorDialog,
} from "./background-request";
import { codeOnly } from "./source-scan";

/*
 * BUG-3545. The admin session heartbeat (`POST /auth/activity`) was refused for
 * most platform roles, and the global fetch interceptor turned every refusal
 * into the blocking error dialog — for a request the operator never made.
 */
describe("BUG-3545 background requests never raise the error dialog", () => {
  it("marks a request as background and keeps its other headers", () => {
    const init = backgroundRequestInit({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const headers = new Headers(init.headers);
    expect(init.method).toBe("POST");
    expect(headers.get(BACKGROUND_REQUEST_HEADER)).toBe("1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(isBackgroundRequest("/api/auth/activity", init)).toBe(true);
  });

  it("does not treat an ordinary request as background", () => {
    expect(isBackgroundRequest("/api/tenants", { method: "PATCH" })).toBe(
      false,
    );
    expect(isBackgroundRequest("/api/tenants")).toBe(false);
  });

  it("reads the mark from a Request object too", () => {
    const request = new Request("http://console.invalid/api/auth/activity", {
      method: "POST",
      headers: { [BACKGROUND_REQUEST_HEADER]: "1" },
    });
    expect(isBackgroundRequest(request)).toBe(true);
  });

  it("skips the dialog for a failed background request, whatever the status", () => {
    for (const status of [401, 403, 500]) {
      expect([
        status,
        shouldRaiseErrorDialog({
          url: SESSION_HEARTBEAT_PATH,
          ok: false,
          background: true,
        }),
      ]).toEqual([status, false]);
    }
  });

  it("still raises it for a failed action the operator started", () => {
    expect(
      shouldRaiseErrorDialog({
        url: "/api/platform-runtime/tenants/t-1",
        ok: false,
        background: false,
      }),
    ).toBe(true);
  });

  it("keeps the existing exclusions: success, non-API URLs and the client error log", () => {
    expect(
      shouldRaiseErrorDialog({
        url: "/api/tenants",
        ok: true,
        background: false,
      }),
    ).toBe(false);
    expect(
      shouldRaiseErrorDialog({
        url: "/_next/data",
        ok: false,
        background: false,
      }),
    ).toBe(false);
    expect(
      shouldRaiseErrorDialog({
        url: "/api/error-logs/client",
        ok: false,
        background: false,
      }),
    ).toBe(false);
  });

  it("recognises the heartbeat path, relative or absolute", () => {
    expect(isSessionHeartbeat("/api/auth/activity")).toBe(true);
    expect(isSessionHeartbeat("https://admin.example/api/auth/activity")).toBe(
      true,
    );
    expect(isSessionHeartbeat("/api/auth/refresh")).toBe(false);
  });

  /*
   * The two call sites. Without these a later edit could drop the mark from
   * the heartbeat, or bypass the rule in the interceptor, and every test above
   * would still pass.
   */
  const read = (relative: string) =>
    codeOnly(readFileSync(join(__dirname, "..", relative), "utf8"));

  it("the heartbeat is sent marked as background", () => {
    const shell = read("app/_components/admin-shell.tsx");
    // Whitespace-tolerant: prettier decides where this call wraps.
    expect(shell).toMatch(
      /fetch\(\s*SESSION_HEARTBEAT_PATH,\s*backgroundRequestInit\(\{ method: "POST" \}\),?\s*\)/,
    );
    // Its 401 must still reach the refresh-or-expire handling.
    expect(shell).toContain("isSessionHeartbeat(url)");
  });

  it("the global interceptor decides with shouldRaiseErrorDialog", () => {
    const provider = read("components/errors/error-provider.tsx");
    expect(provider).toContain("shouldRaiseErrorDialog({");
    expect(provider).toContain("isBackgroundRequest(args[0], args[1])");
  });
});
