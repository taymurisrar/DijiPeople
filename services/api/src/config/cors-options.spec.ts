import { buildCorsOptions } from './env.validation';

/**
 * REG — a refused origin is a policy decision, not a server error.
 *
 * `buildCorsOptions` used to call `callback(new Error(...), false)` for an
 * origin outside the allowlist. The `cors` middleware treats an Error as a
 * thrown failure, so Nest's `HttpExceptionFilter` rendered it as
 * `500 SYSTEM_UNEXPECTED_ERROR` — and that filter persists every error through
 * `ErrorLogsService`.
 *
 * The consequence, observed on production on 2026-08-23: `GET /api/public/plans`
 * returned **200** with no `Origin` header and **500** with
 * `Origin: http://localhost:3001`. Any unauthenticated caller could write rows
 * to the production error-log table in a loop by varying a header. BUG-0976.
 *
 * These assert the callback contract directly rather than booting the app,
 * because the defect is entirely in what the callback is handed.
 */
describe('CORS origin policy', () => {
  const env = {
    CORS_ALLOWED_ORIGINS:
      'https://www.dijipeople.com,https://app.dijipeople.com',
  } as unknown as NodeJS.ProcessEnv;

  /** The `origin` field is a function in this configuration; narrow to it. */
  function originCallback() {
    const origin = buildCorsOptions(env).origin;
    if (typeof origin !== 'function') {
      throw new Error('expected a dynamic origin function');
    }
    return origin as (
      requestOrigin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => void;
  }

  function decide(requestOrigin: string | undefined) {
    let error: Error | null = null;
    let allow: boolean | undefined;
    originCallback()(requestOrigin, (e, a) => {
      error = e;
      allow = a;
    });
    return { error, allow };
  }

  it('allows a configured origin', () => {
    expect(decide('https://www.dijipeople.com')).toEqual({
      error: null,
      allow: true,
    });
  });

  it('allows a request with no Origin header at all', () => {
    // Server-to-server calls, curl and health checks send none. Refusing those
    // would break every non-browser caller for no security gain.
    expect(decide(undefined)).toEqual({ error: null, allow: true });
  });

  it.each(['http://localhost:3001', 'https://evil.example', 'not-a-url'])(
    'refuses %s without raising an error',
    (requestOrigin) => {
      const { error, allow } = decide(requestOrigin);

      // The whole point: no Error. An Error here becomes a 500, and a 500 becomes
      // a persisted error-log row that anyone can trigger.
      expect(error).toBeNull();
      expect(allow).toBe(false);
    },
  );
});
