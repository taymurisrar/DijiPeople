import { EmployeeEmploymentStatus } from '@prisma/client';
import { resolveRecordLifecycle } from './employee-lifecycle.constants';

describe('resolveRecordLifecycle (BUG-4447)', () => {
  it('publishes a draft profile as DRAFT / DATA_COLLECTION / INACTIVE whatever is stored', () => {
    expect(
      resolveRecordLifecycle({
        isDraftProfile: true,
        status: 'ACTIVE',
        subStatus: 'OPEN',
        employmentStatus: EmployeeEmploymentStatus.ACTIVE,
      }),
    ).toEqual({
      status: 'DRAFT',
      subStatus: 'DATA_COLLECTION',
      employmentStatus: EmployeeEmploymentStatus.INACTIVE,
    });
  });

  it('keeps the draft sub statuses that carry meaning', () => {
    for (const subStatus of ['ONBOARDING', 'READY_FOR_ACTIVATION']) {
      expect(
        resolveRecordLifecycle({
          isDraftProfile: true,
          status: 'DRAFT',
          subStatus,
          employmentStatus: EmployeeEmploymentStatus.INACTIVE,
        }).subStatus,
      ).toBe(subStatus);
    }
  });

  it('reports the stored lifecycle of a real employee, so an edit form cannot reset it', () => {
    expect(
      resolveRecordLifecycle({
        isDraftProfile: false,
        status: 'INACTIVE',
        subStatus: 'SUSPENDED',
        employmentStatus: EmployeeEmploymentStatus.INACTIVE,
      }),
    ).toEqual({
      status: 'INACTIVE',
      subStatus: 'SUSPENDED',
      employmentStatus: EmployeeEmploymentStatus.INACTIVE,
    });
  });
});
