import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformUsersService } from './platform-users.service';

/*
 * ADR-0019 — a platform operator's MFA can be reset only by someone who may
 * manage platform users. The decision is `assertCanManage`, the same check as
 * create/edit/disable; this pins that the reset route goes through it before
 * the MFA service is ever called.
 */
describe('PlatformUsersService.resetUserMfa', () => {
  const operator = (role: string): AuthenticatedUser =>
    ({
      userId: 'actor-1',
      tenantId: 'platform',
      email: 'actor@dijipeople.test',
      roleIds: [],
      roleKeys: [],
      permissionKeys: [],
      platform: { id: 'actor-1', role, status: 'ACTIVE' },
    }) as unknown as AuthenticatedUser;

  function build() {
    const mfa = {
      adminResetPlatformUser: jest
        .fn()
        .mockResolvedValue({ userId: 'target-1', mfaEnabled: false }),
    };
    return {
      mfa,
      service: new PlatformUsersService({} as never, mfa as never),
    };
  }

  it('refuses an operator who cannot manage platform users', async () => {
    const { mfa, service } = build();

    await expect(
      service.resetUserMfa(operator('MEMBER'), 'target-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mfa.adminResetPlatformUser).not.toHaveBeenCalled();
  });

  it('refuses a tenant user outright', async () => {
    const { mfa, service } = build();
    const tenantUser = {
      userId: 'u',
      tenantId: 'tenant-a',
      roleKeys: ['global-admin'],
    } as unknown as AuthenticatedUser;

    await expect(
      service.resetUserMfa(tenantUser, 'target-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mfa.adminResetPlatformUser).not.toHaveBeenCalled();
  });

  it('delegates for a platform super admin, with the actor from the token', async () => {
    const { mfa, service } = build();

    await service.resetUserMfa(operator('SUPER_ADMIN'), 'target-1');

    expect(mfa.adminResetPlatformUser).toHaveBeenCalledWith(
      'actor-1',
      'target-1',
    );
  });
});
