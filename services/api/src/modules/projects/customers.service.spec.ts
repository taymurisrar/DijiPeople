import { NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AppError } from '../../common/errors/app-error';
import { CustomersService } from './customers.service';

/*
 * BUG-2007 - customers can now be deleted, tenant-scoped and refused with a
 * reasoned error when the customer still has projects tied to it, rather than
 * failing as a raw Postgres foreign-key violation.
 */
describe('CustomersService.remove', () => {
  const prisma = {
    customer: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    project: {
      count: jest.fn(),
    },
  };
  const auditService = { log: jest.fn() };
  let service: CustomersService;
  const user: AuthenticatedUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    roleIds: ['role-1'],
    roleKeys: ['hr'],
    permissionKeys: ['customers.delete'],
    rolePrivileges: [],
  } as unknown as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomersService(prisma as never, auditService as never);
  });

  it('refuses when the customer was not found for this tenant', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(service.remove(user, 'customer-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.project.count).not.toHaveBeenCalled();
    expect(prisma.customer.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses with a reasoned error when the customer still has projects, instead of a raw FK failure', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'customer-1' });
    prisma.project.count.mockResolvedValue(3);

    const error: unknown = await service
      .remove(user, 'customer-1')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).errorCode).toBe(
      'CUSTOMER_DELETE_HAS_DEPENDENTS',
    );
    expect(prisma.customer.deleteMany).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('deletes and audits when no project depends on the customer', async () => {
    const existing = { id: 'customer-1', name: 'Acme' };
    prisma.customer.findFirst.mockResolvedValue(existing);
    prisma.project.count.mockResolvedValue(0);
    prisma.customer.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.remove(user, 'customer-1');

    expect(result).toEqual({ success: true });
    expect(prisma.customer.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: user.tenantId, id: 'customer-1' },
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: user.tenantId,
        action: 'CUSTOMER_DELETED',
        entityType: 'Customer',
        entityId: 'customer-1',
        beforeSnapshot: existing,
        afterSnapshot: null,
      }),
    );
  });
});
