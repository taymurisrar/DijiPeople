/*
 * Behavioural cover for the two admin sign-out defects, BUG-0009 and BUG-0010.
 *
 * **Why this file exists separately from `logout-route.spec.ts`.** That file
 * asserts the route's *source shape* — that GET and POST are exported, and that
 * the guarded-call pattern is present in the text of the module. Both bug
 * records said so themselves, in almost the same words:
 *
 *   "That static test rejects the old guarded-call source shape, but does not
 *    invoke logout or prove the persisted token row is revoked."
 *   "The static test confirms the safe wrapper/fallback source shape but does
 *    not execute the route under a rejected cookie configuration."
 *
 * A test that reads the source and finds the right shape is
 * `assertion-without-a-check`: rewrite the same behaviour a different way and it
 * still passes; delete the behaviour and leave the shape and it still passes.
 * Both records were left `VERIFIED` on that basis for three days.
 *
 * These tests invoke the handlers.
 */

const cookieJar = new Map<string, string>();
let clearCookieOptionsThrows = false;

jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

jest.mock('@/lib/auth-cookies', () => ({
  getClearAuthCookieOptions: () => {
    if (clearCookieOptionsThrows) {
      // The real failure: ADMIN_COOKIE_DOMAIN pointing at a host the cookie
      // configuration rejects, e.g. a `.vercel.app` production origin.
      throw new Error('Rejected cookie configuration for host');
    }
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: true,
      path: '/',
      maxAge: 0,
    };
  },
}));

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
} from '@/lib/auth-config';

const originalFetch = global.fetch;
let fetchCalls: Array<{ url: string; init: RequestInit }> = [];

beforeEach(() => {
  cookieJar.clear();
  fetchCalls = [];
  clearCookieOptionsThrows = false;
  process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://api.test/api';
  global.fetch = (async (url: string, init: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

function request(url = 'http://admin.test/api/auth/logout') {
  return new Request(url, { method: 'POST' });
}

describe('BUG-0009 — sign-out revokes the server session without the refresh cookie', () => {
  it('still calls the API when the refresh cookie has expired', async () => {
    // The defect: revocation was guarded on the refresh cookie alone, so a
    // sign-out performed after it expired cleared the browser and left the
    // platform session live server-side. Access and session cookies outlive it.
    cookieJar.set(ACCESS_TOKEN_COOKIE, 'access-value');
    cookieJar.set(SESSION_COOKIE, 'session-value');

    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('/auth/logout');

    // The API resolves the session from the forwarded Cookie header, so the
    // cookies that DID survive have to reach it.
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers.Cookie).toContain(ACCESS_TOKEN_COOKIE);
    expect(headers.Cookie).toContain(SESSION_COOKIE);
    expect(headers['X-DijiPeople-App']).toBeTruthy();
  });

  it('calls the API when only the refresh cookie survives', async () => {
    cookieJar.set(REFRESH_TOKEN_COOKIE, 'refresh-value');

    const { POST } = await import('./route');
    await POST(request());

    expect(fetchCalls).toHaveLength(1);
  });

  it('makes no call when the browser holds no auth cookies at all', async () => {
    // Asserted as the pair to the two above: without this, a handler that
    // called the API unconditionally would pass both of them while sending a
    // pointless unauthenticated request on every anonymous hit.
    const { POST } = await import('./route');
    const response = await POST(request());

    expect(fetchCalls).toHaveLength(0);
    expect(response.status).toBe(200);
  });

  it('signs out locally even when the API is unreachable', async () => {
    cookieJar.set(REFRESH_TOKEN_COOKIE, 'refresh-value');
    global.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const { POST } = await import('./route');
    const response = await POST(request());

    expect(response.status).toBe(200);
  });
});

describe('BUG-0010 — a rejected cookie configuration does not turn sign-out into a 500', () => {
  it('returns 200 from POST and still expires the cookies', async () => {
    clearCookieOptionsThrows = true;
    cookieJar.set(REFRESH_TOKEN_COOKIE, 'refresh-value');

    const { POST } = await import('./route');
    const response = await POST(request());

    // The defect turned every operator's sign-out into a 500 and trapped them
    // in the session-expired loop with no route back to /login.
    expect(response.status).toBe(200);

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(ACCESS_TOKEN_COOKIE);
    // Expiring the cookie is the point; falling back must not skip it.
    expect(setCookie.toLowerCase()).toContain('max-age=0');
  });

  it('still redirects from GET rather than throwing', async () => {
    clearCookieOptionsThrows = true;
    cookieJar.set(REFRESH_TOKEN_COOKIE, 'refresh-value');

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://admin.test/api/auth/logout?reason=expired'),
    );

    // GET is what the session-expired "Sign in again" link performs. A throw
    // here is the exact production failure: stranded on an error page.
    expect([302, 307]).toContain(response.status);
    expect(response.headers.get('location')).toContain('reason=expired');
  });

  it('uses the configured options when the configuration is accepted', async () => {
    // The pair to the two above. Without it, a route that ALWAYS used the
    // fallback would pass them both while silently dropping the real cookie
    // domain and secure flag in production.
    clearCookieOptionsThrows = false;
    cookieJar.set(REFRESH_TOKEN_COOKIE, 'refresh-value');

    const { POST } = await import('./route');
    const response = await POST(request());

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie.toLowerCase()).toContain('secure');
  });
});
