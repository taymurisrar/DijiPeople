import { BadRequestException } from '@nestjs/common';
import {
  EmailProviderSetting,
  EmailProviderType,
  type PrismaClient,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SINK_EMAIL_PROVIDER_TYPES } from '@repo/config';
import { seedTenantConsoleProviders } from '../../../../prisma/seed-config';
import { CreateEmailProviderDto } from '../dto';
import { NotificationsService } from '../notifications.service';
import { EffectiveEmailProviderService } from './effective-email-provider.service';
import {
  EmailProviderFactory,
  type ResolvedEmailProvider,
} from './email-provider-factory.service';
import { isSinkProvider } from './providers';

/*
 * BUG-3501 / ADR-0015 — production retires sink email providers.
 *
 * On the live demo tenant the only provider was an enabled, default CONSOLE
 * provider. Every activation, reset and approval email was written to a log,
 * and the Providers screen said "Email is sent by this workspace's own provider
 * … over CONSOLE". The owner decided that production never selects or resolves
 * a sink, that existing sink rows are ignored so the tenant falls back to the
 * platform relay, and that the screen states the real delivery path.
 *
 * Each block drives the real class that makes the decision, with only its I/O
 * stubbed, because the failure being prevented is a real call site choosing a
 * sink — a test of the predicate alone would pass on the old tree.
 */

const PRODUCTION = { NODE_ENV: 'production', APP_ENV: 'production' };
const DEVELOPMENT = { NODE_ENV: 'development' };

type Env = Record<string, string | undefined>;

function providerRow(
  overrides: Partial<EmailProviderSetting> = {},
): EmailProviderSetting {
  return {
    id: 'provider-console',
    tenantId: 'tenant-1',
    providerType: EmailProviderType.CONSOLE,
    providerName: 'Console Provider',
    enabled: true,
    isDefault: true,
    fromEmail: 'no-reply@dijipeople.local',
    fromName: 'DijiPeople Demo',
    replyToEmail: null,
    configuration: {},
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  } as EmailProviderSetting;
}

function buildFactory(env: Env, rows: EmailProviderSetting[]) {
  return new EmailProviderFactory(
    {
      listEnabledProviders: jest.fn(async () => rows),
    } as never,
    { get: (key: string) => env[key] } as never,
    { validateConfig: jest.fn() } as never,
    { validateConfig: jest.fn() } as never,
  );
}

const PLATFORM_SMTP: ResolvedEmailProvider = {
  provider: { validateConfig: jest.fn() } as never,
  providerType: EmailProviderType.SMTP,
  providerSettingId: null,
  fromEmail: 'notifications@dijipeople.com',
  fromName: 'DijiPeople',
  replyToEmail: null,
  configuration: {},
  source: 'platform',
};

function buildEffective(
  env: Env,
  rows: EmailProviderSetting[],
  platform: ResolvedEmailProvider | null,
) {
  const factory = buildFactory(env, rows);
  return new EffectiveEmailProviderService(
    factory,
    { resolve: jest.fn(async () => platform) } as never,
  );
}

describe('the sink catalog agrees with the API predicate', () => {
  it('names exactly the types isSinkProvider treats as sinks', () => {
    const apiSinks = Object.values(EmailProviderType).filter(isSinkProvider);
    expect([...SINK_EMAIL_PROVIDER_TYPES].sort()).toEqual([...apiSinks].sort());
  });
});

describe('EmailProviderFactory in production', () => {
  it('ignores an enabled default CONSOLE row — the demo tenant configuration', async () => {
    const factory = buildFactory(PRODUCTION, [providerRow()]);

    await expect(
      factory.resolveProvider('tenant-1', { tenantOnly: true }),
    ).resolves.toBeNull();
  });

  it('still resolves the same row in development', async () => {
    const factory = buildFactory(DEVELOPMENT, [providerRow()]);

    await expect(
      factory.resolveProvider('tenant-1', { tenantOnly: true }),
    ).resolves.toMatchObject({ providerType: EmailProviderType.CONSOLE });
  });

  it('prefers an enabled SMTP row over a default sink', async () => {
    const factory = buildFactory(PRODUCTION, [
      providerRow(),
      providerRow({
        id: 'provider-smtp',
        providerType: EmailProviderType.SMTP,
        providerName: 'Company relay',
        isDefault: false,
        configuration: { host: 'smtp.example.com', port: 587 },
      }),
    ]);

    await expect(
      factory.resolveProvider('tenant-1', { tenantOnly: true }),
    ).resolves.toMatchObject({
      providerType: EmailProviderType.SMTP,
      providerSettingId: 'provider-smtp',
    });
  });

  it('ignores EMAIL_PROVIDER=CONSOLE and never falls back to the dev console', async () => {
    const factory = buildFactory({ ...PRODUCTION, EMAIL_PROVIDER: 'CONSOLE' }, []);

    await expect(factory.resolveProvider('tenant-1')).resolves.toBeNull();
  });

  it('treats APP_ENV=production as production even when NODE_ENV says development', async () => {
    const factory = buildFactory(
      { NODE_ENV: 'development', APP_ENV: 'production' },
      [],
    );

    expect(factory.sinkProvidersRetired()).toBe(true);
    await expect(factory.resolveProvider('tenant-1')).resolves.toBeNull();
  });

  it('keeps the development console fallback outside production', async () => {
    const factory = buildFactory(DEVELOPMENT, []);

    await expect(factory.resolveProvider('tenant-1')).resolves.toMatchObject({
      source: 'dev-fallback',
    });
  });
});

describe('EffectiveEmailProviderService in production', () => {
  it('sends a sink-only tenant through the platform relay', async () => {
    const effective = buildEffective(PRODUCTION, [providerRow()], PLATFORM_SMTP);

    await expect(effective.resolveForTenant('tenant-1')).resolves.toMatchObject(
      { source: 'platform', providerType: EmailProviderType.SMTP },
    );
    await expect(effective.describeForTenant('tenant-1')).resolves.toMatchObject(
      {
        deliveryPath: 'PLATFORM_RELAY',
        notDeliveredReason: null,
        sinkProvidersRetired: true,
      },
    );
  });

  it('does not let a platform relay stored as a sink carry mail', async () => {
    const consoleRelay = {
      ...PLATFORM_SMTP,
      providerType: EmailProviderType.CONSOLE,
    };
    const effective = buildEffective(PRODUCTION, [], consoleRelay);

    await expect(effective.resolveForPlatform('tenant-1')).resolves.toBeNull();
    await expect(effective.describeForTenant('tenant-1')).resolves.toMatchObject(
      { deliveryPath: 'NOT_DELIVERED', notDeliveredReason: 'NO_PROVIDER' },
    );
  });

  it('describes a development sink as not delivered, never as sending', async () => {
    const effective = buildEffective(DEVELOPMENT, [providerRow()], null);

    await expect(effective.describeForTenant('tenant-1')).resolves.toMatchObject(
      {
        canSend: true,
        providerType: EmailProviderType.CONSOLE,
        deliveryPath: 'NOT_DELIVERED',
        notDeliveredReason: 'SINK_PROVIDER',
        sinkProvidersRetired: false,
      },
    );
  });

  it("describes a tenant's own SMTP provider as its delivery path", async () => {
    const effective = buildEffective(
      PRODUCTION,
      [
        providerRow({
          id: 'provider-smtp',
          providerType: EmailProviderType.SMTP,
          configuration: { host: 'smtp.example.com', port: 587 },
        }),
      ],
      PLATFORM_SMTP,
    );

    await expect(effective.describeForTenant('tenant-1')).resolves.toMatchObject(
      { deliveryPath: 'TENANT_PROVIDER', inherited: false },
    );
  });
});

function buildNotificationsService(options: {
  retired: boolean;
  existing?: EmailProviderSetting | null;
}) {
  const service = Object.create(
    NotificationsService.prototype,
  ) as NotificationsService;

  const createProvider = jest.fn(async (input: Record<string, unknown>) =>
    providerRow({ id: 'provider-new', ...input }),
  );
  const updateProvider = jest.fn(
    async (_tenantId: string, id: string, data: Record<string, unknown>) =>
      providerRow({ ...(options.existing ?? {}), id, ...data }),
  );
  const setDefaultProvider = jest.fn(async () =>
    providerRow({ ...(options.existing ?? {}), isDefault: true }),
  );
  const log = jest.fn(async () => undefined);

  Object.assign(service, {
    notificationsRepository: {
      createProvider,
      updateProvider,
      setDefaultProvider,
      findProviderById: jest.fn(async () => options.existing ?? null),
      disableProvider: jest.fn(async () => ({ count: 1 })),
    },
    effectiveProvider: { sinkProvidersRetired: () => options.retired },
    auditService: { log },
    protectConfiguration: (configuration: Record<string, unknown>) =>
      configuration,
  });

  return { service, createProvider, updateProvider, setDefaultProvider, log };
}

const USER = { tenantId: 'tenant-1', userId: 'user-1' } as never;

/*
 * Exactly the body `email-providers-manager.tsx` sends from its save handler.
 * Validated through the real DTO first, so the refusal below is proven for a
 * payload the API would otherwise have accepted — the seam, not a hand-built
 * object only the test would ever send.
 */
const WEB_CONSOLE_PAYLOAD = {
  providerType: 'CONSOLE',
  providerName: 'Console Provider',
  enabled: true,
  isDefault: true,
  fromEmail: 'no-reply@example.com',
  fromName: 'Acme',
  replyToEmail: null,
  configuration: {},
};

async function validatedWebPayload() {
  const dto = plainToInstance(CreateEmailProviderDto, WEB_CONSOLE_PAYLOAD);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  expect(errors).toEqual([]);
  return dto;
}

describe('NotificationsService provider writes in production', () => {
  it('refuses to create a CONSOLE provider from the settings screen payload', async () => {
    const { service, createProvider, log } = buildNotificationsService({
      retired: true,
    });
    const dto = await validatedWebPayload();

    const attempt = service.createProvider(USER, dto);
    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createProvider(USER, dto).catch((error: BadRequestException) =>
        error.getResponse(),
      ),
    ).resolves.toMatchObject({ code: 'EMAIL_PROVIDER_TYPE_NOT_ALLOWED' });
    expect(createProvider).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('refuses DEV the same way', async () => {
    const { service } = buildNotificationsService({ retired: true });
    const dto = plainToInstance(CreateEmailProviderDto, {
      ...WEB_CONSOLE_PAYLOAD,
      providerType: 'DEV',
      enabled: false,
    });

    await expect(service.createProvider(USER, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates the same provider in development, and audits it without configuration', async () => {
    const { service, createProvider, log } = buildNotificationsService({
      retired: false,
    });
    const dto = await validatedWebPayload();

    await service.createProvider(USER, dto);

    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'email_provider.created',
        entityType: 'EmailProviderSetting',
        tenantId: 'tenant-1',
        beforeSnapshot: null,
      }),
    );
    const [audit] = log.mock.calls[0] as unknown as [
      { afterSnapshot: Record<string, unknown> },
    ];
    expect(audit.afterSnapshot).not.toHaveProperty('configuration');
  });

  it('refuses an edit that leaves an existing Console row enabled', async () => {
    const { service, updateProvider } = buildNotificationsService({
      retired: true,
      existing: providerRow(),
    });

    await expect(
      service.updateProvider(USER, 'provider-console', {
        providerName: 'Renamed',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('allows an administrator to disable an existing Console row through edit', async () => {
    const { service, updateProvider, log } = buildNotificationsService({
      retired: true,
      existing: providerRow(),
    });

    await service.updateProvider(USER, 'provider-console', { enabled: false });

    expect(updateProvider).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'email_provider.updated' }),
    );
  });

  it('allows switching an existing Console row to SMTP', async () => {
    const { service, updateProvider } = buildNotificationsService({
      retired: true,
      existing: providerRow(),
    });

    await service.updateProvider(USER, 'provider-console', {
      providerType: EmailProviderType.SMTP,
      configuration: {
        host: 'smtp.example.com',
        port: 587,
        username: 'relay',
        password: 'secret',
      },
    });

    expect(updateProvider).toHaveBeenCalledTimes(1);
  });

  it('refuses switching an SMTP row into a sink type, even disabled', async () => {
    const { service, updateProvider } = buildNotificationsService({
      retired: true,
      existing: providerRow({
        providerType: EmailProviderType.SMTP,
        enabled: false,
        isDefault: false,
        configuration: { host: 'smtp.example.com', port: 587 },
      }),
    });

    await expect(
      service.updateProvider(USER, 'provider-console', {
        providerType: EmailProviderType.DEV,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('refuses to make a Console row the default, which would also enable it', async () => {
    const { service, setDefaultProvider } = buildNotificationsService({
      retired: true,
      existing: providerRow({ enabled: false, isDefault: false }),
    });

    await expect(
      service.setDefaultProvider(USER, 'provider-console'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(setDefaultProvider).not.toHaveBeenCalled();
  });

  it('audits disabling a provider', async () => {
    const { service, log } = buildNotificationsService({
      retired: true,
      existing: providerRow(),
    });

    await service.disableProvider(USER, 'provider-console');

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'email_provider.disabled',
        afterSnapshot: expect.objectContaining({
          enabled: false,
          isDefault: false,
        }),
      }),
    );
  });

  it('publishes only SMTP as selectable in production', () => {
    const { service } = buildNotificationsService({ retired: true });

    expect(service.listProviderFieldSchema().selectableProviderTypes).toEqual([
      'SMTP',
    ]);
  });

  it('publishes every supported type as selectable in development', () => {
    const { service } = buildNotificationsService({ retired: false });

    expect(service.listProviderFieldSchema().selectableProviderTypes).toEqual([
      'CONSOLE',
      'DEV',
      'SMTP',
    ]);
  });
});

describe('seedTenantConsoleProviders', () => {
  function buildClient() {
    const count = jest.fn(async () => 0);
    const upsert = jest.fn(async () => ({}));
    return {
      client: { emailProviderSetting: { count, upsert } } as unknown as PrismaClient,
      count,
      upsert,
    };
  }

  const TENANTS = [{ id: 'tenant-1', name: 'Acme' }] as never;

  it('creates no sink provider in production — pre-deploy runs seed:config on every release', async () => {
    const { client, count, upsert } = buildClient();

    await expect(
      seedTenantConsoleProviders(client, TENANTS, PRODUCTION),
    ).resolves.toBe(0);
    expect(count).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('still seeds a Console provider for a local development tenant', async () => {
    const { client, upsert } = buildClient();

    await expect(
      seedTenantConsoleProviders(client, TENANTS, DEVELOPMENT),
    ).resolves.toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
