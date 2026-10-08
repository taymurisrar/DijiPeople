import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isReportedRequest,
  REPORTED_REQUEST_HEADER,
  reportedRequestInit,
  shouldRaiseErrorDialog,
} from "./background-request";
import { createHttpModuleRuntimeAdapter } from "./runtime/http-module-runtime-adapter";
import { codeOnly } from "./source-scan";

describe("the runtime adapter actually sends the reported mark", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("keeps the mark and JSON content type on a record action request", async () => {
    let sent: Headers | null = null;
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      sent = new Headers(init?.headers);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;
    await createHttpModuleRuntimeAdapter("partners").executeRecordAction(
      "p-1",
      "send-onboarding-link",
    );
    // The bug this pins: the adapter spread a `Headers` instance into an
    // object literal, which yields `{}` and silently dropped the mark.
    expect(sent!.get(REPORTED_REQUEST_HEADER)).toBe("1");
    expect(sent!.get("content-type")).toBe("application/json");
  });
});

/*
 * TASK-0037 browser pass. A partner record action refused by a business rule
 * (PARTNER_INVITATION_COOLDOWN, 429) opened the blocking error dialog with
 * "Technical details" and "Download log" on top of the action bar's own red
 * notice. Requests whose control reports the outcome are marked "reported":
 * a domain refusal (4xx) stays inline, an unexpected 5xx still raises the dialog.
 */
describe("reported requests keep domain refusals inline", () => {
  it("marks a request as reported and keeps its other headers", () => {
    const init = reportedRequestInit({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const headers = new Headers(init.headers);
    expect(headers.get(REPORTED_REQUEST_HEADER)).toBe("1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(isReportedRequest("/api/x", init)).toBe(true);
    expect(isReportedRequest("/api/x", { method: "POST" })).toBe(false);
  });

  it("does not raise the dialog for a reported 4xx", () => {
    for (const status of [400, 403, 404, 409, 429]) {
      expect([
        status,
        shouldRaiseErrorDialog({
          url: "/api/platform-runtime/partners/p-1/actions/send-onboarding-link",
          ok: false,
          background: false,
          reported: true,
          status,
        }),
      ]).toEqual([status, false]);
    }
  });

  it("still raises it for a reported 5xx", () => {
    for (const status of [500, 502, 503]) {
      expect(
        shouldRaiseErrorDialog({
          url: "/api/platform-runtime/partners/p-1/actions/send-onboarding-link",
          ok: false,
          background: false,
          reported: true,
          status,
        }),
      ).toBe(true);
    }
  });

  it("only suppresses confirmed client errors", () => {
    for (const status of [undefined, 0, 302])
      expect(
        shouldRaiseErrorDialog({
          url: "/api/platform-runtime/partners",
          ok: false,
          background: false,
          reported: true,
          status,
        }),
      ).toBe(true);
  });

  it("recognizes a reported Request and preserves unreported failures", () => {
    const request = new Request(
      "https://example.test/api/partners",
      reportedRequestInit(),
    );
    expect(isReportedRequest(request)).toBe(true);
    expect(
      shouldRaiseErrorDialog({
        url: request.url,
        ok: false,
        background: false,
        status: 409,
      }),
    ).toBe(true);
    expect(
      shouldRaiseErrorDialog({
        url: request.url,
        ok: false,
        background: true,
        reported: true,
        status: 500,
      }),
    ).toBe(false);
  });

  it("record actions, quick create and row commands send reported requests", () => {
    const root = join(__dirname, "..");
    for (const file of [
      "lib/runtime/http-module-runtime-adapter.ts",
      "app/_components/runtime/runtime-quick-create-panel.tsx",
      "app/_components/runtime/runtime-related-records-panel.tsx",
    ])
      expect([
        file,
        codeOnly(readFileSync(join(root, file), "utf8")).includes(
          "reportedRequestInit(",
        ),
      ]).toEqual([file, true]);
    expect(
      codeOnly(
        readFileSync(
          join(root, "components/errors/error-provider.tsx"),
          "utf8",
        ),
      ),
    ).toContain("reported: isReportedRequest(");
  });
});
