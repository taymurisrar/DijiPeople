import { TenantProvisioningService } from './tenant-provisioning.service';

describe('TenantProvisioningService', () => {
  it('creates a pending system domain without claiming wildcard readiness', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'domain-1',
      tenantId: 'tenant-1',
      domain: 'acme.digipeople.com',
      verificationStatus: 'PENDING',
      sslStatus: 'PENDING',
    });
    const events = { record: jest.fn() };
    const service = new TenantProvisioningService(
      {
        platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        tenantDomain: {
          findUnique: jest.fn().mockResolvedValue(null),
          create,
        },
      } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      events as never,
    );

    await expect(
      service.provisionSystemDomain({ tenantId: 'tenant-1', slug: 'acme' }),
    ).resolves.toMatchObject({
      domain: 'acme.digipeople.com',
      resolvedUrl: 'https://acme.digipeople.com',
      wildcardDnsReady: false,
      verificationStatus: 'PENDING',
      sslStatus: 'PENDING',
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        domain: 'acme.digipeople.com',
        type: 'SYSTEM_SUBDOMAIN',
        verificationStatus: 'PENDING',
        sslStatus: 'PENDING',
      }),
    });
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: 'TENANT_PROVISIONING_REQUESTED',
        result: 'PENDING',
      }),
    );
  });

  it('rejects a domain already assigned to another tenant', async () => {
    const service = new TenantProvisioningService(
      {
        platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        tenantDomain: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ tenantId: 'another-tenant' }),
        },
      } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      { record: jest.fn() } as never,
    );

    await expect(
      service.provisionSystemDomain({ tenantId: 'tenant-1', slug: 'acme' }),
    ).rejects.toThrow(/already assigned/i);
  });
});
