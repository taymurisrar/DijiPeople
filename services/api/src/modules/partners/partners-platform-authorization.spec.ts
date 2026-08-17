import { PlatformUserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { platformAccessForRole } from '../platform-auth/platform-permissions';
import { PartnersService } from './partners.service';

function platformUser(role: PlatformUserRole): AuthenticatedUser {
  const access = platformAccessForRole(role);
  return {
    userId: 'platform-user',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: access.roleKeys,
    permissionKeys: access.permissionKeys,
    platform: { id: 'platform-user', role },
  };
}

describe('PartnersService platform authorization', () => {
  function service() {
    return new PartnersService({} as never);
  }

  it('denies a platform MEMBER despite its system-customizer alias', async () => {
    const instance = service();
    const list = jest.spyOn(instance, 'list').mockResolvedValue({} as never);
    expect(() =>
      instance.listForUser(platformUser(PlatformUserRole.MEMBER), {} as never),
    ).toThrow('Partner read access is required.');
    expect(list).not.toHaveBeenCalled();
  });

  it('allows PARTNER_MANAGER to read and manage', async () => {
    const instance = service();
    const list = jest.spyOn(instance, 'list').mockResolvedValue({} as never);
    const create = jest
      .spyOn(instance, 'create')
      .mockResolvedValue({} as never);
    const user = platformUser(PlatformUserRole.PARTNER_MANAGER);

    await instance.listForUser(user, {} as never);
    await instance.createForUser(user, {} as never);

    expect(list).toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
  });

  it('allows PRESALES to read but denies management', async () => {
    const instance = service();
    jest.spyOn(instance, 'list').mockResolvedValue({} as never);
    const create = jest
      .spyOn(instance, 'create')
      .mockResolvedValue({} as never);
    const user = platformUser(PlatformUserRole.PRESALES_USER);

    await instance.listForUser(user, {} as never);
    expect(() => instance.createForUser(user, {} as never)).toThrow(
      'Partner management access is required.',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('denies a tenant JWT even when it carries partners.read', () => {
    const instance = service();
    expect(() =>
      instance.listForUser(
        {
          userId: 'tenant-user',
          tenantId: 'tenant-a',
          roleIds: [],
          roleKeys: ['system-admin'],
          permissionKeys: ['partners.read', 'partners.manage'],
        },
        {} as never,
      ),
    ).toThrow('Platform access is required.');
  });
});
