import { NextRequest } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
} from "@/lib/auth-config";
import { continueWithRefreshedTokens, refreshSessionTokens } from "./proxy";

/*
 * BUG-3359 — the middleware refreshes on more navigations than any other
 * caller and had no protection against two of them racing on the same
 * refresh cookie. `apps/web/lib/server-api.ts` already de-duplicates its own
 * refreshes; this pins the same guarantee here.
 *
 * BUG-3357 — the middleware used to write the access/refresh/session cookies
 * with a hardcoded `maxAge` instead of the lifetimes the refresh response
 * actually returned. These tests fail if a literal reappears, because they
 * assert the cookie's `maxAge` against the *response's own* expiry strings,
 * not against a number copied from `proxy.ts`.
 */
describe("proxy.ts session refresh", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockRefreshResponse(body: unknown, init: { status?: number } = {}) {
    return {
      ok: (init.status ?? 200) < 300,
      status: init.status ?? 200,
      json: () => Promise.resolve(body),
    } as Response;
  }

  it("de-duplicates two concurrent refreshes of the same token into one fetch", async () => {
    let fetchCalls = 0;
    global.fetch = jest.fn(async () => {
      fetchCalls += 1;
      return mockRefreshResponse({
        tokens: {
          accessToken: "new-access-token",
          refreshToken: "new-refresh-token",
        },
      });
    }) as unknown as typeof fetch;

    const [first, second] = await Promise.all([
      refreshSessionTokens("shared-refresh-token"),
      refreshSessionTokens("shared-refresh-token"),
    ]);

    expect(fetchCalls).toBe(1);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, accessToken: "new-access-token" });
  });

  it("makes a fresh call for a refresh token that is not currently in flight", async () => {
    let fetchCalls = 0;
    global.fetch = jest.fn(async () => {
      fetchCalls += 1;
      return mockRefreshResponse({
        tokens: {
          accessToken: `access-${fetchCalls}`,
          refreshToken: `refresh-${fetchCalls}`,
        },
      });
    }) as unknown as typeof fetch;

    await refreshSessionTokens("token-a");
    await refreshSessionTokens("token-b");

    expect(fetchCalls).toBe(2);
  });

  it("carries rememberMe and the returned expiry strings through, not just the tokens", async () => {
    global.fetch = jest.fn(async () =>
      mockRefreshResponse({
        tokens: {
          accessToken: "access",
          refreshToken: "refresh",
          sessionId: "session-1",
          rememberMe: true,
          accessTokenExpiresIn: "30m",
          refreshTokenExpiresIn: "30d",
        },
      }),
    ) as unknown as typeof fetch;

    const result = await refreshSessionTokens("remembered-token");

    expect(result).toMatchObject({
      ok: true,
      sessionId: "session-1",
      rememberMe: true,
      accessTokenExpiresIn: "30m",
      refreshTokenExpiresIn: "30d",
    });
  });

  it("reports shouldLogout for a 401/403 and not for other failures", async () => {
    global.fetch = jest.fn(async () =>
      mockRefreshResponse({}, { status: 401 }),
    ) as unknown as typeof fetch;
    const revoked = await refreshSessionTokens("dead-token-1");
    expect(revoked).toEqual({ ok: false, shouldLogout: true });

    global.fetch = jest.fn(async () =>
      mockRefreshResponse({}, { status: 503 }),
    ) as unknown as typeof fetch;
    const transient = await refreshSessionTokens("dead-token-2");
    expect(transient).toEqual({ ok: false, shouldLogout: false });
  });
});

describe("continueWithRefreshedTokens cookie lifetimes", () => {
  function request() {
    return new NextRequest("https://tenant.dijipeople.com/dashboard", {
      headers: { cookie: "" },
    });
  }

  function cookieMaxAge(response: ReturnType<typeof continueWithRefreshedTokens>, name: string) {
    return response.cookies.get(name)?.maxAge;
  }

  it("sets no maxAge for an ordinary (non-remembered) refresh — a browser-session cookie", () => {
    const response = continueWithRefreshedTokens(request(), {
      ok: true,
      accessToken: "access.token.value",
      refreshToken: "refresh.token.value",
      rememberMe: false,
    });

    expect(cookieMaxAge(response, ACCESS_TOKEN_COOKIE)).toBeUndefined();
    expect(cookieMaxAge(response, REFRESH_TOKEN_COOKIE)).toBeUndefined();
  });

  it("BUG-3357 — a remembered refresh applies the lifetimes the response returned, not a literal", () => {
    const response = continueWithRefreshedTokens(request(), {
      ok: true,
      accessToken: "access.token.value",
      refreshToken: "refresh.token.value",
      rememberMe: true,
      accessTokenExpiresIn: "30m",
      refreshTokenExpiresIn: "30d",
    });

    // 30 minutes and 30 days, computed from the response — never the
    // middleware's old literals of 900 seconds and an env-resolved TTL.
    expect(cookieMaxAge(response, ACCESS_TOKEN_COOKIE)).toBe(30 * 60);
    expect(cookieMaxAge(response, REFRESH_TOKEN_COOKIE)).toBe(30 * 24 * 60 * 60);
    expect(cookieMaxAge(response, ACCESS_TOKEN_COOKIE)).not.toBe(15 * 60);
  });

  it("writes the session cookie when a sessionId is present", () => {
    const response = continueWithRefreshedTokens(request(), {
      ok: true,
      accessToken: "access.token.value",
      refreshToken: "refresh.token.value",
      sessionId: "session-abc",
      rememberMe: false,
    });

    expect(response.cookies.get(SESSION_COOKIE)?.value).toBe("session-abc");
  });
});
