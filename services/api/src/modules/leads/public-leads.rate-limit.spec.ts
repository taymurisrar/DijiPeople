import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { PublicLeadsController } from './public-leads.controller';

/*
 * REG-011 — the public lead endpoint was the one unrated public surface.
 *
 * POST /api/public/leads is unauthenticated and, per submission, writes a Lead
 * and emails every active platform user holding a sales or admin platform role.
 * It carried @Public() but no PublicRateLimitGuard, while the neighbouring
 * public surfaces (partner inquiries, signature tokens, gateway) all did. The
 * E2E run put 25 submissions through in one burst: all 25 were accepted, and the
 * same burst against /public/partners/inquiries was throttled — so the guard
 * worked, it simply was not applied here.
 *
 * That made the endpoint both an unbounded Lead-growth vector and an outbound
 * email amplifier for anyone with a loop.
 */
describe('PublicLeadsController rate limiting', () => {
  const guards =
    (Reflect.getMetadata(
      GUARDS_METADATA,
      PublicLeadsController,
    ) as unknown[]) ?? [];

  it('applies PublicRateLimitGuard to the public lead submission surface', () => {
    expect(guards).toContain(PublicRateLimitGuard);
  });

  it('keeps the endpoint public — the guard throttles, it must not authenticate', () => {
    /*
     * A lead form on the marketing site has no session. If this ever picks up
     * JwtAuthGuard the public funnel silently stops capturing leads, so the
     * guard list is pinned to exactly the rate limiter.
     */
    expect(guards).toEqual([PublicRateLimitGuard]);
  });
});
