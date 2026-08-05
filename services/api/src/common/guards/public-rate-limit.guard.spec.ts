import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { PublicRateLimitGuard } from './public-rate-limit.guard';

function context(path: string, method = 'POST') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip: '203.0.113.77', path, method }),
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
});
