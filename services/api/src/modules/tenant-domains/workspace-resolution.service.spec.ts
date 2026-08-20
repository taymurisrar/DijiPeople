import { TenantStatus } from '@prisma/client';
import { WorkspaceResolutionService } from './workspace-resolution.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/**
 * Routing decisions a visitor experiences, and the isolation check that runs on
 * every authenticated request. The cases that matter are the ones where a valid
 * session meets a hostname it is not entitled to, and where a workspace that is
 * not live must not be rendered.
 */
describe('WorkspaceResolutionService', () => {
  const ENV_KEYS = [
    'PLATFORM_ENVIRONMENT',
    'TENANT_BASE_DOMAIN',
    'PUBLIC_BASE_DOMAIN',
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

  const resolution = (
    overrides: {
      tenantId?: string;
      status?: TenantStatus;
      environmentType?: string;
      slug?: string;
      isPrimary?: boolean;
      redirectToHostname?: string | null;
    } = {},
  ) => ({
    tenantId: overrides.tenantId ?? 'tenant-1',
    tenant: {
      id: overrides.tenantId ?? 'tenant-1',
      name: 'Maseer',
      displayName: 'Maseer Group',
      slug: overrides.slug ?? 'maseer',
      status: overrides.status ?? TenantStatus.ACTIVE,
      environmentType: overrides.environmentType ?? 'PRODUCTION',
      customerAccountId: 'customer-1',
    },
    domain: {
      id: 'domain-1',
      hostname: 'maseer.dijipeople.com',
      type: 'SYSTEM_SUBDOMAIN',
      isPrimary: overrides.isPrimary ?? true,
      verificationStatus: 'VERIFIED',
      tlsStatus: 'ACTIVE',
    },
    redirectToHostname: overrides.redirectToHostname ?? null,
  });

  const makeService = (
    resolveHostname: jest.Mock,
    prisma: Record<string, unknown> = {},
  ) =>
    new WorkspaceResolutionService(
      prisma as never,
      {
        resolveHostname,
        getPrimaryDomain: jest.fn(),
        getWorkspaceUrl: jest.fn(),
      } as never,
    );

  it('serves an active workspace', async () => {
    const service = makeService(jest.fn().mockResolvedValue(resolution()));
    const route = await service.resolveRoute('maseer.dijipeople.com');
    expect(route.outcome).toBe('WORKSPACE');
    expect(route.workspace?.tenantId).toBe('tenant-1');
  });

  it('treats the platform app host as discovery, not as a workspace', async () => {
    const resolveHostname = jest.fn();
    const service = makeService(resolveHostname);
    const route = await service.resolveRoute('app.dijipeople.com');
    expect(route.outcome).toBe('PLATFORM_DISCOVERY');
    expect(route.workspace).toBeNull();
    expect(resolveHostname).not.toHaveBeenCalled();
  });

  it('reports an unknown hostname as not found and reveals nothing else', async () => {
    const service = makeService(jest.fn().mockResolvedValue(null));
    const route = await service.resolveRoute('nobody.dijipeople.com');
    expect(route.outcome).toBe('NOT_FOUND');
    expect(route.workspace).toBeNull();
    /* No hint about whether the name was ever associated with a customer. */
    expect(route.message).toBe('Workspace not found.');
  });

  it('distinguishes suspended, preparing and unavailable from not found', async () => {
    const cases: Array<[TenantStatus, string]> = [
      [TenantStatus.SUSPENDED, 'SUSPENDED'],
      [TenantStatus.PROVISIONING, 'PREPARING'],
      [TenantStatus.PENDING_SETUP, 'PREPARING'],
      [TenantStatus.PROVISIONING_FAILED, 'PREPARING'],
      [TenantStatus.ONBOARDING, 'PREPARING'],
      [TenantStatus.INACTIVE, 'UNAVAILABLE'],
      [TenantStatus.DECOMMISSIONED, 'UNAVAILABLE'],
      [TenantStatus.ARCHIVED, 'UNAVAILABLE'],
      [TenantStatus.CHURNED, 'UNAVAILABLE'],
    ];
    for (const [status, expected] of cases) {
      const service = makeService(
        jest.fn().mockResolvedValue(resolution({ status })),
      );
      const route = await service.resolveRoute('maseer.dijipeople.com');
      expect([status, route.outcome]).toEqual([status, expected]);
    }
  });

  it('every tenant status is mapped, so a new one cannot silently render a workspace', () => {
    /*
     * If a status is added to the enum without a mapping, the fallback is
     * UNAVAILABLE rather than WORKSPACE. This asserts that the fallback is the
     * closed one — an unmapped status must never resolve to a served workspace.
     */
    const statuses = Object.values(TenantStatus);
    expect(statuses.length).toBeGreaterThan(0);
    return Promise.all(
      statuses.map(async (status) => {
        const service = makeService(
          jest.fn().mockResolvedValue(resolution({ status })),
        );
        const route = await service.resolveRoute('maseer.dijipeople.com');
        if (status !== TenantStatus.ACTIVE) {
          expect([status, route.outcome === 'WORKSPACE']).toEqual([
            status,
            false,
          ]);
        }
      }),
    );
  });

  it('redirects a secondary hostname only when the workspace is live', async () => {
    const live = makeService(
      jest.fn().mockResolvedValue(
        resolution({
          isPrimary: false,
          redirectToHostname: 'hr.maseergroup.com',
        }),
      ),
    );
    expect((await live.resolveRoute('maseer.dijipeople.com')).outcome).toBe(
      'REDIRECT',
    );

    const suspended = makeService(
      jest.fn().mockResolvedValue(
        resolution({
          isPrimary: false,
          redirectToHostname: 'hr.maseergroup.com',
          status: TenantStatus.SUSPENDED,
        }),
      ),
    );
    /* A hop into a page that cannot serve them helps nobody. */
    expect(
      (await suspended.resolveRoute('maseer.dijipeople.com')).outcome,
    ).toBe('SUSPENDED');
  });

  describe('assertUserMayUseHostname', () => {
    const user = {
      userId: 'user-1',
      tenantId: 'tenant-1',
    } as AuthenticatedUser;

    it('allows a session on its own workspace hostname', async () => {
      const service = makeService(jest.fn().mockResolvedValue(resolution()));
      await expect(
        service.assertUserMayUseHostname(user, 'maseer.dijipeople.com'),
      ).resolves.toMatchObject({ allowed: true });
    });

    it('refuses a valid session presented on another tenant hostname', async () => {
      /*
       * The core isolation check. A session proves who someone is, never which
       * workspace they may render — without this, a Maseer user who navigates
       * to another customer's hostname is served that customer's workspace.
       */
      const service = makeService(
        jest.fn().mockResolvedValue(resolution({ tenantId: 'tenant-2' })),
      );
      await expect(
        service.assertUserMayUseHostname(user, 'other.dijipeople.com'),
      ).resolves.toMatchObject({ allowed: false, reason: 'WRONG_WORKSPACE' });
    });

    it('refuses a production session on the same customer UAT workspace', async () => {
      /*
       * Environments are separate tenants. Sharing a session across them would
       * let test activity land in production data, or the reverse.
       */
      const service = makeService(
        jest.fn().mockResolvedValue(
          resolution({
            tenantId: 'tenant-1-uat',
            slug: 'maseer-uat',
            environmentType: 'UAT',
          }),
        ),
      );
      await expect(
        service.assertUserMayUseHostname(user, 'maseer-uat.dijipeople.com'),
      ).resolves.toMatchObject({ allowed: false, reason: 'WRONG_WORKSPACE' });
    });

    it('refuses an unknown hostname', async () => {
      const service = makeService(jest.fn().mockResolvedValue(null));
      await expect(
        service.assertUserMayUseHostname(user, 'nobody.dijipeople.com'),
      ).resolves.toMatchObject({ allowed: false, reason: 'NOT_FOUND' });
    });

    it('refuses the right tenant when its lifecycle does not permit serving', async () => {
      const service = makeService(
        jest
          .fn()
          .mockResolvedValue(resolution({ status: TenantStatus.SUSPENDED })),
      );
      await expect(
        service.assertUserMayUseHostname(user, 'maseer.dijipeople.com'),
      ).resolves.toMatchObject({ allowed: false, reason: 'LIFECYCLE' });
    });

    it('allows the discovery host, which belongs to no tenant', async () => {
      const service = makeService(jest.fn());
      await expect(
        service.assertUserMayUseHostname(user, 'app.dijipeople.com'),
      ).resolves.toMatchObject({ allowed: true });
    });
  });

  describe('listWorkspacesForUser', () => {
    const user = {
      userId: 'user-1',
      tenantId: 'tenant-1',
    } as AuthenticatedUser;

    /**
     * A Prisma double shaped like the identity-aware lookup.
     *
     * These tests used to hand over a single `tenant.findUnique`, because the
     * method read `user.tenantId` from the session and could only ever return
     * one workspace. That was the defect, not the test — ITEM-0062. The double
     * changed with the implementation.
     */
    function makeWorkspaceService(options: {
      identityId?: string | null;
      memberships?: { tenantId: string }[];
      tenants: Array<Record<string, unknown>>;
      domain?: string | null;
    }) {
      return new WorkspaceResolutionService(
        {
          user: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ identityId: options.identityId ?? null }),
            findMany: jest.fn().mockResolvedValue(options.memberships ?? []),
          },
          tenant: {
            findMany: jest.fn().mockResolvedValue(options.tenants),
          },
        } as never,
        {
          getPrimaryDomain: jest
            .fn()
            .mockResolvedValue(
              options.domain === null
                ? null
                : { domain: options.domain ?? 'maseer.dijipeople.com' },
            ),
          getWorkspaceUrl: jest
            .fn()
            .mockResolvedValue('https://maseer.dijipeople.com/'),
        } as never,
      );
    }

    const maseer = {
      id: 'tenant-1',
      name: 'Maseer',
      displayName: 'Maseer Group',
      slug: 'maseer',
      status: TenantStatus.ACTIVE,
      environmentType: 'PRODUCTION',
    };

    it('offers a live workspace as the default destination', async () => {
      const service = makeWorkspaceService({ tenants: [maseer] });

      const result = await service.listWorkspacesForUser(user);
      expect(result.workspaces).toHaveLength(1);
      expect(result.defaultWorkspace?.tenantId).toBe('tenant-1');
    });

    it('lists a suspended workspace but does not offer it as a destination', async () => {
      /* Redirecting into it produces a login loop against a refusing tenant. */
      const service = makeWorkspaceService({
        tenants: [{ ...maseer, status: TenantStatus.SUSPENDED }],
        domain: null,
      });

      const result = await service.listWorkspacesForUser(user);
      expect(result.workspaces[0].canOpen).toBe(false);
      expect(result.workspaces[0].unavailableReason).toBeTruthy();
      expect(result.defaultWorkspace).toBeNull();
    });

    it('returns nothing when the session names a tenant that no longer exists', async () => {
      const service = makeWorkspaceService({ tenants: [] });
      await expect(service.listWorkspacesForUser(user)).resolves.toEqual({
        workspaces: [],
        defaultWorkspace: null,
      });
    });

    it('lists every workspace the identity reaches, not just the session tenant', async () => {
      /*
       * The assertion this whole parent exists for. Before TASK-0009 this
       * method returned a one-element array *by construction* — it read
       * `user.tenantId` and looked up that tenant — so the workspace picker had
       * nothing to pick from and the switcher had nowhere to switch to.
       */
      const service = makeWorkspaceService({
        identityId: 'identity-1',
        memberships: [{ tenantId: 'tenant-1' }, { tenantId: 'tenant-2' }],
        tenants: [
          maseer,
          {
            id: 'tenant-2',
            name: 'Subsidiary',
            displayName: null,
            slug: 'subsidiary',
            status: TenantStatus.ACTIVE,
            environmentType: 'PRODUCTION',
          },
        ],
      });

      const result = await service.listWorkspacesForUser(user);

      expect(result.workspaces.map((w) => w.slug).sort()).toEqual([
        'maseer',
        'subsidiary',
      ]);
      // The one the session is already in, so a picker does not move somebody
      // out of the workspace they are standing in.
      expect(result.defaultWorkspace?.tenantId).toBe('tenant-1');
      expect(
        result.workspaces.find((w) => w.tenantId === 'tenant-1')?.isCurrent,
      ).toBe(true);
    });

    it('sorts openable workspaces first, then by name', async () => {
      /*
       * Stable ordering matters more than it sounds: this list is a menu
       * somebody uses repeatedly, and a picker that reshuffles between visits
       * defeats the muscle memory that makes it fast.
       */
      const service = makeWorkspaceService({
        identityId: 'identity-1',
        memberships: [
          { tenantId: 'tenant-1' },
          { tenantId: 'tenant-2' },
          { tenantId: 'tenant-3' },
        ],
        tenants: [
          {
            id: 'tenant-3',
            name: 'Zulu',
            displayName: null,
            slug: 'zulu',
            status: TenantStatus.ACTIVE,
            environmentType: 'PRODUCTION',
          },
          { ...maseer, status: TenantStatus.SUSPENDED },
          {
            id: 'tenant-2',
            name: 'Alpha',
            displayName: null,
            slug: 'alpha',
            status: TenantStatus.ACTIVE,
            environmentType: 'PRODUCTION',
          },
        ],
      });

      const result = await service.listWorkspacesForUser(user);

      expect(result.workspaces.map((w) => w.slug)).toEqual([
        'alpha',
        'zulu',
        'maseer',
      ]);
      // The session's own workspace is suspended, so the default falls to the
      // first that can actually be opened rather than to nothing.
      expect(result.defaultWorkspace?.slug).toBe('alpha');
    });

    it('falls back to the session tenant when the row has no identity yet', async () => {
      /*
       * `identityId` is nullable until the contract phase. Somebody signed in
       * perfectly well must not be handed an empty picker because a backfill
       * has not reached their row.
       */
      const findMany = jest.fn().mockResolvedValue([]);
      const service = new WorkspaceResolutionService(
        {
          user: {
            findUnique: jest.fn().mockResolvedValue({ identityId: null }),
            findMany,
          },
          tenant: { findMany: jest.fn().mockResolvedValue([maseer]) },
        } as never,
        {
          getPrimaryDomain: jest
            .fn()
            .mockResolvedValue({ domain: 'maseer.dijipeople.com' }),
          getWorkspaceUrl: jest
            .fn()
            .mockResolvedValue('https://maseer.dijipeople.com/'),
        } as never,
      );

      const result = await service.listWorkspacesForUser(user);

      expect(result.workspaces).toHaveLength(1);
      expect(result.defaultWorkspace?.tenantId).toBe('tenant-1');
      // No membership query at all — there is no identity to query by.
      expect(findMany).not.toHaveBeenCalled();
    });

    it('does not list a workspace the person has been disabled in', async () => {
      /*
       * `User.status` stays per tenant on purpose: disabled at one workspace
       * says nothing about the others. The membership query filters on it, so
       * a revoked account disappears from the picker rather than offering a
       * door that refuses them.
       */
      const findMany = jest.fn().mockResolvedValue([{ tenantId: 'tenant-1' }]);
      const service = new WorkspaceResolutionService(
        {
          user: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ identityId: 'identity-1' }),
            findMany,
          },
          tenant: { findMany: jest.fn().mockResolvedValue([maseer]) },
        } as never,
        {
          getPrimaryDomain: jest
            .fn()
            .mockResolvedValue({ domain: 'maseer.dijipeople.com' }),
          getWorkspaceUrl: jest
            .fn()
            .mockResolvedValue('https://maseer.dijipeople.com/'),
        } as never,
      );

      await service.listWorkspacesForUser(user);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            identityId: 'identity-1',
            status: { not: 'DISABLED' },
          }),
        }),
      );
    });
  });
});
