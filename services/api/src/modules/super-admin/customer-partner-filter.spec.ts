import { ValidationPipe } from '@nestjs/common';
import { PlatformUserRole } from '@prisma/client';
import { CustomerQueryDto } from './dto/customer-lifecycle.dto';
import { PlatformLifecycleService } from './platform-lifecycle.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/*
 * TASK-0037 browser pass, P3. The commission form's Customer picker lists only
 * the customers attributed to the commission's partner, through
 * `GET /super-admin/customers?originatingPartnerId=`. The filter narrows; it
 * never widens what a non-admin owner may see, because the owner scope is
 * spread after it.
 */

const PARTNER_ID = '6f1c2a0e-6c55-4a43-9a51-1f4f2b6f9d10';

function actor(role: PlatformUserRole): AuthenticatedUser {
  return {
    userId: 'platform-user-1',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
    rolePrivileges: [],
    platform: { id: 'platform-user-1', role, status: 'ACTIVE' },
  } as unknown as AuthenticatedUser;
}

function buildService() {
  const customerAccount = {
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
  };
  const service = new PlatformLifecycleService(
    { customerAccount } as never,
    { log: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, customerAccount };
}

function query(values: Partial<CustomerQueryDto>): CustomerQueryDto {
  return Object.assign(new CustomerQueryDto(), values);
}

function whereOf(mock: jest.Mock) {
  return (
    mock.mock.calls[0] as unknown as [{ where: Record<string, unknown> }]
  )[0].where;
}

describe('customer list: originatingPartnerId filter', () => {
  it('filters to the partner the customers are attributed to', async () => {
    const { service, customerAccount } = buildService();
    await service.listCustomers(
      actor(PlatformUserRole.SUPER_ADMIN),
      query({ originatingPartnerId: PARTNER_ID }),
    );
    expect(whereOf(customerAccount.findMany)).toMatchObject({
      originatingPartnerId: PARTNER_ID,
    });
    expect(whereOf(customerAccount.count)).toMatchObject({
      originatingPartnerId: PARTNER_ID,
    });
  });

  it('adds no partner condition when none is asked for', async () => {
    const { service, customerAccount } = buildService();
    await service.listCustomers(actor(PlatformUserRole.SUPER_ADMIN), query({}));
    expect(whereOf(customerAccount.findMany)).not.toHaveProperty(
      'originatingPartnerId',
    );
  });

  it('keeps the owner scope for a role below platform admin', async () => {
    const { service, customerAccount } = buildService();
    await service.listCustomers(
      actor(PlatformUserRole.MEMBER),
      query({ originatingPartnerId: PARTNER_ID }),
    );
    expect(whereOf(customerAccount.findMany)).toMatchObject({
      originatingPartnerId: PARTNER_ID,
      assignedToUserId: 'platform-user-1',
    });
  });

  it('accepts a partner id and refuses anything else at validation', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });
    const metadata = { type: 'query' as const, metatype: CustomerQueryDto };
    await expect(
      pipe.transform({ originatingPartnerId: PARTNER_ID }, metadata),
    ).resolves.toMatchObject({ originatingPartnerId: PARTNER_ID });
    await expect(
      pipe.transform({ originatingPartnerId: 'not-a-uuid' }, metadata),
    ).rejects.toBeDefined();
  });
});
