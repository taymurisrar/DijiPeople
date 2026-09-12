import { buildAuthSessionCookies } from "./auth-session-cookies";

/*
 * BUG-3357 — three places used to write the access/refresh/session cookies,
 * and only two of them read the lifetimes the API actually returned for the
 * session. `buildAuthSessionCookies` is now the one function all three call
 * (the sign-in route, `lib/server-api.ts`, and `proxy.ts`), so this file is
 * the single place their shared behaviour is pinned.
 */
describe("buildAuthSessionCookies", () => {
  const baseTokens = {
    accessToken: "access-token-value",
    refreshToken: "refresh-token-value",
  };

  it("issues browser-session cookies (no maxAge) when the session is not remembered", () => {
    const cookies = buildAuthSessionCookies({ ...baseTokens, rememberMe: false });

    expect(cookies.access.options.maxAge).toBeUndefined();
    expect(cookies.refresh.options.maxAge).toBeUndefined();
  });

  it("issues browser-session cookies when rememberMe is omitted entirely", () => {
    const cookies = buildAuthSessionCookies(baseTokens);

    expect(cookies.access.options.maxAge).toBeUndefined();
    expect(cookies.refresh.options.maxAge).toBeUndefined();
  });

  it("applies the API's own expiry strings when the session is remembered", () => {
    const cookies = buildAuthSessionCookies({
      ...baseTokens,
      rememberMe: true,
      accessTokenExpiresIn: "45m",
      refreshTokenExpiresIn: "14d",
    });

    expect(cookies.access.options.maxAge).toBe(45 * 60);
    expect(cookies.refresh.options.maxAge).toBe(14 * 24 * 60 * 60);
  });

  it("falls back to this app's configured defaults when remembered but the API omitted the expiry strings", () => {
    const cookies = buildAuthSessionCookies({ ...baseTokens, rememberMe: true });

    // Whatever ACCESS_TOKEN_MAX_AGE_SECONDS/REFRESH_TOKEN_MAX_AGE_SECONDS
    // resolve to in this environment, but a real number — never `undefined`,
    // which is what would silently downgrade a remembered session to a
    // browser-session cookie.
    expect(typeof cookies.access.options.maxAge).toBe("number");
    expect(typeof cookies.refresh.options.maxAge).toBe("number");
  });

  it("gives the session cookie the same lifetime as the refresh cookie", () => {
    const cookies = buildAuthSessionCookies({
      ...baseTokens,
      sessionId: "session-abc",
      rememberMe: true,
      refreshTokenExpiresIn: "30d",
    });

    expect(cookies.session?.value).toBe("session-abc");
    expect(cookies.session?.options.maxAge).toBe(cookies.refresh.options.maxAge);
  });

  it("omits the session cookie entirely when no sessionId is given", () => {
    const cookies = buildAuthSessionCookies(baseTokens);

    expect(cookies.session).toBeUndefined();
  });

  it("never derives a remembered lifetime from a literal number in this file", () => {
    // BUG-3357's regression ask, made concrete: a remembered access cookie's
    // maxAge must track the API's own `accessTokenExpiresIn`, not a constant
    // this module invents. Two different remembered inputs must produce two
    // different maxAges when their expiry strings differ.
    const short = buildAuthSessionCookies({
      ...baseTokens,
      rememberMe: true,
      accessTokenExpiresIn: "5m",
    });
    const long = buildAuthSessionCookies({
      ...baseTokens,
      rememberMe: true,
      accessTokenExpiresIn: "2h",
    });

    expect(short.access.options.maxAge).toBe(5 * 60);
    expect(long.access.options.maxAge).toBe(2 * 60 * 60);
    expect(short.access.options.maxAge).not.toBe(long.access.options.maxAge);
  });
});
