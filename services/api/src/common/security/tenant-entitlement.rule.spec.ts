import { SubscriptionStatus } from '@prisma/client';
import { isSubscriptionLive } from './tenant-entitlement.rule';

describe('isSubscriptionLive', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING])(
    '%s is live',
    (status) => {
      expect(isSubscriptionLive(status, null, now)).toBe(true);
    },
  );

  it('keeps an unpaid DijiPeople-billed renewal live inside its grace period', () => {
    expect(
      isSubscriptionLive(
        SubscriptionStatus.PAST_DUE,
        new Date('2026-09-30T00:00:00Z'),
        now,
      ),
    ).toBe(true);
  });

  it('ends access once the grace period has passed', () => {
    expect(
      isSubscriptionLive(
        SubscriptionStatus.PAST_DUE,
        new Date('2026-09-20T00:00:00Z'),
        now,
      ),
    ).toBe(false);
  });

  // Stripe never sets a grace period, so its past_due is unchanged.
  it('treats a PAST_DUE with no grace period as lapsed', () => {
    expect(isSubscriptionLive(SubscriptionStatus.PAST_DUE, null, now)).toBe(
      false,
    );
  });

  it.each([
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.INCOMPLETE,
    SubscriptionStatus.UNPAID,
  ])('%s is not live, even with a stray grace date', (status) => {
    expect(
      isSubscriptionLive(status, new Date('2026-12-31T00:00:00Z'), now),
    ).toBe(false);
  });
});
