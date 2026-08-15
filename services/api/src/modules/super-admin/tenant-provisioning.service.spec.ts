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
});
