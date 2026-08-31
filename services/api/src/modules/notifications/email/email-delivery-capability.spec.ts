import { EmailProviderType } from '@prisma/client';
import { EmailExecutionService } from './email-execution.service';

/*
 * "Can this workspace actually send email?"
 *
 * The question the Scheduled Reports screen asks before promising anybody a
 * recurring email. It has to be answered through the chain a real send walks,
 * not by reading the tenant's own provider rows: `resolveProviderForOrigin`
 * slots the platform relay between the tenant's providers and the environment
 * fallback (PLAN-023, BUG-1595), so a check that consulted
 * `listEnabledProviders` alone would tell every tenant relying on the platform
 * relay that it cannot send.
 */

type ResolvedStub = { providerType: EmailProviderType } | null;

function buildService(chain: {
  tenantOnly?: ResolvedStub;
  platform?: ResolvedStub;
  base?: ResolvedStub;
}) {
  const service = Object.create(
    EmailExecutionService.prototype,
  ) as EmailExecutionService;

  const resolveProvider = jest.fn(
    async (_tenantId: string, options: { tenantOnly?: boolean } = {}) =>
      options.tenantOnly ? (chain.tenantOnly ?? null) : (chain.base ?? null),
  );

  Object.assign(service, {
    providerFactory: { resolveProvider },
    platformProvider: { resolve: jest.fn(async () => chain.platform ?? null) },
  });

  return { service, resolveProvider };
}

describe('resolveDeliveryCapability', () => {
  it('reports a tenant SMTP provider as able to deliver', async () => {
    const { service } = buildService({
      tenantOnly: { providerType: EmailProviderType.SMTP },
    });

    await expect(
      service.resolveDeliveryCapability('tenant-1'),
    ).resolves.toEqual({
      canDeliver: true,
      providerType: EmailProviderType.SMTP,
    });
  });

  it('reports a tenant CONSOLE sink as unable to deliver', async () => {
    /*
     * Exactly the demo tenant's configuration: providerType CONSOLE,
     * providerName "Console Provider", enabled, isDefault. Everything above it
     * reported success for weeks.
     */
    const { service } = buildService({
      tenantOnly: { providerType: EmailProviderType.CONSOLE },
    });

    await expect(
      service.resolveDeliveryCapability('tenant-1'),
    ).resolves.toEqual({
      canDeliver: false,
      providerType: EmailProviderType.CONSOLE,
    });
  });

  it('sees the platform relay a tenant relies on', async () => {
    // No tenant provider of its own; the platform SMTP relay delivers for it.
    // A check reading only the tenant's rows would call this "cannot deliver".
    const { service } = buildService({
      tenantOnly: null,
      platform: { providerType: EmailProviderType.SMTP },
    });

    await expect(
      service.resolveDeliveryCapability('tenant-1'),
    ).resolves.toEqual({
      canDeliver: true,
      providerType: EmailProviderType.SMTP,
    });
  });

  it('reports a platform relay that is itself a sink as unable to deliver', async () => {
    const { service } = buildService({
      tenantOnly: null,
      platform: { providerType: EmailProviderType.CONSOLE },
    });

    await expect(
      service.resolveDeliveryCapability('tenant-1'),
    ).resolves.toEqual({
      canDeliver: false,
      providerType: EmailProviderType.CONSOLE,
    });
  });

  it('reports no provider at all as unable to deliver', async () => {
    const { service } = buildService({});

    await expect(
      service.resolveDeliveryCapability('tenant-1'),
    ).resolves.toEqual({ canDeliver: false, providerType: null });
  });

  it('walks the tenant-first chain, not the platform-first one', async () => {
    const { service, resolveProvider } = buildService({
      tenantOnly: { providerType: EmailProviderType.SMTP },
    });

    await service.resolveDeliveryCapability('tenant-1');

    // `origin: 'TENANT'` asks the tenant's own providers first — the same order
    // a tenant send takes. Answering from a different chain than the send uses
    // is how a capability check becomes a lie.
    expect(resolveProvider).toHaveBeenCalledWith('tenant-1', {
      tenantOnly: true,
    });
  });
});
