import { PlatformRuntimeService } from './platform-runtime.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/*
 * ADR-0026 D1 / EXECPLAN-0055 WP-04 — the runtime's partner write path.
 *
 * The record header's status control called `changeStatus`, which spread the
 * whole GET record into UpdatePartnerDto: every attempt failed whitelist
 * validation with "Review the highlighted fields", and had one passed it would
 * have bypassed every lifecycle guard. Runtime create and update also passed
 * no actor, so PARTNER_CREATED/PARTNER_UPDATED were audited anonymously on the
 * main admin path (BUG-3551 context).
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

const PARTNER = {
  id: 'partner-1',
  code: 'PTR-1',
  status: 'UNDER_REVIEW',
  accountStatus: 'NOT_PROVISIONED',
  notes: null,
  timeline: [],
};

function buildService() {
  const partners = {
    get: jest.fn(() => Promise.resolve(PARTNER)),
    create: jest.fn((dto: unknown) => Promise.resolve({ id: 'new', dto })),
    update: jest.fn((id: string) => Promise.resolve({ id })),
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

const VALID = {
  type: 'COMPANY',
  displayName: 'Acme Partners',
  companyName: 'Acme Partners Ltd',
  email: 'partner@example.com',
  defaultCommissionRate: 10,
};

describe('runtime partner status', () => {
  it.each([
    ['the change-status action', 'execute'],
    ['the process bar', 'updateProcess'],
  ])(
    'refuses a header status change through %s with the domain reason',
    async (_label, path) => {
      const { service, partners } = buildService();
      const call =
        path === 'execute'
          ? service.execute(
              owner(),
              'partners',
              'change-status',
              { status: 'ACTIVE' },
              'partner-1',
            )
          : service.updateProcess(owner(), 'partners', 'partner-1', {
              stage: 'ACTIVE',
            });
      await expect(call).rejects.toMatchObject({
        errorCode: 'PARTNER_STATUS_ACTION_REQUIRED',
      });
      await expect(call).rejects.toThrow(/lifecycle actions/);
      expect(partners.update).not.toHaveBeenCalled();
    },
  );

  it('refuses a status change sent on a runtime save, without writing', async () => {
    const { service, partners } = buildService();
    await expect(
      service.update(owner(), 'partners', 'partner-1', {
        values: { displayName: 'Renamed', status: 'ACTIVE' },
      }),
    ).rejects.toMatchObject({ errorCode: 'PARTNER_STATUS_ACTION_REQUIRED' });
    expect(partners.update).not.toHaveBeenCalled();
  });

  it('drops an unchanged status an older form resends, and saves the rest', async () => {
    const { service, partners } = buildService();
    await service.update(owner(), 'partners', 'partner-1', {
      values: { displayName: 'Renamed', status: 'UNDER_REVIEW' },
    });
    const [id, sent, actor] = partners.update.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      string,
    ];
    expect([id, actor]).toEqual(['partner-1', 'platform-owner']);
    expect(sent).toMatchObject({ displayName: 'Renamed' });
    expect(sent).not.toHaveProperty('status');
  });

  it('passes the platform actor to partner create and update', async () => {
    const { service, partners } = buildService();
    await service.create(owner(), 'partners', { values: VALID });
    expect(partners.create).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Acme Partners' }),
      'platform-owner',
    );
    await service.update(owner(), 'partners', 'partner-1', {
      values: { notes: 'Called back' },
    });
    expect(partners.update).toHaveBeenCalledWith(
      'partner-1',
      expect.objectContaining({ notes: 'Called back' }),
      'platform-owner',
    );
  });

  it('refuses status on a runtime create (the DTO no longer declares it)', async () => {
    const { service, partners } = buildService();
    await expect(
      service.create(owner(), 'partners', {
        values: { ...VALID, status: 'ACTIVE' },
      }),
    ).rejects.toThrow();
    expect(partners.create).not.toHaveBeenCalled();
  });
});
