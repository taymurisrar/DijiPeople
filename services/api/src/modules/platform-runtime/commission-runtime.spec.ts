import { BadRequestException } from '@nestjs/common';
import { PlatformRuntimeService } from './platform-runtime.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/*
 * ADR-0026 D3 (EXECPLAN-0055 WP-06). The runtime half of the commission
 * ledger: a create names its partner in the values and is handed to the
 * partner service with everything else validated by the commission DTO, and
 * the header status path refuses — status moves only through the actions.
 */

function owner(): AuthenticatedUser {
  return {
    userId: 'platform-owner',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
    rolePrivileges: [],
    platform: {
      id: 'p1',
      role: 'PLATFORM_OWNER',
      permissionKeys: ['platform.*'],
    },
  } as unknown as AuthenticatedUser;
}

function buildService() {
  const partners = {
    createCommission: jest.fn(async (partnerId: string, dto: unknown) => ({
      id: 'com-1',
      partnerId,
      dto,
    })),
    commissionAction: jest.fn(async (id: string) => ({ id })),
  };
  const service = new PlatformRuntimeService(
    {} as never,
    {} as never,
    partners as never,
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
  return { service, partners };
}

const PARTNER_ID = '11111111-1111-4111-8111-111111111111';

describe('commissions through the platform runtime', () => {
  it('creates against the partner named in the values', async () => {
    const { service, partners } = buildService();

    await service.create(owner(), 'commissions', {
      values: {
        partnerId: PARTNER_ID,
        baseAmount: '1000',
        commissionRate: '12.5',
      },
    });

    expect(partners.createCommission).toHaveBeenCalledWith(
      PARTNER_ID,
      expect.objectContaining({ baseAmount: 1000, commissionRate: 12.5 }),
      'platform-owner',
    );
  });

  it('refuses a create with no partner', async () => {
    const { service, partners } = buildService();
    await expect(
      service.create(owner(), 'commissions', { values: { baseAmount: 10 } }),
    ).rejects.toThrow('Choose the partner this commission is for.');
    expect(partners.createCommission).not.toHaveBeenCalled();
  });

  it('refuses a computed amount or a status in the create values', async () => {
    const { service, partners } = buildService();
    await expect(
      service.create(owner(), 'commissions', {
        values: {
          partnerId: PARTNER_ID,
          baseAmount: 10,
          commissionAmount: 999,
          status: 'PAID',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(partners.createCommission).not.toHaveBeenCalled();
  });

  it('refuses a header status change: actions are the only path', async () => {
    const { service, partners } = buildService();
    await expect(
      service.execute(
        owner(),
        'commissions',
        'change-status',
        { status: 'PAID' },
        'com-1',
      ),
    ).rejects.toMatchObject({
      errorCode: 'PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED',
    });
    expect(partners.commissionAction).not.toHaveBeenCalled();
  });

  it('dispatches an action with its reason', async () => {
    const { service, partners } = buildService();
    await service.execute(
      owner(),
      'commissions',
      'void-commission',
      { reason: 'Duplicate entry' },
      'com-1',
    );
    expect(partners.commissionAction).toHaveBeenCalledWith(
      'com-1',
      'void-commission',
      'platform-owner',
      'Duplicate entry',
    );
  });
});
