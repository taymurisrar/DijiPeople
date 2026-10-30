import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  canSeeSubscriptionPricing,
  redactSubscriptionPricing,
} from './subscription-pricing-visibility';

/** DP-QA-009: a manager could read the tenant's plan price and billing cycle. */
function user(
  permissionKeys: string[],
  privilege: SecurityPrivilege,
  roleKeys = ['manager'],
): AuthenticatedUser {
  return {
    userId: 'u',
    tenantId: 't',
    roleIds: [],
    roleKeys,
    permissionKeys,
    rolePrivileges: [
      {
        entityKey: ENTITY_KEYS.SETTINGS,
        privilege,
        accessLevel: SecurityAccessLevel.TENANT,
      },
    ],
  } as unknown as AuthenticatedUser;
}

describe('subscription pricing visibility', () => {
  it('hides pricing from a reader who cannot change settings', () => {
    expect(
      canSeeSubscriptionPricing(
        user(['settings.read'], SecurityPrivilege.READ),
      ),
    ).toBe(false);
  });

  it('shows pricing to a caller who can change settings', () => {
    expect(
      canSeeSubscriptionPricing(
        user(['settings.read', 'settings.update'], SecurityPrivilege.CONFIGURE),
      ),
    ).toBe(true);
  });

  it('shows pricing to the elevated tenant admin, as the guard does', () => {
    expect(
      canSeeSubscriptionPricing(
        user([], SecurityPrivilege.READ, ['system-admin']),
      ),
    ).toBe(true);
  });

  it('removes only the money fields and keeps plan and status', () => {
    const redacted = redactSubscriptionPricing({
      enabledKeys: ['leave'],
      subscription: {
        status: 'ACTIVE',
        plan: { key: 'starter' },
        billingCycle: 'MONTHLY',
        finalPrice: 69,
        currency: 'USD',
      },
    });

    expect(redacted.subscription).toEqual({
      status: 'ACTIVE',
      plan: { key: 'starter' },
    });
    expect(redacted.enabledKeys).toEqual(['leave']);
  });

  it('passes a tenant with no subscription through untouched', () => {
    expect(redactSubscriptionPricing({ subscription: null })).toEqual({
      subscription: null,
    });
  });
});
