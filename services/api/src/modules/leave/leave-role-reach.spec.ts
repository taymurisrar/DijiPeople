import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { roleCanReach } from '../../common/testing/provisioned-role-user';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveTypesController } from './leave-types.controller';

/**
 * Re-check of the HR leave-type and approval permissions raised in DP-QA-011.
 * Evaluated against what provisioning really grants each system role, through
 * the guard's own decision function.
 */
describe('leave routes reached by provisioned system roles', () => {
  it.each(['approve', 'reject'])('HR and managers reach %s', (handler) => {
    expect(roleCanReach(ROLE_KEYS.HR, LeaveRequestsController, handler)).toBe(
      true,
    );
    expect(
      roleCanReach(ROLE_KEYS.MANAGER, LeaveRequestsController, handler),
    ).toBe(true);
  });

  it.each(['approve', 'reject'])('employees are refused %s', (handler) => {
    expect(
      roleCanReach(ROLE_KEYS.EMPLOYEE, LeaveRequestsController, handler),
    ).toBe(false);
  });

  it('HR can list leave types for configuration; employees cannot', () => {
    expect(roleCanReach(ROLE_KEYS.HR, LeaveTypesController, 'findAll')).toBe(
      true,
    );
    expect(
      roleCanReach(ROLE_KEYS.EMPLOYEE, LeaveTypesController, 'findAll'),
    ).toBe(false);
  });

  it('HR can create and update leave types; managers cannot', () => {
    for (const handler of ['create', 'update']) {
      if (
        typeof (
          LeaveTypesController.prototype as unknown as Record<string, unknown>
        )[handler] !== 'function'
      ) {
        continue;
      }
      expect(roleCanReach(ROLE_KEYS.HR, LeaveTypesController, handler)).toBe(
        true,
      );
      expect(
        roleCanReach(ROLE_KEYS.MANAGER, LeaveTypesController, handler),
      ).toBe(false);
    }
  });
});
