import { BadRequestException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { AttendanceOperationsService } from './attendance-operations.service';

/*
 * ITEM-0179 — the transactional guarantees the web Work Sites tab relies on.
 *
 * 1. A validity edit leaves the primary flag alone. `assignWorkSite` used to
 *    coerce an omitted `isPrimary` to `false`, so editing the primary site's
 *    dates demoted it while `Employee.locationId` still pointed at it.
 * 2. Make primary writes every row it touches — the old primary, the new
 *    primary and `Employee.locationId` — inside one `$transaction` callback,
 *    and writes nothing when the site is not an active assignment.
 */

type Constructor = ConstructorParameters<typeof AttendanceOperationsService>;

const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const HEAD_OFFICE = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE = '33333333-3333-4333-8333-333333333333';

const user = {
  userId: 'user-1',
  tenantId: 'tenant-1',
} as AuthenticatedUser;

function setup() {
  const tx = {
    employeeWorkSite: { updateMany: jest.fn(), update: jest.fn() },
    employee: { update: jest.fn() },
  };
  const prisma = {
    employee: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: EMPLOYEE_ID, locationId: HEAD_OFFICE }),
      update: jest.fn(),
    },
    location: { findFirst: jest.fn().mockResolvedValue({ id: WAREHOUSE }) },
    employeeWorkSite: {
      findFirst: jest.fn().mockResolvedValue({ id: 'assignment-2' }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const workSites = {
    assignWorkSite: jest.fn(),
    removeWorkSite: jest.fn(),
    resolveAuthorizedWorkSites: jest.fn().mockResolvedValue([]),
  };
  const auditService = { log: jest.fn() };

  const service = new AttendanceOperationsService(
    prisma as unknown as Constructor[0],
    workSites as unknown as Constructor[1],
    {} as Constructor[2],
    auditService as unknown as Constructor[3],
  );

  return { service, prisma, tx, workSites, auditService };
}

describe('AttendanceOperationsService.assignWorkSite', () => {
  it('leaves the primary flag untouched when the request omits it', async () => {
    const { service, workSites, tx } = setup();

    await service.assignWorkSite(user, EMPLOYEE_ID, {
      locationId: HEAD_OFFICE,
      validFrom: '2026-02-01',
    });

    const [firstCall] = workSites.assignWorkSite.mock.calls as unknown[][];
    const options = firstCall?.[3] as {
      isPrimary?: boolean;
      tx?: unknown;
    };
    expect(options.isPrimary).toBeUndefined();
    expect(options.tx).toBe(tx);
    expect(tx.employee.update).not.toHaveBeenCalled();
  });

  it('moves Employee.locationId in the same transaction when assigning as primary', async () => {
    const { service, workSites, tx, prisma } = setup();

    await service.assignWorkSite(user, EMPLOYEE_ID, {
      locationId: WAREHOUSE,
      isPrimary: true,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [firstCall] = workSites.assignWorkSite.mock.calls as unknown[][];
    expect(firstCall?.[3]).toMatchObject({
      isPrimary: true,
      tx,
    });
    expect(tx.employee.update).toHaveBeenCalledWith({
      where: { id: EMPLOYEE_ID },
      data: { locationId: WAREHOUSE, updatedById: 'user-1' },
    });
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });
});

describe('AttendanceOperationsService.setPrimaryWorkSite', () => {
  it('writes both work-site rows and the employee inside one transaction', async () => {
    const { service, prisma, tx } = setup();

    await service.setPrimaryWorkSite(user, EMPLOYEE_ID, WAREHOUSE);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.employeeWorkSite.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', employeeId: EMPLOYEE_ID, isPrimary: true },
      data: { isPrimary: false },
    });
    expect(tx.employeeWorkSite.update).toHaveBeenCalledWith({
      where: { id: 'assignment-2' },
      data: { isPrimary: true, updatedById: 'user-1' },
    });
    expect(tx.employee.update).toHaveBeenCalledWith({
      where: { id: EMPLOYEE_ID },
      data: { locationId: WAREHOUSE, updatedById: 'user-1' },
    });
    // Nothing is written outside the transaction client.
    expect(prisma.employeeWorkSite.updateMany).not.toHaveBeenCalled();
    expect(prisma.employeeWorkSite.update).not.toHaveBeenCalled();
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('fails the whole change when the transaction fails', async () => {
    const { service, prisma, tx, auditService } = setup();
    tx.employee.update.mockRejectedValueOnce(new Error('write failed'));

    await expect(
      service.setPrimaryWorkSite(user, EMPLOYEE_ID, WAREHOUSE),
    ).rejects.toThrow('write failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('changes nothing when the site is not an active assignment', async () => {
    const { service, prisma, tx } = setup();
    prisma.employeeWorkSite.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.setPrimaryWorkSite(user, EMPLOYEE_ID, WAREHOUSE),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.employee.update).not.toHaveBeenCalled();
  });

  it('scopes the assignment lookup to the caller tenant', async () => {
    const { service, prisma } = setup();

    await service.setPrimaryWorkSite(user, EMPLOYEE_ID, WAREHOUSE);

    expect(prisma.employeeWorkSite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1' }),
      }),
    );
  });
});
