import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { of } from 'rxjs';
import {
  AuthenticatedRateLimitInterceptor,
  __authenticatedRateLimitInternals,
  shouldRateLimitAuthenticatedRequest,
} from './authenticated-rate-limit.interceptor';

function context(userId: string | undefined, method: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        user: userId ? { userId } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

const handler: CallHandler = { handle: () => of('ok') };

describe('AuthenticatedRateLimitInterceptor', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // The interceptor deliberately no-ops under NODE_ENV=test (see its doc
    // comment) — force it on so these specs exercise the real budget path.
    process.env.NODE_ENV = 'not-test';
    __authenticatedRateLimitInternals.windows.clear();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('RATE-03 — throttles a single authenticated user past the write budget', () => {
    const interceptor = new AuthenticatedRateLimitInterceptor();
    const request = context(`user-${Date.now()}`, 'POST');

    for (let i = 0; i < __authenticatedRateLimitInternals.WRITE_LIMIT; i += 1) {
      interceptor.intercept(request, handler);
    }

    expect(() => interceptor.intercept(request, handler)).toThrow(
      HttpException,
    );
  });

  it('gives reads a separate, larger budget than writes for the same user', () => {
    const interceptor = new AuthenticatedRateLimitInterceptor();
    const userId = `user-${Date.now()}`;
    const writes = context(userId, 'POST');
    const reads = context(userId, 'GET');

    for (let i = 0; i < __authenticatedRateLimitInternals.WRITE_LIMIT; i += 1) {
      interceptor.intercept(writes, handler);
    }
    expect(() => interceptor.intercept(writes, handler)).toThrow(HttpException);

    // Exhausting the write budget must not touch the read budget.
    expect(() => interceptor.intercept(reads, handler)).not.toThrow();
  });

  it('does not throttle one user for another user exhausting their own budget', () => {
    const interceptor = new AuthenticatedRateLimitInterceptor();
    const noisy = context(`noisy-${Date.now()}`, 'POST');
    const quiet = context(`quiet-${Date.now()}`, 'POST');

    for (let i = 0; i < __authenticatedRateLimitInternals.WRITE_LIMIT; i += 1) {
      interceptor.intercept(noisy, handler);
    }
    expect(() => interceptor.intercept(noisy, handler)).toThrow(HttpException);
    expect(() => interceptor.intercept(quiet, handler)).not.toThrow();
  });

  /**
   * This is the seam the fix must guard, not just its two ends. Wiring the
   * interceptor globally (main.ts) and writing the budget logic (this file)
   * can each look correct in isolation while the thing that actually decides
   * "is this request in scope" silently exempts everything — a global
   * guard here instead of an interceptor would do exactly that (see the class
   * doc comment for why). This asserts the decision function itself, not just
   * its wiring.
   */
  describe('shouldRateLimitAuthenticatedRequest', () => {
    it('is true only for a request that already carries an authenticated user', () => {
      expect(
        shouldRateLimitAuthenticatedRequest(
          context('user-1', 'POST').switchToHttp().getRequest(),
        ),
      ).toBe(true);
    });

    it('is false for a request with no user — the public/unauthenticated path', () => {
      expect(
        shouldRateLimitAuthenticatedRequest(
          context(undefined, 'POST').switchToHttp().getRequest(),
        ),
      ).toBe(false);
    });

    it('is false under NODE_ENV=test, so the suite itself cannot trip it', () => {
      process.env.NODE_ENV = 'test';
      expect(
        shouldRateLimitAuthenticatedRequest(
          context('user-1', 'POST').switchToHttp().getRequest(),
        ),
      ).toBe(false);
    });
  });

  /**
   * BUG-2458 adjacent: `POST /auth/refresh` never reaches this interceptor's
   * budget at all, because it is `@Public()` and never populates
   * `request.user`. Asserted here so a future change that starts stamping a
   * user onto public requests does not silently drag refresh into a budget
   * sized for authenticated traffic.
   */
  it('does not throttle a request with no authenticated user, however many are made', () => {
    const interceptor = new AuthenticatedRateLimitInterceptor();
    const publicRequest = context(undefined, 'POST');

    for (
      let i = 0;
      i < __authenticatedRateLimitInternals.WRITE_LIMIT + 50;
      i += 1
    ) {
      expect(() => interceptor.intercept(publicRequest, handler)).not.toThrow();
    }
  });
});
