import {
  ROLE_KEYS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
} from '../../common/constants/rbac-matrix';
import { DataManagementController } from './data-management.controller';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import { REQUIRED_ENTITLEMENTS_KEY } from '../../common/decorators/require-entitlement.decorator';

/*
 * Basic import/export is now sold on every plan. That widens WHERE it is
 * reachable, never WHO: the bulk-export and bulk-import grants must stay with
 * the administrative roles, so a Starter tenant's employees, managers and
 * recruiters cannot bulk-export sensitive employee data.
 */
describe('data-management access after opening it to every plan', () => {
  const holders = (permission: string) =>
    Object.entries(SYSTEM_ROLE_MISC_PERMISSIONS)
      .filter(([, keys]) => keys.includes(permission))
      .map(([role]) => role)
      .sort();

  it.each([
    'data-management.export',
    'data-management.import.execute',
    'data-management.import.validate',
  ])('%s is held only by administrative and HR roles', (permission) => {
    expect(holders(permission)).toEqual(
      [ROLE_KEYS.GLOBAL_ADMIN, ROLE_KEYS.SYSTEM_ADMIN, ROLE_KEYS.HR].sort(),
    );
  });

  it('is gated on basic import/export, not the advanced tier', () => {
    const required = Reflect.getMetadata(
      REQUIRED_ENTITLEMENTS_KEY,
      DataManagementController,
    ) as string[];
    expect(required).toEqual([TENANT_FEATURE_KEYS.DATA_IMPORT_EXPORT]);
    expect(required).not.toContain(
      TENANT_FEATURE_KEYS.ADVANCED_DATA_MANAGEMENT,
    );
  });
});
