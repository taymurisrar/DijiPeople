import { SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { satisfiesPermissionRequirement } from '../../common/security/permission-evaluation';

/**
 * Whether the caller may see what the tenant pays DijiPeople.
 *
 * `GET /tenant-settings/features` is readable with `settings.read`, which a
 * manager holds so the module list renders. The price and billing cycle are not
 * needed for that and are commercial information: only a caller who could also
 * change settings is shown them (DP-QA-009). Evaluated with the guard's own
 * function, so the elevated-admin bypass behaves exactly as it does there.
 */
export function canSeeSubscriptionPricing(user: AuthenticatedUser): boolean {
  return satisfiesPermissionRequirement(user, {
    legacyKeys: ['settings.update'],
    rbac: [
      {
        entityKey: ENTITY_KEYS.SETTINGS,
        privilege: SecurityPrivilege.CONFIGURE,
      },
    ],
  });
}

type WithSubscription<T> = { subscription: T | null };

/** Drops the money fields, keeping plan and status for module visibility. */
export function redactSubscriptionPricing<
  T extends {
    billingCycle?: unknown;
    finalPrice?: unknown;
    currency?: unknown;
  },
  R extends WithSubscription<T>,
>(result: R): R {
  if (!result.subscription) return result;

  const {
    billingCycle: _billingCycle,
    finalPrice: _finalPrice,
    currency: _currency,
    ...safe
  } = result.subscription;

  return { ...result, subscription: safe as T };
}
