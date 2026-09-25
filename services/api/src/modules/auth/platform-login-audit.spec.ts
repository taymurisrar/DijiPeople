import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { PlatformLoginLockoutService } from './platform-login-lockout.service';

/**
 * Platform sign-in was never audited: tenant sign-ins go through
 * `logTenantAuthEvent`, while `adminLogin` wrote nothing, so the platform
 * audit log had no source for operator sign-ins or failed attempts. Every
 * outcome now writes an `AUTH_LOGIN_*` row with `tenantId: 'platform'` (routed
 * to PlatformAuditLog) in the tenant snapshot shape, and no row ever carries
 * the attempted password.
 */
describe('platform sign-in audit', () => {
  const PASSWORD = 'Correct-Horse-9!';
  const WRONG = 'Wrong-Password-1!';
  let row: Record<string, unknown>;
  let audit: { log: jest.Mock };
  let service: AuthService;

  const request = {
    headers: {
      'x-dijipeople-app': 'admin',
      'x-forwarded-for': '203.0.113.9',
      'user-agent': 'Mozilla/5.0 test',
    },
  } as unknown as Request;

  beforeEach(async () => {
    row = {
      id: 'operator-1',
      email: 'ops@dijipeople.test',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      firstName: 'Olu',
      lastName: 'Ops',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      lockedUntil: null,
      mfaEnabled: false,
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      platformUser: {
        findUnique: jest.fn(({ where }: { where: { email?: string } }) =>
          Promise.resolve(where.email === row.email ? { ...row } : null),
        ),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          const attempts = data.failedLoginAttempts;
          if (attempts && typeof attempts === 'object') {
            row.failedLoginAttempts =
              (row.failedLoginAttempts as number) +
              (attempts as { increment: number }).increment;
          } else if (typeof attempts === 'number') {
            row.failedLoginAttempts = attempts;
          }
          if ('lockedUntil' in data) row.lockedUntil = data.lockedUntil;
          return Promise.resolve({ ...row });
        }),
      },
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
      {} as never,
    );
  });

  const signIn = (email: string, password: string) =>
    service.adminLogin({ email, password }, request);

  const refused = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as UnauthorizedException;
    }
    throw new Error('expected a refusal');
  };

  const payloads = () =>
    audit.log.mock.calls.map(
      ([payload]) =>
        payload as {
          tenantId: string;
          actorUserId: string | null;
          action: string;
          entityId: string;
          afterSnapshot: Record<string, unknown>;
        },
    );

  it('audits a successful sign-in with the operator as actor and mfaResult NOT_REQUIRED', async () => {
    await signIn('ops@dijipeople.test', PASSWORD);

    expect(payloads()).toEqual([
      expect.objectContaining({
        tenantId: 'platform',
        actorUserId: 'operator-1',
        action: 'AUTH_LOGIN_SUCCEEDED',
        entityId: 'operator-1',
        afterSnapshot: expect.objectContaining({
          email: 'ops@dijipeople.test',
          result: 'SUCCESS',
          appClientId: 'admin',
          ipAddress: '203.0.113.9',
          userAgent: 'Mozilla/5.0 test',
          mfaResult: 'NOT_REQUIRED',
          sessionId: expect.any(String) as unknown,
        }) as unknown,
      }),
    ]);
  });

  it('audits a wrong password against the operator', async () => {
    await refused(signIn('ops@dijipeople.test', WRONG));

    expect(payloads()).toEqual([
      expect.objectContaining({
        tenantId: 'platform',
        actorUserId: 'operator-1',
        action: 'AUTH_LOGIN_FAILED',
        afterSnapshot: expect.objectContaining({
          result: 'FAILED',
          failureReason: 'PASSWORD_MISMATCH',
        }) as unknown,
      }),
    ]);
  });

  it('audits an unknown address with no actor', async () => {
    await refused(signIn('nobody@dijipeople.test', WRONG));

    expect(payloads()).toEqual([
      expect.objectContaining({
        tenantId: 'platform',
        actorUserId: null,
        action: 'AUTH_LOGIN_FAILED',
        entityId: 'nobody@dijipeople.test',
        afterSnapshot: expect.objectContaining({
          failureReason: 'USER_NOT_FOUND',
        }) as unknown,
      }),
    ]);
  });

  it('audits a locked account and keeps the one response for every failure', async () => {
    const unknown = await refused(signIn('nobody@dijipeople.test', PASSWORD));
    const wrong = await refused(signIn('ops@dijipeople.test', WRONG));
    row.lockedUntil = new Date(Date.now() + 60_000);
    const locked = await refused(signIn('ops@dijipeople.test', PASSWORD));

    expect(unknown.getResponse()).toEqual(wrong.getResponse());
    expect(wrong.getResponse()).toEqual(locked.getResponse());
    expect(payloads().at(-1)).toEqual(
      expect.objectContaining({
        afterSnapshot: expect.objectContaining({
          failureReason: 'ACCOUNT_LOCKED',
        }) as unknown,
      }),
    );
  });

  it('never writes an attempted password', async () => {
    await refused(signIn('ops@dijipeople.test', WRONG));
    await refused(signIn('nobody@dijipeople.test', WRONG));
    await signIn('ops@dijipeople.test', PASSWORD);

    const written = JSON.stringify(audit.log.mock.calls);
    expect(written).not.toContain(WRONG);
    expect(written).not.toContain(PASSWORD);
  });
});
