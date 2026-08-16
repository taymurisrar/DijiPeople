import { getPlatformDomainConfig } from '@repo/config';
import { TenantProvisioningService } from './tenant-provisioning.service';

describe('TenantProvisioningService', () => {
  const platformSetting = (wildcardDnsReady: boolean) => ({
    findUnique: jest.fn().mockResolvedValue({ value: { wildcardDnsReady } }),
  });

  it('provisions through the domain service rather than building the hostname itself', async () => {
    /*
     * The assertion that matters is the delegation. When this service built the
     * hostname locally it applied none of the reserved-label, slug-format or
     * primary-demotion rules that live in TenantDomainService, so a workspace
     * could be issued an address the router would never match.
     */
    const createSystemDomain = jest.fn().mockResolvedValue({
      id: 'domain-1',
      tenantId: 'tenant-1',
      domain: 'acme.digipeople.com',
      verificationStatus: 'PENDING',
      tlsStatus: 'PENDING',
    });
    const events = { record: jest.fn() };
    const service = new TenantProvisioningService(
      { platformSetting: platformSetting(false) } as never,
      { createSystemDomain } as never,
      events as never,
    );

    await expect(
      service.provisionSystemDomain({ tenantId: 'tenant-1', slug: 'acme' }),
    ).resolves.toMatchObject({
      domain: 'acme.digipeople.com',
      wildcardDnsReady: false,
      verificationStatus: 'PENDING',
    });
    expect(createSystemDomain).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      slug: 'acme',
      actorUserId: null,
    });
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: 'TENANT_PROVISIONING_REQUESTED',
        result: 'PENDING',
      }),
    );
  });

  it('reports the provisioning event as succeeded only when wildcard DNS is confirmed', async () => {
    const events = { record: jest.fn() };
    const service = new TenantProvisioningService(
      { platformSetting: platformSetting(true) } as never,
      {
        createSystemDomain: jest.fn().mockResolvedValue({
          domain: 'acme.digipeople.com',
          verificationStatus: 'VERIFIED',
        }),
      } as never,
      events as never,
    );

    await expect(
      service.provisionSystemDomain({ tenantId: 'tenant-1', slug: 'acme' }),
    ).resolves.toMatchObject({ wildcardDnsReady: true });
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'SUCCEEDED' }),
    );
  });

  it('propagates a hostname conflict raised by the domain service', async () => {
    const service = new TenantProvisioningService(
      { platformSetting: platformSetting(false) } as never,
      {
        createSystemDomain: jest
          .fn()
          .mockRejectedValue(
            new Error('The workspace hostname is already assigned.'),
          ),
      } as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.provisionSystemDomain({ tenantId: 'tenant-1', slug: 'acme' }),
    ).rejects.toThrow(/already assigned/i);
  });
  /*
   * BUG-0017 — the tenant base domain must have exactly one source.
   *
   * It was once editable in the admin UI and stored in the `tenant-provisioning`
   * PlatformSetting, while hostname issuance read environment configuration, so
   * the operator control was inert: changing it did nothing, and provisioning
   * still failed unless TENANT_BASE_DOMAIN was set in the API environment.
   *
   * The resolution kept configuration as the single source, because the edge
   * router matches hostnames with no database access and must be able to read it
   * — so the *setting* was retired rather than wired up. That makes a stored
   * value a stale leftover, and reading one again would silently restore the
   * divergence. This pins the direction: whatever is in the row, configuration
   * wins.
   */
  it('ignores a stored tenant base domain in favour of configuration', async () => {
    const service = new TenantProvisioningService(
      {
        platformSetting: {
          findUnique: jest.fn().mockResolvedValue({
            value: {
              wildcardDnsReady: true,
              // A retired key left behind by an older save.
              tenantBaseDomain: 'stale.example.invalid',
              defaultProtocol: 'http',
            },
          }),
        },
      } as never,
      { createSystemDomain: jest.fn() } as never,
      { record: jest.fn() } as never,
    );

    const settings = await service.settings();

    const fromConfig = getPlatformDomainConfig();
    expect(settings.tenantBaseDomain).not.toBe('stale.example.invalid');
    expect(settings.tenantBaseDomain).toBe(fromConfig.tenantBaseDomain);
    expect(settings.defaultProtocol).toBe(
      fromConfig.protocol === 'http' ? 'http' : 'https',
    );
    // The one key that is genuinely stored is still read.
    expect(settings.wildcardDnsReady).toBe(true);
  });
});
