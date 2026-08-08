import { BadRequestException } from '@nestjs/common';
import { PasswordPolicyService } from './password-policy.service';

/*
 * These rules were configurable on the Password & Login Policies screen and
 * enforced nowhere. The cases below pin the two properties that matter: a
 * tenant's policy is actually applied, and nothing a tenant or an outage can do
 * makes the platform accept a weaker password than its own floor.
 */

function buildService(security: Record<string, unknown> | Error) {
  const resolver = {
    getSecuritySettings: jest.fn(() =>
      security instanceof Error
        ? Promise.reject(security)
        : Promise.resolve(security),
    ),
  };

  const prisma = {
    passwordHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
  };

  return new PasswordPolicyService(resolver as never, prisma as never);
}

const STRICT = {
  minimumPasswordLength: 16,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialCharacter: true,
};

describe('password policy', () => {
  it('applies the length the tenant configured', async () => {
    const service = buildService(STRICT);

    await expect(
      service.assertPasswordMeetsPolicy('tenant-1', 'Sh0rt!Pass'),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.assertPasswordMeetsPolicy('tenant-1', 'LongEnough1!Password'),
    ).resolves.toEqual(expect.objectContaining({ minimumPasswordLength: 16 }));
  });

  it('reports every broken rule at once rather than one at a time', async () => {
    const service = buildService(STRICT);

    await expect(
      service.assertPasswordMeetsPolicy('tenant-1', 'aaaaaaaaaaaaaaaaa'),
    ).rejects.toThrow(
      /include an uppercase letter, include a number, include a special character/,
    );
  });

  it('honours a tenant that switches character classes off', async () => {
    const service = buildService({
      minimumPasswordLength: 10,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSpecialCharacter: false,
    });

    await expect(
      service.assertPasswordMeetsPolicy('tenant-1', 'alllowercase'),
    ).resolves.toBeDefined();
  });

  it('never lets a tenant drop the minimum below the platform floor', async () => {
    const service = buildService({
      minimumPasswordLength: 1,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSpecialCharacter: false,
    });

    const policy = await service.resolvePolicy('tenant-1');
    expect(policy.minimumPasswordLength).toBe(8);

    await expect(
      service.assertPasswordMeetsPolicy('tenant-1', 'short'),
    ).rejects.toThrow(BadRequestException);
  });

  it('falls back to the strict default when settings cannot be read', async () => {
    const service = buildService(new Error('settings unavailable'));

    const policy = await service.resolvePolicy('tenant-1');
    expect(policy).toEqual({
      minimumPasswordLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecialCharacter: true,
    });

    await expect(
      service.assertPasswordMeetsPolicy('tenant-1', 'Password1!'),
    ).rejects.toThrow(BadRequestException);
  });

  it('treats a non-numeric configured length as unset instead of zero', async () => {
    const service = buildService({
      ...STRICT,
      minimumPasswordLength: 'not a number' as unknown as number,
    });

    const policy = await service.resolvePolicy('tenant-1');
    expect(policy.minimumPasswordLength).toBe(12);
  });
});

describe('password reuse and expiry', () => {
  function buildWithHistory(hashes: string[], historyCount = 3) {
    const resolver = {
      getSecuritySettings: jest.fn().mockResolvedValue({
        ...STRICT,
        passwordHistoryCount: historyCount,
        passwordExpiryDays: 90,
      }),
    };
    const prisma = {
      passwordHistory: {
        findMany: jest
          .fn()
          .mockResolvedValue(hashes.map((passwordHash) => ({ passwordHash }))),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
    };
    return {
      service: new PasswordPolicyService(resolver as never, prisma as never),
      prisma,
    };
  }

  it('refuses a password the user used recently', async () => {
    const bcrypt = await import('bcryptjs');
    const previous = await bcrypt.hash('OldPassword1!', 10);
    const { service } = buildWithHistory([previous]);

    await expect(
      service.assertPasswordNotReused('user-1', 'tenant-1', 'OldPassword1!'),
    ).rejects.toThrow(/used recently/i);

    await expect(
      service.assertPasswordNotReused('user-1', 'tenant-1', 'BrandNew1!Value'),
    ).resolves.toBeUndefined();
  });

  it('skips the check when history is switched off', async () => {
    const { service, prisma } = buildWithHistory([], 0);

    await service.assertPasswordNotReused('user-1', 'tenant-1', 'anything');

    expect(prisma.passwordHistory.findMany).not.toHaveBeenCalled();
  });

  it('treats a password with no recorded change date as current', async () => {
    const { service } = buildWithHistory([]);

    await expect(service.isPasswordExpired('tenant-1', null)).resolves.toBe(
      false,
    );
  });

  it('expires a password older than the configured window', async () => {
    const { service } = buildWithHistory([]);
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    await expect(service.isPasswordExpired('tenant-1', old)).resolves.toBe(
      true,
    );
    await expect(service.isPasswordExpired('tenant-1', recent)).resolves.toBe(
      false,
    );
  });

  it('never expires when the setting is zero', async () => {
    const resolver = {
      getSecuritySettings: jest
        .fn()
        .mockResolvedValue({ ...STRICT, passwordExpiryDays: 0 }),
    };
    const service = new PasswordPolicyService(resolver as never, {} as never);
    const ancient = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000);

    await expect(service.isPasswordExpired('tenant-1', ancient)).resolves.toBe(
      false,
    );
  });
});
