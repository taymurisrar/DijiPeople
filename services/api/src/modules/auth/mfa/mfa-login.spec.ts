import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import { TenantAuthPolicyService } from '../../../common/security/tenant-auth-policy.service';
import { AdminAuthController } from '../admin-auth.controller';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { LoginLockoutService } from '../login-lockout.service';
import { PlatformLoginLockoutService } from '../platform-login-lockout.service';
import { isMfaChallengeResponse } from './mfa-challenge';
import { MfaService } from './mfa.service';
import {
  createMfaTestPrisma,
  tenantUserRow,
  type MfaTestPrisma,
} from './mfa-test-prisma.fixture';
import { TOTP_PERIOD_SECONDS, totpAt } from './totp';

/*
 * ADR-0019 sign-in, end to end through `AuthService` and both controllers,
 * against the in-memory store: a password alone no longer yields a session for
 * an enrolled account, the challenge token is not a session anywhere, the
 * verify step issues one exactly once, and wrong codes lock the account the
 * same way wrong passwords do.
 */

const PASSWORD = 'Correct-Horse-9!';
const STEP_MS = TOTP_PERIOD_SECONDS * 1000;

type Challenge = {
  mfaRequired: true;
  challengeKind: string;
  challengeToken: string;
  methods: readonly string[];
};
type Session = {
  tokens: { accessToken: string; refreshToken: string; sessionId: string };
};

describe('MFA at sign-in (ADR-0019)', () => {
  let prisma: MfaTestPrisma & {
    tenant: { findUnique: jest.Mock };
    tenantSetting: { findMany: jest.Mock };
  };
  let encryption: SecretEncryptionService;
  let mfa: MfaService;
  let auth: AuthService;
  let audit: { log: jest.Mock };
  let jwt: JwtService;
  let passwordHash: string;
  const config = {
    get: (key: string) =>
      key === 'SECRET_ENCRYPTION_KEY' ? 'test-key' : undefined,
  } as unknown as ConfigService;

  const tenantUser = () => prisma.user.rows.find((row) => row.id === 'user-a')!;
  const platformUser = () =>
    prisma.platformUser.rows.find((row) => row.id === 'operator-1')!;

  const request = (clientId: 'web' | 'admin') =>
    ({
      headers: { 'x-dijipeople-app': clientId },
      cookies: {},
    }) as unknown as Request;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    const base = createMfaTestPrisma({
      users: [tenantUserRow({ passwordHash, passwordChangedAt: new Date() })],
      platformUsers: [
        {
          id: 'operator-1',
          email: 'ops@dijipeople.test',
          passwordHash,
          firstName: 'Olu',
          lastName: 'Ops',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          failedLoginAttempts: 0,
          lockedUntil: null,
          mfaEnabled: false,
          mfaSecretEncrypted: null,
          mfaPendingSecretEncrypted: null,
          mfaEnabledAt: null,
          mfaLastUsedStep: null,
        },
      ],
    });
    prisma = Object.assign(base, {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-a',
          slug: 'acme',
          status: 'ACTIVE',
        }),
      },
      tenantSetting: { findMany: jest.fn().mockResolvedValue([]) },
    });
    encryption = new SecretEncryptionService(config);
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    jwt = new JwtService({});
    const tenantSettingsResolver = {
      getSecuritySettings: jest.fn().mockRejectedValue(new Error('none')),
    };
    const loginLockout = new LoginLockoutService(
      prisma as never,
      tenantSettingsResolver as never,
    );
    const platformLockout = new PlatformLoginLockoutService(prisma as never);
    mfa = new MfaService(
      prisma as never,
      encryption,
      audit as never,
      loginLockout,
      platformLockout,
    );

    const withAccess = () => ({
      ...tenantUser(),
      tenant: {
        id: 'tenant-a',
        name: 'Acme',
        slug: 'acme',
        status: 'ACTIVE',
        ownerUserId: 'someone-else',
      },
      userRoles: [],
      teamMemberships: [],
      userPermissions: [],
    });

    auth = new AuthService(
      prisma as never,
      jwt,
      config,
      {} as never,
      {} as never,
      {
        findByTenantIdAndEmail: jest.fn(() =>
          Promise.resolve({ ...withAccess() }),
        ),
        findByIdWithAccess: jest.fn(() => Promise.resolve(withAccess())),
        markLastLogin: jest.fn().mockResolvedValue(undefined),
      } as never,
      { bootstrapTenantRbac: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      { isPasswordExpired: jest.fn().mockResolvedValue(false) } as never,
      loginLockout,
      {} as never,
      new TenantAuthPolicyService(prisma as never, config),
      platformLockout,
      mfa,
    );
  });

  async function enrolTenantUser() {
    await mfa.startSetup({
      kind: 'tenant',
      userId: 'user-a',
      tenantId: 'tenant-a',
    });
    const secret = encryption.decrypt(
      tenantUser().mfaPendingSecretEncrypted as string,
    );
    const { recoveryCodes } = await mfa.confirmSetup(
      { kind: 'tenant', userId: 'user-a', tenantId: 'tenant-a' },
      totpAt(secret, Date.now()),
      { actorId: 'user-a' },
    );
    return { secret, recoveryCodes };
  }

  const tenantLogin = (password = PASSWORD) =>
    auth.login(
      { email: 'ada@acme.test', password, tenantId: 'tenant-a' },
      request('web'),
    );

  const nextCode = (secret: string, steps = 1) =>
    totpAt(secret, Date.now() + steps * STEP_MS);

  const refusal = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as UnauthorizedException;
    }
    throw new Error('expected a refusal');
  };

  it('issues tokens directly when the account is not enrolled', async () => {
    const result = await tenantLogin();
    expect(isMfaChallengeResponse(result)).toBe(false);
    expect((result as Session).tokens.accessToken).toEqual(expect.any(String));
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUTH_LOGIN_SUCCEEDED',
        afterSnapshot: expect.objectContaining({
          mfaResult: 'NOT_REQUIRED',
        }) as unknown,
      }),
    );
  });

  it('returns a challenge and no tokens for an enrolled account, and the controller sets no cookie', async () => {
    await enrolTenantUser();
    const cookie = jest.fn();
    const controller = new AuthController(auth, config);

    const result = (await controller.login(
      { email: 'ada@acme.test', password: PASSWORD, tenantId: 'tenant-a' },
      request('web'),
      { cookie } as unknown as Response,
    )) as unknown as Challenge;

    expect(result).toMatchObject({
      mfaRequired: true,
      challengeKind: 'VERIFY',
      methods: ['TOTP', 'RECOVERY_CODE'],
    });
    expect(result).not.toHaveProperty('tokens');
    expect(cookie).not.toHaveBeenCalled();
    expect(prisma.refreshToken.rows).toHaveLength(0);
  });

  it('sends an unenrolled user through setup when the tenant requires MFA', async () => {
    prisma.tenantSetting.findMany.mockResolvedValue([
      { key: 'mfaRequired', value: true },
    ]);

    const challenge = (await tenantLogin()) as unknown as Challenge;
    expect(challenge).toMatchObject({
      mfaRequired: true,
      challengeKind: 'SETUP_REQUIRED',
    });

    const setup = await auth.startTenantChallengeSetup(
      { challengeToken: challenge.challengeToken },
      request('web'),
    );
    const secret = setup.manualEntryKey.replace(/ /g, '');
    const done = await auth.confirmTenantChallengeSetup(
      {
        challengeToken: challenge.challengeToken,
        code: totpAt(secret, Date.now()),
      },
      request('web'),
    );

    expect(done.tokens.accessToken).toEqual(expect.any(String));
    expect(done.recoveryCodes).toHaveLength(10);
    expect(tenantUser().mfaEnabled).toBe(true);
    // A VERIFY endpoint does not accept a SETUP_REQUIRED challenge.
    await expect(
      auth.verifyTenantMfaChallenge(
        { challengeToken: challenge.challengeToken, code: '123456' },
        request('web'),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('is refused by JwtAuthGuard as an access token', async () => {
    await enrolTenantUser();
    const challenge = (await tenantLogin()) as unknown as Challenge;
    const guard = new JwtAuthGuard(
      new Reflector(),
      jwt,
      config,
      {} as never,
      prisma as never,
      {} as never,
    );
    const context = {
      // A guarded handler: no @Public() metadata on either.
      getHandler: () => function listEmployees() {},
      getClass: () => class EmployeesController {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-dijipeople-app': 'web',
            authorization: `Bearer ${challenge.challengeToken}`,
          },
          cookies: {},
          url: '/employees',
          method: 'GET',
        }),
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_TOKEN' }) as unknown,
    });
  });

  it('issues the session once, with the real mfaResult, on a valid code', async () => {
    const { secret } = await enrolTenantUser();
    const challenge = (await tenantLogin()) as unknown as Challenge;

    const session = await auth.verifyTenantMfaChallenge(
      { challengeToken: challenge.challengeToken, code: nextCode(secret) },
      request('web'),
    );

    expect(session.tokens.accessToken).toEqual(expect.any(String));
    expect(prisma.refreshToken.rows).toHaveLength(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUTH_LOGIN_SUCCEEDED',
        afterSnapshot: expect.objectContaining({
          mfaResult: 'PASSED',
        }) as unknown,
      }),
    );

    // The same challenge cannot mint a second session, even with a new code.
    const again = await refusal(
      auth.verifyTenantMfaChallenge(
        { challengeToken: challenge.challengeToken, code: nextCode(secret, 0) },
        request('web'),
      ),
    );
    expect(again.getResponse()).toMatchObject({
      code: 'AUTH_MFA_CHALLENGE_INVALID',
    });
  });

  it('records RECOVERY_CODE_USED when a recovery code completes sign-in', async () => {
    const { recoveryCodes } = await enrolTenantUser();
    const challenge = (await tenantLogin()) as unknown as Challenge;

    await auth.verifyTenantMfaChallenge(
      {
        challengeToken: challenge.challengeToken,
        recoveryCode: recoveryCodes[0],
      },
      request('web'),
    );

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUTH_LOGIN_SUCCEEDED',
        afterSnapshot: expect.objectContaining({
          mfaResult: 'RECOVERY_CODE_USED',
        }) as unknown,
      }),
    );
  });

  it('refuses a challenge presented to another client', async () => {
    await enrolTenantUser();
    const challenge = (await tenantLogin()) as unknown as Challenge;

    await expect(
      auth.verifyPlatformMfaChallenge(
        { challengeToken: challenge.challengeToken, code: '123456' },
        request('admin'),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('counts wrong codes toward the lockout, which then blocks both the code and the password', async () => {
    const { secret } = await enrolTenantUser();
    const challenge = (await tenantLogin()) as unknown as Challenge;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const error = await refusal(
        auth.verifyTenantMfaChallenge(
          { challengeToken: challenge.challengeToken, code: '000000' },
          request('web'),
        ),
      );
      if (attempt < 4) {
        expect(error.getResponse()).toMatchObject({
          code: 'AUTH_MFA_CODE_INVALID',
        });
      }
    }

    expect(tenantUser().lockedUntil).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUTH_LOGIN_FAILED',
        afterSnapshot: expect.objectContaining({
          failureReason: 'MFA_CODE_INVALID',
          mfaResult: 'FAILED',
        }) as unknown,
      }),
    );

    const lockedVerify = await refusal(
      auth.verifyTenantMfaChallenge(
        { challengeToken: challenge.challengeToken, code: nextCode(secret) },
        request('web'),
      ),
    );
    expect(lockedVerify.getResponse()).toMatchObject({
      code: 'AUTH_MFA_CHALLENGE_INVALID',
    });

    const lockedPassword = await refusal(tenantLogin());
    expect(lockedPassword.getResponse()).toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
  });

  describe('platform operators', () => {
    async function enrolOperator() {
      const subject = { kind: 'platform' as const, platformUserId: 'operator-1' };
      await mfa.startSetup(subject);
      const secret = encryption.decrypt(
        platformUser().mfaPendingSecretEncrypted as string,
      );
      await mfa.confirmSetup(subject, totpAt(secret, Date.now()), {
        actorId: 'operator-1',
      });
      return secret;
    }

    const adminLogin = () =>
      auth.adminLogin(
        { email: 'ops@dijipeople.test', password: PASSWORD },
        request('admin'),
      );

    it('are challenged when enrolled, with no cookie set', async () => {
      await enrolOperator();
      const cookie = jest.fn();
      const controller = new AdminAuthController(auth);

      const result = await controller.login(
        { email: 'ops@dijipeople.test', password: PASSWORD },
        request('admin'),
        { cookie } as unknown as Response,
      );

      expect(isMfaChallengeResponse(result)).toBe(true);
      expect(cookie).not.toHaveBeenCalled();
    });

    it('complete sign-in with a valid code, and wrong codes count toward the lockout', async () => {
      const secret = await enrolOperator();
      const challenge = (await adminLogin()) as unknown as Challenge;

      await refusal(
        auth.verifyPlatformMfaChallenge(
          { challengeToken: challenge.challengeToken, code: '000000' },
          request('admin'),
        ),
      );
      expect(platformUser().failedLoginAttempts).toBe(1);

      const session = await auth.verifyPlatformMfaChallenge(
        { challengeToken: challenge.challengeToken, code: nextCode(secret) },
        request('admin'),
      );
      expect(session.tokens.accessToken).toEqual(expect.any(String));
      expect(platformUser().failedLoginAttempts).toBe(0);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'platform',
          action: 'AUTH_LOGIN_SUCCEEDED',
          afterSnapshot: expect.objectContaining({
            mfaResult: 'PASSED',
          }) as unknown,
        }),
      );
    });
  });
});
