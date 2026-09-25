import { PlatformRuntimeService } from './platform-runtime.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/**
 * A record the runtime can list must be a record the runtime can open.
 *
 * BUG-3565 (TASK-0032): contract templates and signature requests had list
 * cases but no `get` case, so `GET /platform-runtime/<module>/<id>` fell through
 * to `findGeneric`, whose fallback only knows plans, subscriptions and payments,
 * and 404'd for an id taken from the module's own list.
 *
 * The assertion is deliberately not "these two modules open": it drives `get`
 * for the two modules against services that would answer, and proves the
 * dispatcher reached them rather than the generic fallback.
 */

function superAdmin(): AuthenticatedUser {
  return {
    userId: 'platform-super-admin',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
    rolePrivileges: [],
    platform: {
      id: 'p1',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      permissionKeys: ['platform.*'],
    },
  } as unknown as AuthenticatedUser;
}

function buildService() {
  const reached: string[] = [];
  const contracts = {
    getTemplate: (_u: unknown, id: string) => {
      reached.push(`template:${id}`);
      return Promise.resolve({ id, key: 'PARTNER_AGREEMENT' });
    },
    getSignatureRequest: (_u: unknown, id: string) => {
      reached.push(`signature-request:${id}`);
      return Promise.resolve({ id, recipients: [] });
    },
  };

  const service = new PlatformRuntimeService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    contracts as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, reached };
}

describe('platform runtime — a listable record can be opened (BUG-3565)', () => {
  it.each([
    ['contract-templates', 'template:tpl-1'],
    ['signature-requests', 'signature-request:tpl-1'],
  ])('opens %s through its own reader', async (moduleKey, expected) => {
    const { service, reached } = buildService();

    const result = await service.get(superAdmin(), moduleKey, 'tpl-1');

    expect(reached).toEqual([expected]);
    expect(result).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({ id: 'tpl-1' }) as unknown,
      }),
    );
  });
});
