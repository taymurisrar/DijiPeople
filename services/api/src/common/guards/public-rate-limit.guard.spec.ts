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
   */
  it('gives each visitor their own allowance behind a shared proxy', () => {
    const guard = new PublicRateLimitGuard();
    const path = `/public-proxied-test-${Date.now()}`;
    const noisy = context(path, 'POST', '203.0.113.7, 198.51.100.2');
    const quiet = context(path, 'POST', '203.0.113.9, 198.51.100.2');

    for (let index = 0; index < 20; index += 1)
      expect(guard.canActivate(noisy)).toBe(true);
    expect(() => guard.canActivate(noisy)).toThrow(HttpException);

    // Same egress address, different visitor — must be unaffected.
    expect(guard.canActivate(quiet)).toBe(true);
  });
});
