import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PlatformUserRole, PlatformUserStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { redactEmailError } from '../notifications/email/email-safety';
import { PlatformEmailSettingsService } from './platform-email-settings.service';

const owner: AuthenticatedUser = {
  userId: 'owner-1',
  tenantId: 'platform',
  email: 'owner@example.test',
  roleIds: [],
  roleKeys: ['system-admin'],
  permissionKeys: ['platform.*'],
  platform: {
    id: 'owner-1',
    role: PlatformUserRole.PLATFORM_OWNER,
    status: PlatformUserStatus.ACTIVE,
  },
};

const member: AuthenticatedUser = {
  ...owner,
  userId: 'member-1',
  permissionKeys: [],
  platform: {
    id: 'member-1',
    role: PlatformUserRole.MEMBER,
    status: PlatformUserStatus.ACTIVE,
  },
};

describe('PlatformEmailSettingsService', () => {
  function setup(environment = 'test') {
    type UpsertInput = {
      create: { value: unknown };
      update: { value: unknown };
    };
    let stored: unknown = null;
    const validateConfig = jest.fn();
    const testConnection = jest.fn(async () => ({
      success: true,
      message: 'SMTP connection verified.',
    }));
    const prisma = {
      platformSetting: {
        findUnique: jest.fn(async () => (stored ? { value: stored } : null)),
        upsert: jest.fn(async (input: UpsertInput) => {
          stored = stored ? input.update.value : input.create.value;
          return { value: stored };
        }),
      },
      platformOutboundEmail: { findMany: jest.fn(async () => []) },
      emailTemplate: { findMany: jest.fn(async () => []) },
    };
    const encryption = {
      isEnabled: true,
      encrypt: jest.fn((value: string) => `enc:v1:${value}`),
      decrypt: jest.fn((value: string) => value.replace('enc:v1:', '')),
    };
    const provider = { validateConfig, testConnection };
    const providers = {
      getProvider: jest.fn(() => provider),
      resolveProvider: jest.fn(async () => null),
    };
    const audit = { log: jest.fn(async () => undefined) };
    const service = new PlatformEmailSettingsService(
      prisma as never,
      { get: jest.fn(() => environment) } as never,
      encryption as never,
      providers as never,
      audit as never,
    );
    return {
      service,
      prisma,
      encryption,
      validateConfig,
      testConnection,
      audit,
      readStored: () => stored,
    };
  }

  const smtpInput = {
    enabled: true,
    providerType: 'SMTP' as const,
    fromName: 'DijiPeople',
    fromEmail: 'mail@example.test',
    replyToEmail: 'support@example.test',
    smtpHost: 'smtp.example.test',
    smtpPort: 587,
    smtpAuthEnabled: true,
    smtpUsername: 'mailer',
    smtpPassword: 'first-secret',
    smtpSecurity: 'STARTTLS' as const,
    connectionTimeoutMs: 10000,
  };

  it('requires platform settings permissions', async () => {
    const { service } = setup();
    await expect(service.getSettings(member)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.updateSettings(member, smtpInput),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('encrypts SMTP passwords and never returns them', async () => {
    const { service, readStored, audit } = setup();
    const result = await service.updateSettings(owner, smtpInput);
    expect(result).toMatchObject({
      providerType: 'SMTP',
      passwordConfigured: true,
    });
    expect(result).not.toHaveProperty('smtpPassword');
    expect(JSON.stringify(readStored())).toContain('enc:v1:first-secret');
    expect(JSON.stringify(result)).not.toContain('first-secret');
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('first-secret');
  });

  it('retains or replaces the write-only password deliberately', async () => {
    const { service, encryption, readStored } = setup();
    await service.updateSettings(owner, smtpInput);
    await service.updateSettings(owner, {
      ...smtpInput,
      smtpPassword: undefined,
    });
    expect(JSON.stringify(readStored())).toContain('enc:v1:first-secret');
    await service.updateSettings(owner, {
      ...smtpInput,
      smtpPassword: 'replacement-secret',
    });
    expect(encryption.encrypt).toHaveBeenLastCalledWith('replacement-secret');
    expect(JSON.stringify(readStored())).toContain('enc:v1:replacement-secret');
  });

  it('rejects SMTP authentication without a configured password', async () => {
    const { service, validateConfig } = setup();
    validateConfig.mockImplementation((config: { password?: string }) => {
      if (!config.password) throw new BadRequestException('Password required.');
    });
    await expect(
      service.updateSettings(owner, {
        ...smtpInput,
        smtpPassword: undefined,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tests the saved provider with the decrypted configuration', async () => {
    const { service, testConnection } = setup();
    await service.updateSettings(owner, smtpInput);
    await expect(service.testConnection(owner)).resolves.toEqual({
      success: true,
      message: 'SMTP connection verified.',
      providerType: 'SMTP',
      source: 'platform',
    });
    expect(testConnection).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'first-secret' }),
    );
  });

  it('blocks console delivery in production', async () => {
    const { service } = setup('production');
    await expect(
      service.updateSettings(owner, {
        ...smtpInput,
        providerType: 'CONSOLE',
      }),
    ).rejects.toThrow('Console email cannot be enabled');
  });

  it('keeps platform templates separate from tenant email templates', async () => {
    const { service, prisma } = setup();
    const result = await service.listTemplates(owner);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'platform:CONTRACT_SIGNATURE_REQUEST',
          eventCode: 'CONTRACT_SIGNATURE_REQUEST',
        }),
        expect.objectContaining({
          id: 'platform:CONTRACT_FULLY_SIGNED',
          eventCode: 'CONTRACT_FULLY_SIGNED',
        }),
      ]),
    );
    expect(prisma.emailTemplate.findMany).not.toHaveBeenCalled();
  });

  it('updates namespaced platform template IDs used by the admin route', async () => {
    const { service, prisma } = setup();
    const result = await service.updateTemplate(
      owner,
      'platform:CONTRACT_SIGNATURE_REQUEST',
      {
        subjectTemplate: 'Please sign {{contractTitle}}',
        htmlTemplate: '<p>Review {{contractNumber}}</p>',
        textTemplate: 'Review {{contractNumber}}',
        enabled: true,
      },
    );

    expect(result).toMatchObject({
      id: 'platform:CONTRACT_SIGNATURE_REQUEST',
      subjectTemplate: 'Please sign {{contractTitle}}',
      version: 2,
    });
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'platform-email-templates' },
      }),
    );
  });

  it('rejects malformed platform template IDs at the service boundary', async () => {
    const { service } = setup();
    await expect(
      service.updateTemplate(owner, '../tenant-template', {
        subjectTemplate: 'Subject',
        htmlTemplate: '<p>Message</p>',
        enabled: true,
      }),
    ).rejects.toThrow('Platform email template ID is invalid.');
  });

  it('renders platform workflow variables without allowing HTML injection', async () => {
    const { service } = setup();
    const rendered = await service.renderTemplate(
      'CONTRACT_SIGNATURE_REQUEST',
      { subject: 'Fallback', html: '<p>Fallback</p>' },
      {
        recipientName: '<Signer>',
        contractTitle: 'Services Agreement',
        contractNumber: 'CON-100',
        message: 'Please review',
        signingUrl: 'https://sign.example.test/sign/token',
        expiresAt: '2026-08-26',
      },
    );
    expect(rendered.subject).toBe('Signature requested: Services Agreement');
    expect(rendered.html).toContain('&lt;Signer&gt;');
    expect(rendered.html).toContain('https://sign.example.test/sign/token');
  });

  it('redacts credentials from provider failures', () => {
    expect(
      redactEmailError(
        'connect smtp://mailer:super-secret@smtp.example.test password=oops',
      ),
    ).toBe('connect smtp://[redacted]@smtp.example.test password=[redacted]');
  });
});
