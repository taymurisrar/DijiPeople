import { BadRequestException, ConflictException } from '@nestjs/common';
import { TenantDomainService } from './tenant-domain.service';

/**
 * Hostname → tenant is the point where isolation is decided. These tests cover
 * the ways it can go wrong: resolving a hostname nobody created, resolving a
 * platform hostname to a tenant, serving a disabled hostname, letting a tenant
 * claim a name another tenant holds, and promoting an unverified hostname to
 * primary so every generated link points at a name that does not resolve.
 */
describe('TenantDomainService', () => {
  const ENV_KEYS = [
    'TENANT_BASE_DOMAIN',
    'PLATFORM_ENVIRONMENT',
    'PUBLIC_BASE_DOMAIN',
    'APP_HOST',
    'ADMIN_HOST',
    'API_HOST',
  ] as const;
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    process.env.PLATFORM_ENVIRONMENT = 'production';
    process.env.TENANT_BASE_DOMAIN = 'dijipeople.com';
    process.env.PUBLIC_BASE_DOMAIN = 'dijipeople.com';
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  const tenant = {
    id: 'tenant-1',
    name: 'Maseer',
    displayName: 'Maseer Group',
    slug: 'maseer',
    status: 'ACTIVE',
    environmentType: 'PRODUCTION',
    customerAccountId: 'customer-1',
  };

  const makeService = (prisma: Record<string, unknown>) =>
    new TenantDomainService(prisma as never);

  describe('resolveHostname', () => {
    it('resolves an exact hostname to its tenant', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        id: 'domain-1',
        domain: 'maseer.dijipeople.com',
        type: 'SYSTEM_SUBDOMAIN',
        isPrimary: true,
        verificationStatus: 'VERIFIED',
        tlsStatus: 'ACTIVE',
        tenant,
      });
      const service = makeService({ tenantDomain: { findUnique } });

      const result = await service.resolveHostname('MASEER.DijiPeople.com:443');

      expect(result?.tenantId).toBe('tenant-1');
      expect(result?.redirectToHostname).toBeNull();
      /* Normalized before the lookup — the unique index stores lowercase. */
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { domain: 'maseer.dijipeople.com' } }),
      );
    });

    it('returns null for a hostname no tenant registered, rather than falling back', async () => {
      /*
       * The failure this prevents: a default-tenant fallback serving one
       * customer's workspace to a request for a hostname that does not exist.
       */
      const service = makeService({
        tenantDomain: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      expect(
        await service.resolveHostname('unknown.dijipeople.com'),
      ).toBeNull();
    });

    it('never resolves a platform hostname to a tenant, even if a row exists', async () => {
      const findUnique = jest.fn();
      const service = makeService({ tenantDomain: { findUnique } });

      expect(await service.resolveHostname('admin.dijipeople.com')).toBeNull();
      expect(await service.resolveHostname('api.dijipeople.com')).toBeNull();
      /* Short-circuited before any query — the database cannot override this. */
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('refuses a disabled hostname', async () => {
      const service = makeService({
        tenantDomain: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'domain-2',
            domain: 'old.maseergroup.com',
            type: 'CUSTOM_DOMAIN',
            isPrimary: false,
            verificationStatus: 'DISABLED',
            tlsStatus: 'NOT_REQUIRED',
            tenant,
          }),
        },
      });
      expect(await service.resolveHostname('old.maseergroup.com')).toBeNull();
    });

    it('redirects a secondary hostname to the verified primary', async () => {
      const service = makeService({
        tenantDomain: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'domain-2',
            domain: 'maseer.dijipeople.com',
            type: 'SYSTEM_SUBDOMAIN',
            isPrimary: false,
            verificationStatus: 'VERIFIED',
            tlsStatus: 'ACTIVE',
            tenant,
          }),
          findFirst: jest
            .fn()
            .mockResolvedValue({ domain: 'hr.maseergroup.com' }),
        },
      });

      const result = await service.resolveHostname('maseer.dijipeople.com');
      expect(result?.redirectToHostname).toBe('hr.maseergroup.com');
    });

    it('does not redirect a hostname to itself', async () => {
      /* A self-redirect is an infinite loop at the edge. */
      const service = makeService({
        tenantDomain: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'domain-2',
            domain: 'maseer.dijipeople.com',
            type: 'SYSTEM_SUBDOMAIN',
            isPrimary: false,
            verificationStatus: 'VERIFIED',
            tlsStatus: 'ACTIVE',
            tenant,
          }),
          findFirst: jest
            .fn()
            .mockResolvedValue({ domain: 'maseer.dijipeople.com' }),
        },
      });

      const result = await service.resolveHostname('maseer.dijipeople.com');
      expect(result?.redirectToHostname).toBeNull();
    });
  });

  describe('validateSlug', () => {
    it('rejects a slug another tenant already holds', async () => {
      const service = makeService({
        tenant: {
          findUnique: jest.fn().mockResolvedValue({ id: 'other-tenant' }),
        },
        tenantDomain: { findUnique: jest.fn() },
      });
      await expect(service.validateSlug('maseer')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a slug whose hostname another tenant already holds', async () => {
      /*
       * Checking only the tenant table is not enough: a custom domain can occupy
       * the hostname a free slug would produce, and provisioning would then fail
       * after the tenant row was created.
       */
      const service = makeService({
        tenant: { findUnique: jest.fn().mockResolvedValue(null) },
        tenantDomain: {
          findUnique: jest.fn().mockResolvedValue({ tenantId: 'other-tenant' }),
        },
      });
      await expect(service.validateSlug('maseer')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects reserved labels', async () => {
      const service = makeService({
        tenant: { findUnique: jest.fn().mockResolvedValue(null) },
        tenantDomain: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      for (const reserved of ['admin', 'api', 'app', 'www']) {
        await expect(service.validateSlug(reserved)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
    });

    it('returns the hostname and URL a valid slug would receive', async () => {
      const service = makeService({
        tenant: { findUnique: jest.fn().mockResolvedValue(null) },
        tenantDomain: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      await expect(service.validateSlug('Maseer')).resolves.toEqual({
        slug: 'maseer',
        hostname: 'maseer.dijipeople.com',
        url: 'https://maseer.dijipeople.com/',
      });
    });
  });

  describe('validateHostname', () => {
    const service = () =>
      makeService({
        tenantDomain: { findUnique: jest.fn().mockResolvedValue(null) },
      });

    it('refuses platform hostnames', async () => {
      await expect(
        service().validateHostname('admin.dijipeople.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses hostnames under the platform workspace domain', async () => {
      /*
       * Those are issued by the platform. Letting a tenant "add" one as a custom
       * domain would be a way to claim another tenant's future address.
       */
      await expect(
        service().validateHostname('someoneelse.dijipeople.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a hostname another tenant already holds, without naming them', async () => {
      const svc = makeService({
        tenantDomain: {
          findUnique: jest.fn().mockResolvedValue({ tenantId: 'other-tenant' }),
        },
      });
      await expect(
        svc.validateHostname('hr.maseergroup.com', {
          excludeTenantId: 'tenant-1',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TENANT_HOSTNAME_TAKEN' }),
      });
    });

    it('accepts a hostname the customer genuinely controls', async () => {
      await expect(
        service().validateHostname('HR.MaseerGroup.com'),
      ).resolves.toBe('hr.maseergroup.com');
    });
  });

  describe('addCustomDomain', () => {
    it('starts pending with a verification token and is never primary', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'domain-3' });
      const service = makeService({
        tenantDomain: { findUnique: jest.fn().mockResolvedValue(null), create },
      });

      await service.addCustomDomain({
        tenantId: 'tenant-1',
        hostname: 'hr.maseergroup.com',
      });

      const data = create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        tenantId: 'tenant-1',
        domain: 'hr.maseergroup.com',
        type: 'CUSTOM_DOMAIN',
        isPrimary: false,
        verificationStatus: 'PENDING',
      });
      expect(String(data.verificationToken)).toMatch(
        /^dijipeople-domain-verification=[0-9a-f]{48}$/,
      );
    });
  });

  describe('attemptCustomDomainVerification', () => {
    it('does not claim verification the platform cannot perform', async () => {
      /*
       * There is no DNS resolver integration here. Returning verified: true
       * would put a tenant live on a hostname whose control was never proven.
       */
      const update = jest.fn().mockResolvedValue({});
      const service = makeService({
        tenantDomain: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'domain-3',
            domain: 'hr.maseergroup.com',
            type: 'CUSTOM_DOMAIN',
            verificationToken: 'dijipeople-domain-verification=abc',
          }),
          update,
        },
      });

      const result = await service.attemptCustomDomainVerification({
        tenantId: 'tenant-1',
        domainId: 'domain-3',
      });

      expect(result.verified).toBe(false);
      expect(result.expectedRecord).toMatchObject({
        type: 'TXT',
        name: '_dijipeople-challenge.hr.maseergroup.com',
      });
      expect(update).toHaveBeenCalled();
    });
  });

  describe('setPrimaryDomain', () => {
    it('refuses to promote an unverified custom domain', async () => {
      const service = makeService({
        tenantDomain: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'domain-3',
            domain: 'hr.maseergroup.com',
            type: 'CUSTOM_DOMAIN',
            verificationStatus: 'PENDING',
            isPrimary: false,
          }),
        },
      });

      await expect(
        service.setPrimaryDomain({
          tenantId: 'tenant-1',
          domainId: 'domain-3',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to promote a disabled hostname', async () => {
      const service = makeService({
        tenantDomain: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'domain-3',
            domain: 'old.maseergroup.com',
            type: 'CUSTOM_DOMAIN',
            verificationStatus: 'DISABLED',
            isPrimary: false,
          }),
        },
      });

      await expect(
        service.setPrimaryDomain({
          tenantId: 'tenant-1',
          domainId: 'domain-3',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('demotes the existing primary in the same transaction', async () => {
      /*
       * A partial unique index enforces one primary per tenant, so the demotion
       * and the promotion have to happen together or the write fails.
       */
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const update = jest.fn().mockResolvedValue({});
      const tenantDomain = {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'domain-3',
            domain: 'hr.maseergroup.com',
            type: 'CUSTOM_DOMAIN',
            verificationStatus: 'VERIFIED',
            isPrimary: false,
          })
          .mockResolvedValueOnce({ domain: 'maseer.dijipeople.com' }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany,
        update,
      };
      const service = makeService({
        tenantDomain,
        $transaction: (work: (tx: unknown) => Promise<unknown>) =>
          work({ tenantDomain }),
      });

      const result = await service.setPrimaryDomain({
        tenantId: 'tenant-1',
        domainId: 'domain-3',
      });

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', isPrimary: true },
        }),
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isPrimary: true }),
        }),
      );
      expect(result).toMatchObject({
        previousPrimary: 'maseer.dijipeople.com',
        newPrimary: 'hr.maseergroup.com',
        changed: true,
      });
    });
  });

  describe('disableDomain', () => {
    it('refuses to disable the primary hostname', async () => {
      /* Disabling the primary would leave the workspace with no address. */
      const service = makeService({
        tenantDomain: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'domain-1', isPrimary: true }),
        },
      });

      await expect(
        service.disableDomain({ tenantId: 'tenant-1', domainId: 'domain-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createSystemDomain', () => {
    const upsertingPrisma = (wildcardDnsReady: boolean) => {
      const upsert = jest.fn().mockResolvedValue({ id: 'domain-1' });
      return {
        prisma: {
          platformSetting: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ value: { wildcardDnsReady } }),
          },
          tenantDomain: {
            findUnique: jest.fn().mockResolvedValue(null),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            upsert,
          },
        },
        upsert,
      };
    };

    it('stays pending until the platform wildcard is confirmed ready', async () => {
      const { prisma, upsert } = upsertingPrisma(false);
      await makeService(prisma).createSystemDomain({
        tenantId: 'tenant-1',
        slug: 'maseer',
      });
      expect(upsert.mock.calls[0][0].create).toMatchObject({
        domain: 'maseer.dijipeople.com',
        verificationStatus: 'PENDING',
        tlsStatus: 'PENDING',
      });
    });

    it('is verified once the platform wildcard is ready', async () => {
      const { prisma, upsert } = upsertingPrisma(true);
      await makeService(prisma).createSystemDomain({
        tenantId: 'tenant-1',
        slug: 'maseer',
      });
      expect(upsert.mock.calls[0][0].create).toMatchObject({
        verificationStatus: 'VERIFIED',
        tlsStatus: 'ACTIVE',
      });
    });

    it('refuses a hostname another tenant already holds', async () => {
      const { prisma } = upsertingPrisma(true);
      prisma.tenantDomain.findUnique = jest
        .fn()
        .mockResolvedValue({ id: 'x', tenantId: 'other-tenant' });

      await expect(
        makeService(prisma).createSystemDomain({
          tenantId: 'tenant-1',
          slug: 'maseer',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  /**
   * The stamp that could never change.
   *
   * `createSystemDomain` reads `wildcardDnsReady` **once**, at the moment it
   * issues a hostname, and writes PENDING/PENDING when it is false. Nothing
   * re-reads it, and nothing probes DNS per tenant — so a hostname issued
   * before the platform setting was confirmed stayed "Pending" for ever, on
   * workspaces that were by then resolving perfectly. Reported as "the status
   * say pending. Is it automated or manual?", which the screen could not
   * answer because the answer was "neither: it will never change".
   */
  describe('reconcileSystemDomainsAfterWildcardDns', () => {
    const reconcilingPrisma = (wildcardDnsReady: boolean) => {
      const updateMany = jest.fn().mockResolvedValue({ count: 3 });
      return {
        prisma: {
          platformSetting: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ value: { wildcardDnsReady } }),
          },
          tenantDomain: { updateMany },
        },
        updateMany,
      };
    };

    it('promotes the subdomains stamped before the confirmation', async () => {
      const { prisma, updateMany } = reconcilingPrisma(true);

      const result =
        await makeService(prisma).reconcileSystemDomainsAfterWildcardDns(
          'operator-1',
        );

      expect(result.promoted).toBe(3);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verificationStatus: 'VERIFIED',
            tlsStatus: 'ACTIVE',
          }),
        }),
      );
    });

    it('does nothing while wildcard DNS is still unconfirmed', async () => {
      /*
       * The guard that stops this becoming a way to mark hostnames verified
       * without anybody having verified anything.
       */
      const { prisma, updateMany } = reconcilingPrisma(false);

      const result =
        await makeService(prisma).reconcileSystemDomainsAfterWildcardDns();

      expect(result.promoted).toBe(0);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('touches only system subdomains, never a customer’s own domain', async () => {
      /*
       * The important restriction. A custom domain is verified against records
       * the customer controls, and the platform wildcard says nothing about it
       * — promoting one would assert something nobody checked.
       */
      const { prisma, updateMany } = reconcilingPrisma(true);

      await makeService(prisma).reconcileSystemDomainsAfterWildcardDns();

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'SYSTEM_SUBDOMAIN' }),
        }),
      );
    });

    it('only touches rows that are actually pending', async () => {
      // A verified domain must not have its `verifiedAt` rewritten to today by
      // an unrelated settings save.
      const { prisma, updateMany } = reconcilingPrisma(true);

      await makeService(prisma).reconcileSystemDomainsAfterWildcardDns();

      const where = updateMany.mock.calls[0]?.[0]?.where as {
        OR?: Array<Record<string, unknown>>;
      };
      expect(where.OR).toEqual([
        { verificationStatus: 'PENDING' },
        { tlsStatus: 'PENDING' },
      ]);
    });
  });
});
