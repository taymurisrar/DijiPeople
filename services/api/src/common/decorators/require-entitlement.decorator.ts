import { SetMetadata } from '@nestjs/common';
import type { TenantFeatureKey } from '../constants/tenant-features';

export const REQUIRED_ENTITLEMENTS_KEY = 'required_entitlements';

/**
 * Declares which plan feature a controller (or a single handler) belongs to.
 *
 * A third gate, alongside the two permission systems and deliberately separate
 * from both: `@Permissions` and `@RequirePermission` answer "may this person do
 * this", while this answers "did this tenant buy this at all". Nothing here
 * consults roles, and `hasElevatedTenantRole` does not apply — a tenant
 * administrator cannot grant their own tenant a module the plan excludes.
 *
 * ```ts
 * @Controller('payroll')
 * @UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
 * @RequireEntitlement(TENANT_FEATURE_KEYS.PAYROLL)
 * export class PayrollController {}
 * ```
 *
 * Several keys mean "any one of them entitles this route", which is the useful
 * reading for a surface two plans reach by different names. Nothing declares
 * more than one today.
 */
export const RequireEntitlement = (...featureKeys: TenantFeatureKey[]) =>
  SetMetadata(REQUIRED_ENTITLEMENTS_KEY, featureKeys);
