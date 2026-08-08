import { LoginLockoutService } from './login-lockout.service';

/*
 * Sign-in previously accepted unlimited password guesses. These pin the
 * threshold, the expiry, and the two properties that make the lock useful:
 * it cannot be dodged, and it cannot be made useless by configuration.
 */

function buildService(
  security: Record<string, unknown> | Error = {
    failedAttemptsBeforeLock: 3,
    lockDurationMinutes: 15,
  },
) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = { user: { update } };
  const resolver = {
    getSecuritySettings: jest.fn(() =>
      security instanceof Error
        ? Promise.reject(security)
        : Promise.resolve(security),
    ),
  };

  return {
    service: new LoginLockoutService(prisma as never, resolver as never),
    update,
  };
}

describe('login lockout', () => {
  it('counts failures without locking below the threshold', async () => {
    const { service, update } = buildService();

    const result = await service.registerFailure({
      id: 'user-1',
      tenantId: 'tenant-1',
      failedLoginAttempts: 1,
    });

    expect(result).toEqual({ locked: false, attempts: 2 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginAttempts: 2 }),
      }),
    );
  });

  it('locks the account once the tenant threshold is reached', async () => {
    const { service, update } = buildService();

    const result = await service.registerFailure({
      id: 'user-1',
      tenantId: 'tenant-1',
      failedLoginAttempts: 2,
    });

    expect(result.locked).toBe(true);
    const data = update.mock.calls[0][0].data as {
      lockedUntil: Date;
      failedLoginAttempts: number;
    };
    expect(data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    // The counter resets with the lock, so expiry does not re-lock instantly.
    expect(data.failedLoginAttempts).toBe(0);
  });

  it('treats an account as locked only while the lock is in the future', () => {
    const { service } = buildService();

    expect(
      service.isLocked({ lockedUntil: new Date(Date.now() + 60_000) }),
    ).toBe(true);
    expect(
      service.isLocked({ lockedUntil: new Date(Date.now() - 60_000) }),
    ).toBe(false);
    expect(service.isLocked({ lockedUntil: null })).toBe(false);
  });

  it('clears the counter after a correct password', async () => {
    const { service, update } = buildService();

    await service.registerSuccess({
      id: 'user-1',
      failedLoginAttempts: 2,
      lockedUntil: null,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { failedLoginAttempts: 0, lockedUntil: null },
      }),
    );
  });

  it('does not write when there is nothing to clear', async () => {
    const { service, update } = buildService();

    await service.registerSuccess({
      id: 'user-1',
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('cannot be disabled by configuring a threshold of zero', async () => {
    const { service } = buildService({
      failedAttemptsBeforeLock: 0,
      lockDurationMinutes: 0,
    });

    // Clamped to one attempt, so the very first failure locks rather than
    // the lock never engaging at all.
    const result = await service.registerFailure({
      id: 'user-1',
      tenantId: 'tenant-1',
      failedLoginAttempts: 0,
    });

    expect(result.locked).toBe(true);
  });

  it('still locks when the tenant settings cannot be read', async () => {
    const { service } = buildService(new Error('settings unavailable'));

    const result = await service.registerFailure({
      id: 'user-1',
      tenantId: 'tenant-1',
      failedLoginAttempts: 4,
    });

    expect(result.locked).toBe(true);
  });

  it('never throws when the counter cannot be written', async () => {
    const prisma = {
      user: { update: jest.fn().mockRejectedValue(new Error('db down')) },
    };
    const resolver = {
      getSecuritySettings: jest.fn().mockResolvedValue({
        failedAttemptsBeforeLock: 3,
        lockDurationMinutes: 15,
      }),
    };
    const service = new LoginLockoutService(prisma as never, resolver as never);

    await expect(
      service.registerFailure({
        id: 'user-1',
        tenantId: 'tenant-1',
        failedLoginAttempts: 1,
      }),
    ).resolves.toEqual({ locked: false, attempts: 0 });
  });
});
