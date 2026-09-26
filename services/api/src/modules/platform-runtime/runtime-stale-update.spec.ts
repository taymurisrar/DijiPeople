import { ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  PlatformRuntimeService,
  recordVersion,
} from './platform-runtime.service';

/*
 * ITEM-0201. The record page sent a `version` with every update and nothing
 * compared it, so two operators editing the same record silently overwrote
 * each other. The version is now the record's `updatedAt`, and an update from
 * a stale copy is refused with 409 before the owning service writes anything.
 */
function superAdmin(): AuthenticatedUser {
  return {
    userId: 'platform-super-admin',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
    rolePrivileges: [],
    platform: { id: 'p1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
  } as unknown as AuthenticatedUser;
}

const stored = new Date('2026-09-26T10:00:00.000Z');

function buildService() {
  const updatePartner = jest.fn(async (id: string) => ({
    id,
    updatedAt: new Date('2026-09-26T10:05:00.000Z'),
  }));
  const prisma = {
    partner: {
      findUnique: jest.fn(async () => ({ updatedAt: stored })),
    },
  };
  const service = new PlatformRuntimeService(
    prisma as never,
    {} as never,
    { update: updatePartner } as never,
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
  return { service, updatePartner };
}

describe('runtime updates refuse a stale copy', () => {
  it('rejects an update whose version is older than the stored record, writing nothing', async () => {
    const { service, updatePartner } = buildService();

    await expect(
      service.update(superAdmin(), 'partners', 'partner-1', {
        values: { displayName: 'Renamed' },
        version: stored.getTime() - 60_000,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updatePartner).not.toHaveBeenCalled();
  });

  it('applies an update made from the current copy and returns the new version', async () => {
    const { service, updatePartner } = buildService();

    const result = await service.update(superAdmin(), 'partners', 'partner-1', {
      values: { displayName: 'Renamed' },
      version: stored.getTime(),
    });

    expect(updatePartner).toHaveBeenCalledTimes(1);
    expect(result.version).toBe(new Date('2026-09-26T10:05:00.000Z').getTime());
  });

  it('does not check an update that carries no version', async () => {
    const { service, updatePartner } = buildService();

    await service.update(superAdmin(), 'partners', 'partner-1', {
      values: { displayName: 'Renamed' },
    });

    expect(updatePartner).toHaveBeenCalledTimes(1);
  });

  it('reads the version from updatedAt, falling back to a numeric version', () => {
    expect(recordVersion({ updatedAt: stored })).toBe(stored.getTime());
    expect(recordVersion({ updatedAt: stored.toISOString() })).toBe(
      stored.getTime(),
    );
    expect(recordVersion({ version: 3 })).toBe(3);
    expect(recordVersion(null)).toBeUndefined();
  });
});
