import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PlatformUserRole, PlatformUserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformUsersService } from './platform-users.service';

/**
 * Changing a platform password.
 *
 * These accounts read across every tenant in the product, so the checks that
 * matter are: the current password is genuinely re-verified, the change cannot
 * be aimed at another account, and the sessions created with the old credential
 * do not outlive it.
 */
describe('PlatformUsersService.changeOwnPassword', () => {
  const CURRENT = 'Current-Password-1';
  const NEXT = 'A-Much-Better-1-Password';

  const actor = {
    userId: 'platform-user-1',
    tenantId: 'platform',
    sessionId: 'session-current',
    platform: {
      id: 'platform-user-1',
      role: PlatformUserRole.PLATFORM_OWNER,
      status: PlatformUserStatus.ACTIVE,
    },
  } as unknown as AuthenticatedUser;

  async function build(overrides: Record<string, unknown> = {}) {
    const passwordHash = await bcrypt.hash(CURRENT, 10);
    const update = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const auditCreate = jest.fn().mockResolvedValue({});

    const prisma = {
      platformUser: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'platform-user-1',
          email: 'ops@dijipeople.com',
          passwordHash,
          role: PlatformUserRole.PLATFORM_OWNER,
        }),
        update,
      },
      platformRefreshToken: { updateMany },
      platformAuditLog: { create: auditCreate },
      $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({
          platformUser: { update },
          platformRefreshToken: { updateMany },
        }),
      ),
      ...overrides,
    };

    return {
      service: new PlatformUsersService(prisma as never),
      prisma,
      update,
      updateMany,
      auditCreate,
    };
  }

  it('rejects a wrong current password and changes nothing', async () => {
    const { service, update, auditCreate } = await build();

    await expect(
      service.changeOwnPassword(actor, {
        currentPassword: 'not-the-password',
        newPassword: NEXT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(update).not.toHaveBeenCalled();
    /* The failed attempt is still recorded — see the service comment. */
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PLATFORM_USER_PASSWORD_CHANGE_FAILED',
        }),
      }),
    );
  });

  it('refuses to set the same password again', async () => {
    const { service, update } = await build();

    await expect(
      service.changeOwnPassword(actor, {
        currentPassword: CURRENT,
        newPassword: CURRENT,
      }),
    ).rejects.toThrow(/different/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('stores a hash, never the password', async () => {
    const { service, update } = await build();

    await service.changeOwnPassword(actor, {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });

    const written = update.mock.calls[0][0].data.passwordHash as string;
    expect(written).not.toBe(NEXT);
    expect(written).toMatch(/^\$2[aby]\$/);
    await expect(bcrypt.compare(NEXT, written)).resolves.toBe(true);
  });

  it('revokes other sessions in the same transaction, keeping the current one', async () => {
    /*
     * Revoking afterwards would leave a window where the old credential is gone
     * but the sessions it created still work. Keeping the current session is
     * what stops the change signing the person out of the page they are on.
     */
    const { service, updateMany, prisma } = await build();

    const result = await service.changeOwnPassword(actor, {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        platformUserId: 'platform-user-1',
        revokedAt: null,
        NOT: { sessionId: 'session-current' },
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.revokedSessions).toBe(2);
  });

  it('leaves other sessions alone when the operator opts out', async () => {
    const { service, updateMany } = await build();

    const result = await service.changeOwnPassword(actor, {
      currentPassword: CURRENT,
      newPassword: NEXT,
      signOutOtherSessions: false,
    });

    expect(updateMany).not.toHaveBeenCalled();
    expect(result.revokedSessions).toBe(0);
  });

  it('records the change without any password material', async () => {
    const { service, auditCreate } = await build();

    await service.changeOwnPassword(actor, {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });

    const entry = auditCreate.mock.calls.at(-1)![0] as {
      data: { action: string; afterSnapshot: Record<string, unknown> };
    };
    expect(entry.data.action).toBe('PLATFORM_USER_PASSWORD_CHANGED');
    const serialised = JSON.stringify(entry.data);
    expect(serialised).not.toContain(CURRENT);
    expect(serialised).not.toContain(NEXT);
  });

  it('refuses a caller that is not an active platform user', async () => {
    const { service } = await build();

    await expect(
      service.changeOwnPassword(
        { ...actor, platform: undefined } as unknown as AuthenticatedUser,
        { currentPassword: CURRENT, newPassword: NEXT },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('always acts on the actor, so it cannot be aimed at another account', async () => {
    /*
     * The write is addressed by the id on the verified session, never by
     * anything in the request. There is no target-user parameter at all, and
     * adding one would make this an account-takeover route.
     */
    const { service, update } = await build();
    await service.changeOwnPassword(actor, {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'platform-user-1' } }),
    );
  });
});
