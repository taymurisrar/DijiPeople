import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { SecretEncryptionService } from '../../../common/security/secret-encryption.service';
import { LoginLockoutService } from '../login-lockout.service';
import { PlatformLoginLockoutService } from '../platform-login-lockout.service';
import { MfaService, type MfaSubject } from './mfa.service';
import {
  createMfaTestPrisma,
  tenantUserRow,
  type MfaTestPrisma,
} from './mfa-test-prisma.fixture';
import { TOTP_PERIOD_SECONDS, totpAt } from './totp';

/*
 * ADR-0019 behaviour, against an in-memory store that evaluates the `where`
 * clauses (see the fixture). Every rule the ADR states has a test here: setup
 * stays pending until confirmed, a replayed code is refused, a recovery code
 * works once, regenerating invalidates the old set, disabling needs the
 * password and a factor, a tenant administrator's reset cannot leave their
 * tenant, and no secret reaches an audit row or a log line.
 */

const PASSWORD = 'Correct-Horse-9!';
const STEP_MS = TOTP_PERIOD_SECONDS * 1000;

describe('MfaService', () => {
  let prisma: MfaTestPrisma;
  let encryption: SecretEncryptionService;
  let audit: { log: jest.Mock };
  let service: MfaService;
  let passwordHash: string;

  const subject: MfaSubject = {
    kind: 'tenant',
    userId: 'user-a',
    tenantId: 'tenant-a',
  };
  const userRow = () => prisma.user.rows.find((row) => row.id === 'user-a')!;
  const codesFor = (userId: string) =>
    prisma.userMfaRecoveryCode.rows.filter((row) => row.userId === userId);

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  function build(options: { encryptionKey?: string | null } = {}) {
    prisma = createMfaTestPrisma({
      users: [
        tenantUserRow({ passwordHash }),
        // Same shape, another tenant: the row a cross-tenant reset would hit.
        tenantUserRow({
          id: 'user-b',
          tenantId: 'tenant-b',
          email: 'bo@other.test',
          passwordHash,
        }),
        tenantUserRow({
          id: 'admin-a',
          email: 'admin@acme.test',
          passwordHash,
        }),
      ],
      refreshTokens: [
        { id: 'rt-1', userId: 'user-a', tenantId: 'tenant-a', revokedAt: null },
        { id: 'rt-2', userId: 'user-b', tenantId: 'tenant-b', revokedAt: null },
      ],
    });
    const key =
      options.encryptionKey === undefined ? 'test-key' : options.encryptionKey;
    encryption = new SecretEncryptionService({
      get: (name: string) =>
        name === 'SECRET_ENCRYPTION_KEY' ? (key ?? undefined) : undefined,
    } as unknown as ConfigService);
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new MfaService(
      prisma as never,
      encryption,
      audit as never,
      new LoginLockoutService(
        prisma as never,
        {
          getSecuritySettings: jest.fn().mockRejectedValue(new Error('none')),
        } as never,
      ),
      new PlatformLoginLockoutService(prisma as never),
    );
  }

  beforeEach(() => build());

  /** Enrols user-a and returns the seed and the one-time recovery codes. */
  async function enrol() {
    await service.startSetup(subject);
    const secret = encryption.decrypt(
      userRow().mfaPendingSecretEncrypted as string,
    );
    const { recoveryCodes } = await service.confirmSetup(
      subject,
      totpAt(secret, Date.now()),
      { actorId: 'user-a' },
    );
    return { secret, recoveryCodes };
  }

  describe('setup', () => {
    it('stores an encrypted pending seed and does not turn MFA on', async () => {
      const setup = await service.startSetup(subject);

      expect(userRow().mfaEnabled).toBe(false);
      expect(userRow().mfaSecretEncrypted).toBeNull();
      expect(String(userRow().mfaPendingSecretEncrypted)).toMatch(/^enc:v1:/);
      expect(setup.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(setup.otpauthUri).toContain('issuer=DijiPeople');
      expect(setup.accountLabel).toBe('ada@acme.test (Acme Ltd)');
      expect(setup.manualEntryKey.replace(/ /g, '')).toBe(
        encryption.decrypt(userRow().mfaPendingSecretEncrypted as string),
      );
      await expect(service.getStatus(subject)).resolves.toMatchObject({
        enabled: false,
        pendingSetup: true,
      });
    });

    it('replaces the pending seed when setup is started again', async () => {
      await service.startSetup(subject);
      const firstSecret = encryption.decrypt(
        userRow().mfaPendingSecretEncrypted as string,
      );
      await service.startSetup(subject);

      await expect(
        service.confirmSetup(subject, totpAt(firstSecret, Date.now()), {
          actorId: 'user-a',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'MFA_CODE_INVALID',
        }) as unknown,
      });
      expect(userRow().mfaEnabled).toBe(false);
    });

    it('refuses a wrong confirmation code and stays off', async () => {
      await service.startSetup(subject);

      await expect(
        service.confirmSetup(subject, '000000', { actorId: 'user-a' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'MFA_CODE_INVALID',
        }) as unknown,
      });
      expect(userRow().mfaEnabled).toBe(false);
    });

    it('turns MFA on with a correct code and returns ten recovery codes once', async () => {
      const { recoveryCodes } = await enrol();

      expect(userRow().mfaEnabled).toBe(true);
      expect(userRow().mfaPendingSecretEncrypted).toBeNull();
      expect(String(userRow().mfaSecretEncrypted)).toMatch(/^enc:v1:/);
      expect(recoveryCodes).toHaveLength(10);
      const stored = codesFor('user-a');
      expect(stored).toHaveLength(10);
      for (const code of recoveryCodes) {
        expect(stored.map((row) => row.codeHash)).not.toContain(code);
      }
      await expect(service.getStatus(subject)).resolves.toMatchObject({
        enabled: true,
        recoveryCodesRemaining: 10,
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_MFA_ENABLED',
          tenantId: 'tenant-a',
          entityId: 'user-a',
        }),
        expect.anything(),
      );
    });

    it('refuses to start while MFA is already on', async () => {
      await enrol();
      await expect(service.startSetup(subject)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'MFA_ALREADY_ENABLED',
        }) as unknown,
      });
    });

    it('refuses to store a seed when no encryption key is configured', async () => {
      build({ encryptionKey: null });
      await expect(service.startSetup(subject)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'MFA_ENCRYPTION_UNAVAILABLE',
        }) as unknown,
      });
      expect(userRow().mfaPendingSecretEncrypted).toBeNull();
    });
  });

  describe('verifying a second factor', () => {
    it('accepts a current code and refuses the same code a second time', async () => {
      const { secret } = await enrol();
      const next = totpAt(secret, Date.now() + STEP_MS);

      await expect(
        service.verifySecondFactor(subject, { code: next }),
      ).resolves.toBe('TOTP');
      await expect(
        service.verifySecondFactor(subject, { code: next }),
      ).resolves.toBeNull();
    });

    it('refuses the code used to confirm setup', async () => {
      const { secret } = await enrol();
      await expect(
        service.verifySecondFactor(subject, {
          code: totpAt(secret, Date.now()),
        }),
      ).resolves.toBeNull();
    });

    it('refuses a wrong code', async () => {
      await enrol();
      await expect(
        service.verifySecondFactor(subject, { code: '123456' }),
      ).resolves.toBeNull();
    });

    it('accepts a recovery code once, however it is typed', async () => {
      const { recoveryCodes } = await enrol();
      const typed = recoveryCodes[0].toUpperCase().replace('-', ' ');

      await expect(
        service.verifySecondFactor(subject, { recoveryCode: typed }),
      ).resolves.toBe('RECOVERY_CODE');
      await expect(
        service.verifySecondFactor(subject, {
          recoveryCode: recoveryCodes[0],
        }),
      ).resolves.toBeNull();
      await expect(service.getStatus(subject)).resolves.toMatchObject({
        recoveryCodesRemaining: 9,
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTH_MFA_RECOVERY_CODE_USED' }),
        undefined,
      );
    });

    it("does not accept another account's recovery code", async () => {
      const { recoveryCodes } = await enrol();
      const other: MfaSubject = {
        kind: 'tenant',
        userId: 'user-b',
        tenantId: 'tenant-b',
      };
      prisma.user.rows.find((row) => row.id === 'user-b')!.mfaEnabled = true;
      prisma.user.rows.find((row) => row.id === 'user-b')!.mfaSecretEncrypted =
        userRow().mfaSecretEncrypted;

      await expect(
        service.verifySecondFactor(other, { recoveryCode: recoveryCodes[0] }),
      ).resolves.toBeNull();
    });
  });

  describe('recovery code regeneration', () => {
    it('needs a current TOTP and invalidates every earlier code', async () => {
      const { secret, recoveryCodes } = await enrol();

      const { recoveryCodes: fresh } = await service.regenerateRecoveryCodes(
        subject,
        totpAt(secret, Date.now() + STEP_MS),
      );

      expect(fresh).toHaveLength(10);
      expect(fresh).not.toContain(recoveryCodes[0]);
      await expect(
        service.verifySecondFactor(subject, { recoveryCode: recoveryCodes[0] }),
      ).resolves.toBeNull();
      await expect(
        service.verifySecondFactor(subject, { recoveryCode: fresh[0] }),
      ).resolves.toBe('RECOVERY_CODE');
    });

    it('refuses a wrong code and counts it toward the lockout', async () => {
      await enrol();
      await expect(
        service.regenerateRecoveryCodes(subject, '000000'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'MFA_CODE_INVALID',
        }) as unknown,
      });
      expect(userRow().failedLoginAttempts).toBe(1);
    });
  });

  describe('disable', () => {
    it('refuses without the correct password', async () => {
      const { secret } = await enrol();
      await expect(
        service.disable(subject, {
          password: 'wrong-password',
          code: totpAt(secret, Date.now() + STEP_MS),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CURRENT_PASSWORD_INVALID',
        }) as unknown,
      });
      expect(userRow().mfaEnabled).toBe(true);
    });

    it('refuses the correct password without a valid factor', async () => {
      await enrol();
      await expect(
        service.disable(subject, { password: PASSWORD, code: '000000' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'MFA_CODE_INVALID',
        }) as unknown,
      });
      expect(userRow().mfaEnabled).toBe(true);
    });

    it('turns MFA off with the password and a recovery code, clearing everything', async () => {
      const { recoveryCodes } = await enrol();

      await service.disable(subject, {
        password: PASSWORD,
        recoveryCode: recoveryCodes[3],
      });

      expect(userRow()).toMatchObject({
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaPendingSecretEncrypted: null,
        mfaLastUsedStep: null,
      });
      expect(codesFor('user-a')).toHaveLength(0);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTH_MFA_DISABLED' }),
        expect.anything(),
      );
    });
  });

  describe('administrator reset', () => {
    const tenantAdmin = {
      userId: 'admin-a',
      tenantId: 'tenant-a',
      email: 'admin@acme.test',
      roleIds: [],
      roleKeys: ['global-admin'],
      permissionKeys: ['users.update'],
    } as AuthenticatedUser;

    it('clears the target, revokes their sessions and audits the administrator as actor', async () => {
      await enrol();

      const result = await service.adminResetTenantUser(tenantAdmin, 'user-a');

      expect(result).toEqual({
        userId: 'user-a',
        mfaEnabled: false,
        revokedSessions: 1,
      });
      expect(userRow().mfaEnabled).toBe(false);
      expect(userRow().mfaSecretEncrypted).toBeNull();
      expect(codesFor('user-a')).toHaveLength(0);
      expect(
        prisma.refreshToken.rows.find((row) => row.id === 'rt-1')!.revokedAt,
      ).toBeInstanceOf(Date);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTH_MFA_RESET',
          actorUserId: 'admin-a',
          entityId: 'user-a',
          tenantId: 'tenant-a',
        }),
        expect.anything(),
      );
    });

    it("cannot reach another tenant's user, even as a global administrator", async () => {
      const userB = prisma.user.rows.find((row) => row.id === 'user-b')!;
      userB.mfaEnabled = true;
      userB.mfaSecretEncrypted = 'enc:v1:unchanged';

      await expect(
        service.adminResetTenantUser(tenantAdmin, 'user-b'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'USER_NOT_FOUND',
        }) as unknown,
      });
      expect(userB.mfaEnabled).toBe(true);
      expect(userB.mfaSecretEncrypted).toBe('enc:v1:unchanged');
      expect(
        prisma.refreshToken.rows.find((row) => row.id === 'rt-2')!.revokedAt,
      ).toBeNull();
      expect(audit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTH_MFA_RESET' }),
        expect.anything(),
      );
    });

    it('cannot reach a user outside the administrator row scope', async () => {
      await enrol();
      const scopedAdmin = {
        ...tenantAdmin,
        roleKeys: ['hr'],
        rolePrivileges: [
          {
            entityKey: 'users',
            privilege: 'WRITE',
            accessLevel: 'USER',
            roleId: 'role-hr',
          },
        ],
      } as AuthenticatedUser;

      await expect(
        service.adminResetTenantUser(scopedAdmin, 'user-a'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'USER_NOT_FOUND',
        }) as unknown,
      });
      expect(userRow().mfaEnabled).toBe(true);
    });

    it("refuses an administrator's own account", async () => {
      await expect(
        service.adminResetTenantUser(tenantAdmin, 'admin-a'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'MFA_RESET_SELF',
        }) as unknown,
      });
    });
  });

  it('never writes a seed, a code, a recovery code or the otpauth URI to an audit row or a log line', async () => {
    const logged: unknown[] = [];
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(
      (method) =>
        jest
          .spyOn(Logger.prototype, method)
          .mockImplementation((...args: unknown[]) => {
            logged.push(args);
          }),
    );

    try {
      const setup = await service.startSetup(subject);
      const secret = encryption.decrypt(
        userRow().mfaPendingSecretEncrypted as string,
      );
      const confirmCode = totpAt(secret, Date.now());
      const { recoveryCodes } = await service.confirmSetup(
        subject,
        confirmCode,
        { actorId: 'user-a' },
      );
      await service.verifySecondFactor(subject, { code: '000000' });
      await service.verifySecondFactor(subject, {
        recoveryCode: recoveryCodes[0],
      });
      const regenerated = await service.regenerateRecoveryCodes(
        subject,
        totpAt(secret, Date.now() + STEP_MS),
      );
      await service.disable(subject, {
        password: PASSWORD,
        recoveryCode: regenerated.recoveryCodes[0],
      });

      const written = JSON.stringify([
        audit.log.mock.calls.map(([payload]) => payload as unknown),
        logged,
      ]);
      const forbidden = [
        secret,
        setup.manualEntryKey,
        setup.otpauthUri,
        confirmCode,
        PASSWORD,
        ...recoveryCodes,
        ...regenerated.recoveryCodes,
        ...recoveryCodes.map((code) => code.replace('-', '')),
      ];
      for (const value of forbidden) {
        expect(written).not.toContain(value);
      }
      expect(audit.log.mock.calls.length).toBeGreaterThanOrEqual(4);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
