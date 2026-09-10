import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { PublicRateLimitGuard } from './public-rate-limit.guard';

function context(path: string, method = 'POST', forwardedFor?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '203.0.113.77',
        path,
        method,
        headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
        socket: { remoteAddress: '203.0.113.77' },
        app: { get: (key: string) => (key === 'trust proxy' ? 1 : undefined) },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('public workflow rate limiting', () => {
  it('allows normal public traffic and limits repeated mutation attempts', () => {
    const guard = new PublicRateLimitGuard();
    const request = context(`/public-rate-test-${Date.now()}`);
    for (let index = 0; index < 20; index += 1)
      expect(guard.canActivate(request)).toBe(true);
    expect(() => guard.canActivate(request)).toThrow(HttpException);
  });

  it('uses a higher allowance for read-only signing and onboarding sessions', () => {
    const guard = new PublicRateLimitGuard();
    const request = context(`/public-read-test-${Date.now()}`, 'GET');
    for (let index = 0; index < 25; index += 1)
      expect(guard.canActivate(request)).toBe(true);
  });

  /**
   * BUG-0032. Every public form is proxied by a Next route handler, so the
   * socket address is that app's — identical for the whole world. Keyed on it,
   * one visitor exhausting the limit returned 429 to every other visitor, and
   * the guard could not tell an attacker from a customer.
   *
   * Both directions are asserted: one visitor must not spend another's
   * allowance, and a visitor must still be stopped once they spend their own.
   *
   * The fixture reads two-entry chains where only the *second* entry differs —
   * see RATE-01 below for why the position matters. This test is about the
   * position the guard actually trusts, not the leftmost one.
   */
  it('gives each visitor their own allowance for what the trusted hop itself observed', () => {
    const guard = new PublicRateLimitGuard();
    const path = `/public-proxied-test-${Date.now()}`;
    const noisy = context(path, 'POST', 'anything-here, 203.0.113.7');
    const quiet = context(path, 'POST', 'anything-here, 203.0.113.9');

    for (let index = 0; index < 20; index += 1)
      expect(guard.canActivate(noisy)).toBe(true);
    expect(() => guard.canActivate(noisy)).toThrow(HttpException);

    // Different address at the position the trusted hop appended — unaffected.
    expect(guard.canActivate(quiet)).toBe(true);
  });

  /**
   * RATE-01 / INF-06. The API is directly reachable, so the *first* entry of
   * `X-Forwarded-For` is exactly what an attacker controls — `resolveClientIp`
   * used to read it unconditionally, so rotating that value bought a fresh
   * 20-request budget on every call. It now reads the position a trusted hop
   * itself appended, which an attacker cannot move by padding the header.
   */
  it('does not let a caller mint a fresh identity by varying the untrusted prefix', () => {
    const guard = new PublicRateLimitGuard();
    const path = `/public-forge-test-${Date.now()}`;
    const first = context(path, 'POST', 'forged-identity-1, 203.0.113.7');
    const second = context(path, 'POST', 'forged-identity-2, 203.0.113.7');

    for (let index = 0; index < 20; index += 1)
      expect(guard.canActivate(first)).toBe(true);
    // Same trusted-hop-observed address, different forged prefix — must share
    // the one budget, not mint a fresh one.
    expect(() => guard.canActivate(second)).toThrow(HttpException);
  });

  /**
   * BUG-2458. `POST /auth/refresh` sat behind the credential-submission budget
   * — 20 writes per ten minutes per IP. Refresh is not a credential
   * submission: every open tab issues it on a timer, three client apps issue
   * it, and everyone behind one office NAT shares the bucket. Production
   * returned `429` on it 52 times in a single day, and a client that cannot
   * refresh signs the user out of a session that was still valid.
   *
   * The pair of assertions is the point. Raising the refresh budget is only
   * safe if the credential budget provably did not move with it.
   */
  describe('BUG-2458 — refresh is budgeted as machine traffic', () => {
    it('allows sustained refresh from one address', () => {
      const guard = new PublicRateLimitGuard();
      const request = context(`/t${Date.now()}/auth/refresh`);

      // Comfortably past the old limit of 20, and past what a real fleet of
      // tabs on one NAT would produce in the window.
      for (let index = 0; index < 200; index += 1)
        expect(guard.canActivate(request)).toBe(true);
    });

    it('still refuses an implausible flood on refresh', () => {
      const guard = new PublicRateLimitGuard();
      const request = context(`/f${Date.now()}/auth/refresh`);

      for (let index = 0; index < 600; index += 1)
        expect(guard.canActivate(request)).toBe(true);
      expect(() => guard.canActivate(request)).toThrow(HttpException);
    });

    it.each([
      '/auth/login',
      '/admin/auth/login',
      '/agent/auth/login',
      '/auth/forgot-password',
      '/auth/activate-account',
      '/public/subscribe',
      '/public/leads',
    ])('leaves the credential budget on %s at 20', (path) => {
      /*
       * The guard exists on these routes because of BUG-0013, BUG-0031,
       * BUG-0033 and BUG-0075. If a future route override ever widens to match
       * one of them, this fails rather than quietly reopening an enumeration
       * and credential-stuffing surface.
       */
      const guard = new PublicRateLimitGuard();
      const request = context(`/s${Date.now()}${path}`);

      for (let index = 0; index < 20; index += 1)
        expect(guard.canActivate(request)).toBe(true);
      expect(() => guard.canActivate(request)).toThrow(HttpException);
    });
  });
});
