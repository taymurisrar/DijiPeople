/**
 * BUG-3356 / BUG-3358 — `apiRequest` must never send a request it already
 * knows the API cannot authenticate, and must never spend a refresh token in
 * a context that cannot persist the result.
 *
 * `lib/server-api.ts` had no test coverage at all before this (see
 * `apps/web/AGENTS.md`'s note that this file is one of the surfaces the jest
 * config cannot ordinarily reach). It is pure-enough logic once `next/headers`
 * is mocked: nothing here renders anything.
 */
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth-config";

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

// React's `cache` memoises per server request. Jest has no request, so a plain
// once-only memo stands in; real per-request scoping is verified on the live stack.
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: <T>(fn: () => T) => {
    let value: T | undefined;
    return () => (value ??= fn());
  },
}));

jest.mock("@/lib/auth", () => ({
  getApiBaseUrl: () => "https://api.test",
}));

import { cookies } from "next/headers";
import { apiRequest } from "./server-api";

type CookieRecord = Record<string, string>;

function cookieStore(
  values: CookieRecord,
  options: { setThrows?: boolean } = {},
) {
  const store = new Map(Object.entries(values));
  return {
    get: (name: string) => {
      const value = store.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      if (options.setThrows) {
        throw new Error(
          "Cookies can only be modified in a Server Action or Route Handler.",
        );
      }
      store.set(name, value);
    },
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiRequest — never sends an unauthenticatable request (BUG-3356)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("does not reach the target endpoint when refresh comes back revoked, and preserves the reason", async () => {
    (cookies as jest.Mock).mockResolvedValue(
      cookieStore({ [REFRESH_TOKEN_COOKIE]: "a-dead-refresh-token" }),
    );

    const fetchedUrls: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      fetchedUrls.push(url);

      if (url.includes("/auth/refresh")) {
        return jsonResponse(
          {
            success: false,
            traceId: "web_abc123",
            statusCode: 401,
            errorCode: "SESSION_REVOKED",
            message: "This session is no longer active. Please sign in again.",
            description: "Session ended.",
          },
          401,
        );
      }

      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    const response = await apiRequest("/billing/plans");
    const body = await response.json();

    // The doomed call to /billing/plans must never have gone out.
    expect(fetchedUrls).toEqual(["https://api.test/auth/refresh"]);

    expect(response.status).toBe(401);
    expect(body.errorCode).toBe("SESSION_REVOKED");
    expect(body.message).toBe(
      "This session is no longer active. Please sign in again.",
    );
    // The reference id survives — the acceptance criterion that it still
    // matches whatever server-side record the refresh call itself produced.
    expect(body.traceId).toBe("web_abc123");
  });

  it("returns a session-ended response, not AUTH_TOKEN_MISSING, when there is no refresh token at all", async () => {
    (cookies as jest.Mock).mockResolvedValue(cookieStore({}));
    global.fetch = jest.fn(async () => {
      throw new Error(
        "apiRequest must not call fetch with no credentials at all",
      );
    }) as unknown as typeof fetch;

    const response = await apiRequest("/billing/plans");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.errorCode).not.toBe("AUTH_TOKEN_MISSING");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("still sends genuinely anonymous requests (includeAuth: false) unauthenticated", async () => {
    (cookies as jest.Mock).mockResolvedValue(cookieStore({}));
    global.fetch = jest.fn(async () =>
      jsonResponse({ ok: true }, 200),
    ) as unknown as typeof fetch;

    const response = await apiRequest("/public/tenants/resolve", {
      includeAuth: false,
    });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("proceeds normally when a valid access token is already present", async () => {
    (cookies as jest.Mock).mockResolvedValue(
      cookieStore({ [ACCESS_TOKEN_COOKIE]: "a-valid-access-token" }),
    );
    global.fetch = jest.fn(async (_input, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer a-valid-access-token");
      return jsonResponse({ ok: true }, 200);
    }) as unknown as typeof fetch;

    const response = await apiRequest("/billing/plans");

    expect(response.status).toBe(200);
  });
});

describe("apiRequest — an unwritable cookie store skips refresh entirely (BUG-3358)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("never calls /auth/refresh from a context that cannot persist the result", async () => {
    (cookies as jest.Mock).mockResolvedValue(
      cookieStore(
        { [REFRESH_TOKEN_COOKIE]: "a-perfectly-good-refresh-token" },
        { setThrows: true }, // simulates a Server Component render
      ),
    );

    const fetchedUrls: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      fetchedUrls.push(typeof input === "string" ? input : input.toString());
      throw new Error("apiRequest must not have called fetch at all");
    }) as unknown as typeof fetch;

    const response = await apiRequest("/billing/plans");

    // Not `/auth/refresh`, not `/billing/plans` — nothing. The refresh token
    // the browser holds is never consumed, so it is still good for whichever
    // component (the middleware, a route handler) refreshes next.
    expect(fetchedUrls).toEqual([]);
    expect(response.status).toBe(401);
  });
});

/**
 * DP-QA-025. Identical GETs inside one request share one API call; a write
 * clears the sharing so nothing stale is served; failures are not retained.
 */
describe("apiRequestJson request-scoped sharing", () => {
  const { apiRequestJson } =
    jest.requireActual<typeof import("./server-api")>("./server-api");

  function arrange() {
    (cookies as jest.Mock).mockResolvedValue(
      cookieStore({ [ACCESS_TOKEN_COOKIE]: "access" }),
    );
    const fetchMock = jest.fn(async () =>
      jsonResponse({ items: [1, 2, 3] }, 200),
    );
    global.fetch = fetchMock as never;
    return fetchMock;
  }

  it("makes one API call for many identical concurrent GETs", async () => {
    const fetchMock = arrange();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        apiRequestJson<{ items: number[] }>("/locations?isActive=true"),
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.items.length === 3)).toBe(true);
  });

  it("gives every caller its own copy, so one cannot corrupt another", async () => {
    arrange();
    const [a, b] = await Promise.all([
      apiRequestJson<{ items: number[] }>("/designations"),
      apiRequestJson<{ items: number[] }>("/designations"),
    ]);
    a.items.push(99);
    expect(b.items).toEqual([1, 2, 3]);
  });

  it("does not share different paths", async () => {
    const fetchMock = arrange();
    await Promise.all([apiRequestJson("/a"), apiRequestJson("/b")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a write clears sharing so a later read is fresh", async () => {
    const fetchMock = arrange();
    await apiRequestJson("/settings/x");
    await apiRequestJson("/settings/x", { method: "PATCH", body: "{}" });
    await apiRequestJson("/settings/x");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retain a failure: the next identical GET tries again", async () => {
    (cookies as jest.Mock).mockResolvedValue(
      cookieStore({ [ACCESS_TOKEN_COOKIE]: "access" }),
    );
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "boom" }, 500))
      .mockResolvedValue(jsonResponse({ ok: true }, 200));
    global.fetch = fetchMock as never;

    await expect(apiRequestJson("/flaky")).rejects.toBeDefined();
    await expect(apiRequestJson("/flaky")).resolves.toEqual({ ok: true });
  });
});
