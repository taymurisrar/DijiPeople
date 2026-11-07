import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import { roleCanReach } from '../../common/testing/provisioned-role-user';
import { AttendanceController } from './attendance.controller';

/**
 * DP-QA-022. An employee could create and cancel a correction request but got
 * 403 reading it back: the read routes demand `dashboard.view`, which
 * provisioning never granted (DP-QA-002). The service already scopes the read to
 * the caller's own records; this pins that the shipped role reaches it.
 */
describe('attendance correction reads for provisioned roles', () => {
  it.each(['listCorrectionRequests', 'getCorrectionRequest'])(
    'the employee role reaches %s',
    (handler) => {
      expect(
        roleCanReach(ROLE_KEYS.EMPLOYEE, AttendanceController, handler),
      ).toBe(true);
    },
  );

  it.each(['approveCorrectionRequest', 'rejectCorrectionRequest'])(
    'the employee role is still refused %s',
    (handler) => {
      expect(
        roleCanReach(ROLE_KEYS.EMPLOYEE, AttendanceController, handler),
      ).toBe(false);
    },
  );

  it('the employee can still create and cancel their own request', () => {
    for (const handler of [
      'createCorrectionRequest',
      'cancelCorrectionRequest',
    ]) {
      expect(
        roleCanReach(ROLE_KEYS.EMPLOYEE, AttendanceController, handler),
      ).toBe(true);
    }
  });
});
