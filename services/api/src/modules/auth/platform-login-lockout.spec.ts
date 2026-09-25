import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import {
  PLATFORM_LOCKOUT_ATTEMPTS,
  PlatformLoginLockoutService,
} from './platform-login-lockout.service';

/**
 * BUG-3146 — platform sign-in had no account lockout of any kind.
 *
 * Driven through `AuthService.adminLogin`, not the lockout service alone: the
 * defect was that the sign-in path never called any lockout, so a spec of the
 * service in isolation would have passed against the broken code.
 */
describe('platform sign-in lockout (BUG-3146)', () => {
  const PASSWORD = 'Correct-Horse-9!';
  let row: {
    id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: 'SUPER_ADMIN';
    status: 'ACTIVE';
    failedLoginAttempts: number;
    lockedUntil: Date | null;
    mfaEnabled: boolean;
  };
  let audit: { log: jest.Mock };
  let service: AuthService;

  beforeAll(async () => {
    row = {
      id: 'platform-user-1',
      email: 'owner@dijipeople.test',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      firstName: 'Pat',
      lastName: 'Owner',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      lockedUntil: null,
      mfaEnabled: false,
    };
  });

  beforeEach(() => {
    row.failedLoginAttempts = 0;
    row.lockedUntil = null;
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const platformUser = {
      findUnique: jest.fn(({ where }: { where: { email?: string } }) =>
        Promise.resolve(where.email === row.email ? { ...row } : null),
      ),
      update: jest.fn(
        ({
          data,
        }: {
          data: {
            failedLoginAttempts?: number | { increment: number };
            lockedUntil?: Date | null;
          };
        }) => {
          const attempts = data.failedLoginAttempts;
          if (typeof attempts === 'object') {
            row.failedLoginAttempts += attempts.increment;
          } else if (typeof attempts === 'number') {
            row.failedLoginAttempts = attempts;
          }
          if (data.lockedUntil !== undefined)
            row.lockedUntil = data.lockedUntil;
          return Promise.resolve({ ...row });
        },
      ),
    };
    const prisma = {
      platformUser,
      platformRefreshToken: { create: jest.fn().mockResolvedValue({}) },
    };

    service = new AuthService(
      prisma as never,
      new JwtService({}),
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new PlatformLoginLockoutService(prisma as never),
    );
  });

  const attempt = (password: string, email = row.email) =>
    service.adminLogin({ email, password, rememberMe: false });

  const errorOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as UnauthorizedException;
    }
    throw new Error('expected the sign-in to be refused');
  };

  it(`locks the account after ${PLATFORM_LOCKOUT_ATTEMPTS} wrong passwords`, async () => {
    for (let index = 0; index < PLATFORM_LOCKOUT_ATTEMPTS; index += 1) {
      await errorOf(attempt('wrong-password'));
    }

    expect(row.lockedUntil).not.toBeNull();
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(row.failedLoginAttempts).toBe(0);
  });

  it('refuses the correct password while locked', async () => {
    row.lockedUntil = new Date(Date.now() + 60_000);

    const error = await errorOf(attempt(PASSWORD));

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'AUTH_LOGIN_FAILED',
        afterSnapshot: expect.objectContaining({
          failureReason: 'ACCOUNT_LOCKED',
        }) as unknown,
      }),
    );
  });

  it('gives a locked account, an unknown address and a wrong password the identical response', async () => {
    const wrongPassword = await errorOf(attempt('wrong-password'));
    const unknown = await errorOf(attempt(PASSWORD, 'nobody@dijipeople.test'));
    row.lockedUntil = new Date(Date.now() + 60_000);
    const locked = await errorOf(attempt(PASSWORD));

    const bodies = [wrongPassword, unknown, locked].map((error) => ({
      status: error.getStatus(),
      body: error.getResponse(),
    }));

    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    expect(bodies[0].body).toEqual(
      expect.objectContaining({ message: 'Invalid admin credentials.' }),
    );
  });

  it('signs in once the lock has expired, and clears the counter', async () => {
    row.lockedUntil = new Date(Date.now() - 1000);
    row.failedLoginAttempts = 3;

    const result = await service.adminLogin({
      email: row.email,
      password: PASSWORD,
      rememberMe: false,
    });

    expect('tokens' in result).toBe(true);
    expect(row.failedLoginAttempts).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });
});
