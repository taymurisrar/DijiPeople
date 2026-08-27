import { EmailProviderType } from '@prisma/client';
import { EmailExecutionService } from './email-execution.service';
import { PlatformEmailProviderResolver } from './platform-email-provider.resolver';
import type { ResolvedEmailProvider } from './email-provider-factory.service';

/*
 * BUG-1595. Production carried a working, operator-configured SMTP provider on
 * the admin Settings → Email screen while no tenant could send a single email,
 * because the delivery path could not see that row. Every paid signup
 * provisioned a tenant whose owner could never sign in.
 *
 * These cover the two halves of PLAN-023: that the platform row can be resolved
 * into a provider at all, and that origin decides which provider a message
 * uses.
 */

const STORED_SMTP = {
  enabled: true,
  providerType: 'SMTP',
  fromName: 'DijiPeople',
  fromEmail: 'notifications@dijipeople.com',
  replyToEmail: null,
  smtp: {
    host: 'live.smtp.mailtrap.io',
    port: 2525,
    authEnabled: true,
    username: 'api',
    password: 'encrypted-secret',
    security: 'STARTTLS',
    connectionTimeoutMs: 10000,
  },
};

function buildResolver(value: unknown) {
  const validateConfig = jest.fn();
  const provider = { validateConfig };
  const findUnique = jest
    .fn()
    .mockResolvedValue(value === null ? null : { value });
  const decrypt = jest.fn().mockReturnValue('plaintext-secret');
  const resolveProvider = jest.fn();

  const resolver = Object.create(
    PlatformEmailProviderResolver.prototype,
  ) as PlatformEmailProviderResolver;

  Object.assign(resolver, {
    prisma: { platformSetting: { findUnique } },
    encryption: { decrypt },
    providers: { getProvider: () => provider, resolveProvider },
  });

  return { resolver, findUnique, decrypt, validateConfig, resolveProvider };
}

describe('platform email provider resolution', () => {
  it('resolves the stored platform SMTP row into a provider', async () => {
    const { resolver, decrypt } = buildResolver(STORED_SMTP);

    const resolved = await resolver.resolve();

    expect(resolved).toMatchObject({
      providerType: EmailProviderType.SMTP,
      fromEmail: 'notifications@dijipeople.com',
      fromName: 'DijiPeople',
      source: 'platform',
    });
    // The stored password is ciphertext; what reaches the transport is not.
    expect(decrypt).toHaveBeenCalledWith('encrypted-secret');
    expect(resolved?.configuration).toMatchObject({
      host: 'live.smtp.mailtrap.io',
      port: 2525,
      password: 'plaintext-secret',
    });
  });

  it('returns null when no platform settings row exists', async () => {
    const { resolver } = buildResolver(null);
    await expect(resolver.resolve()).resolves.toBeNull();
  });

  it('returns null when the operator has switched platform email off', async () => {
    // Not an exception: unticking "enabled" means stop sending, not fail the
    // request. The caller's chain continues past it.
    const { resolver } = buildResolver({ ...STORED_SMTP, enabled: false });
    await expect(resolver.resolve()).resolves.toBeNull();
  });

  it('validates the configuration rather than trusting what was stored', async () => {
    const { resolver, validateConfig } = buildResolver(STORED_SMTP);
    await resolver.resolve();
    expect(validateConfig).toHaveBeenCalled();
  });

  it('never re-enters the tenant factory, so the two cannot recurse', async () => {
    // PlatformEmailSettingsService used to fall back to
    // resolveProvider('platform') -- the literal string as a tenant id. Now the
    // factory's caller can reach this resolver, that path would loop.
    const { resolver, resolveProvider } = buildResolver(STORED_SMTP);
    await resolver.resolve();
    expect(resolveProvider).not.toHaveBeenCalled();
  });
});

const TENANT_PROVIDER = {
  source: 'tenant',
} as unknown as ResolvedEmailProvider;
const PLATFORM_PROVIDER = {
  source: 'platform',
} as unknown as ResolvedEmailProvider;
const ENV_PROVIDER = { source: 'env' } as unknown as ResolvedEmailProvider;

/*
 * `resolveProviderForOrigin` is private and reached through a cast, matching
 * email-scope-resolution.spec.ts. Widening it to test it would change the shape
 * of the class to suit the test.
 */
function buildExecution(options: {
  tenant?: ResolvedEmailProvider | null;
  platform?: ResolvedEmailProvider | null;
  base?: ResolvedEmailProvider | null;
}) {
  const resolveProvider = jest.fn(
    (_tenantId: string, opts: { tenantOnly?: boolean } = {}) =>
      Promise.resolve(
        opts.tenantOnly ? (options.tenant ?? null) : (options.base ?? null),
      ),
  );
  const resolve = jest.fn().mockResolvedValue(options.platform ?? null);

  const service = Object.create(
    EmailExecutionService.prototype,
  ) as EmailExecutionService;

  Object.assign(service, {
    providerFactory: { resolveProvider },
    platformProvider: { resolve },
  });

  const call = (input: Record<string, unknown>) =>
    (
      service as unknown as {
        resolveProviderForOrigin(
          value: unknown,
        ): Promise<ResolvedEmailProvider | null>;
      }
    ).resolveProviderForOrigin({ tenantId: 'tenant-1', ...input });

  return { call, resolveProvider, resolve };
}

describe('which provider sends, by origin', () => {
  it('sends platform-originated mail over the platform provider even when the tenant has its own', async () => {
    // The decision of 2026-08-27: an activation link from DijiPeople is sent by
    // DijiPeople, never relayed through a customer's server.
    const { call } = buildExecution({
      tenant: TENANT_PROVIDER,
      platform: PLATFORM_PROVIDER,
    });

    await expect(call({ origin: 'PLATFORM' })).resolves.toBe(PLATFORM_PROVIDER);
  });

  it('prefers the tenant provider for tenant-originated mail', async () => {
    const { call } = buildExecution({
      tenant: TENANT_PROVIDER,
      platform: PLATFORM_PROVIDER,
    });

    await expect(call({})).resolves.toBe(TENANT_PROVIDER);
  });

  it('falls back to the platform provider when the tenant has none', async () => {
    // The BUG-1595 condition exactly: a freshly provisioned tenant, because
    // nothing in provisioning creates a provider for it.
    const { call } = buildExecution({
      tenant: null,
      platform: PLATFORM_PROVIDER,
    });

    await expect(call({})).resolves.toBe(PLATFORM_PROVIDER);
  });

  it('puts the platform provider ahead of the environment fallback', async () => {
    // EMAIL_* is deployment config that on this deployment was declared in
    // render.yaml and never actually in effect. The screen an operator can see
    // wins over the variable they cannot.
    const { call } = buildExecution({
      tenant: null,
      platform: PLATFORM_PROVIDER,
      base: ENV_PROVIDER,
    });

    await expect(call({})).resolves.toBe(PLATFORM_PROVIDER);
  });

  it('still reaches the environment fallback when no platform provider is configured', async () => {
    const { call } = buildExecution({
      tenant: null,
      platform: null,
      base: ENV_PROVIDER,
    });

    await expect(call({})).resolves.toBe(ENV_PROVIDER);
  });

  it('resolves nothing when every source is empty, rather than throwing', async () => {
    const { call } = buildExecution({
      tenant: null,
      platform: null,
      base: null,
    });
    await expect(call({})).resolves.toBeNull();
  });
});
