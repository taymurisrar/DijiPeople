import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StorageService } from '../../common/storage/storage.service';
import type { AuditService } from '../audit/audit.service';
import { AppReleaseService, type ReleaseViewer } from './app-release.service';

/**
 * Release visibility.
 *
 * ApplicationRelease is global, so there is no tenant filter to test. What
 * matters instead is that channel and permission gating happen inside the query,
 * making a hidden release unreachable even with a valid id.
 */
describe('AppReleaseService visibility', () => {
  let prisma: {
    applicationRelease: { findMany: jest.Mock; findFirst: jest.Mock };
  };
  let service: AppReleaseService;

  const normalUser: ReleaseViewer = {
    permissionKeys: ['appDownloads.read'],
    isPlatformUser: false,
  };
  const tenantAdmin: ReleaseViewer = {
    permissionKeys: [
      'appDownloads.read',
      'appDownloads.manage',
      'gateways.manage',
    ],
    isPlatformUser: false,
  };
  const platformUser: ReleaseViewer = {
    permissionKeys: ['appDownloads.read'],
    isPlatformUser: true,
  };

  beforeEach(() => {
    prisma = {
      applicationRelease: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    service = new AppReleaseService(
      prisma as unknown as PrismaService,
      {} as StorageService,
      {} as AuditService,
    );
  });

  /** Channels the service actually asked the database for. */
  function requestedChannels(call: 'findMany' | 'findFirst'): string[] {
    const [args] = prisma.applicationRelease[call].mock.calls;
    return args[0].where.channel.in;
  }

  describe('channel visibility', () => {
    it('shows a normal tenant user STABLE only', async () => {
      await service.list(normalUser);
      expect(requestedChannels('findMany')).toEqual(['STABLE']);
    });

    it('does NOT show a tenant administrator INTERNAL', async () => {
      await service.list(tenantAdmin);
      const channels = requestedChannels('findMany');
      expect(channels).toContain('STABLE');
      expect(channels).toContain('BETA');
      // The decisive assertion: administering a tenant is not being internal.
      expect(channels).not.toContain('INTERNAL');
    });

    it('shows a platform/support user INTERNAL', async () => {
      await service.list(platformUser);
      expect(requestedChannels('findMany')).toContain('INTERNAL');
    });

    it('returns nothing when a tenant user explicitly asks for INTERNAL', async () => {
      await service.list(tenantAdmin, { channel: 'INTERNAL' as never });
      // An impossible channel set, so the query can match nothing — and the
      // request looks like any other empty list rather than an error.
      expect(requestedChannels('findMany')).toEqual([]);
    });
  });

  describe('ID guessing', () => {
    it('cannot fetch an INTERNAL release by id as a tenant admin', async () => {
      // The row exists, but the visibility predicate excludes it, so the query
      // returns nothing.
      prisma.applicationRelease.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(tenantAdmin, 'internal-release-id'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(requestedChannels('findFirst')).not.toContain('INTERNAL');
    });

    it('cannot download an INTERNAL release by id as a tenant admin', async () => {
      prisma.applicationRelease.findFirst.mockResolvedValue(null);

      await expect(
        service.download(tenantAdmin, 'internal-release-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applies the channel filter in the query, not after it', async () => {
      await service.findOne(platformUser, 'some-id').catch(() => undefined);

      const [args] = prisma.applicationRelease.findFirst.mock.calls;
      expect(args[0].where).toEqual(
        expect.objectContaining({
          id: 'some-id',
          isActive: true,
          channel: { in: expect.arrayContaining(['STABLE']) },
        }),
      );
    });

    it('gives the same not-found for hidden, inactive and missing releases', async () => {
      prisma.applicationRelease.findFirst.mockResolvedValue(null);

      const messages: string[] = [];
      for (const viewer of [normalUser, tenantAdmin, platformUser]) {
        await service
          .findOne(viewer, 'anything')
          .catch((error: Error) => messages.push(error.message));
      }

      expect(new Set(messages).size).toBe(1);
    });
  });

  describe('per-release permission', () => {
    const gatewayRelease = {
      id: 'r1',
      appKey: 'INTEGRATION_GATEWAY',
      name: 'Gateway',
      description: null,
      version: '1.0.0',
      platform: 'WINDOWS' as const,
      architecture: 'X64' as const,
      channel: 'STABLE' as const,
      fileName: null,
      fileSizeBytes: null,
      checksumSha256: null,
      minimumSupportedVersion: null,
      releaseNotes: null,
      isActive: true,
      publishedAt: new Date(),
      requiredPermission: null,
      storageKey: 'x',
      externalUrl: null,
    };

    it('hides the gateway installer from a user without gateways.manage', async () => {
      prisma.applicationRelease.findMany.mockResolvedValue([gatewayRelease]);

      const result = await service.list(normalUser);
      expect(result.items).toHaveLength(0);
    });

    it('shows the gateway installer to a tenant admin who can manage gateways', async () => {
      prisma.applicationRelease.findMany.mockResolvedValue([gatewayRelease]);

      const result = await service.list(tenantAdmin);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].appKey).toBe('INTEGRATION_GATEWAY');
    });

    it('gates the diagnostic utility behind gateway management too', async () => {
      prisma.applicationRelease.findMany.mockResolvedValue([
        { ...gatewayRelease, id: 'r2', appKey: 'ZKTECO_DIAGNOSTIC' },
      ]);

      expect((await service.list(normalUser)).items).toHaveLength(0);
      expect((await service.list(tenantAdmin)).items).toHaveLength(1);
    });

    it('lets the desktop agent through on the general download permission', async () => {
      prisma.applicationRelease.findMany.mockResolvedValue([
        { ...gatewayRelease, id: 'r3', appKey: 'AGENT_DESKTOP' },
      ]);

      expect((await service.list(normalUser)).items).toHaveLength(1);
    });

    it('honours an explicit requiredPermission over the app default', async () => {
      prisma.applicationRelease.findMany.mockResolvedValue([
        {
          ...gatewayRelease,
          id: 'r4',
          appKey: 'AGENT_DESKTOP',
          requiredPermission: 'gateways.manage',
        },
      ]);

      expect((await service.list(normalUser)).items).toHaveLength(0);
      expect((await service.list(tenantAdmin)).items).toHaveLength(1);
    });
  });

  describe('response shape', () => {
    it('never exposes the storage key or external URL', async () => {
      prisma.applicationRelease.findMany.mockResolvedValue([
        {
          id: 'r5',
          appKey: 'AGENT_DESKTOP',
          name: 'Agent',
          description: null,
          version: '2.0.0',
          platform: 'WINDOWS' as const,
          architecture: 'X64' as const,
          channel: 'STABLE' as const,
          fileName: 'agent.exe',
          fileSizeBytes: 1024,
          checksumSha256: 'abc',
          minimumSupportedVersion: null,
          releaseNotes: null,
          isActive: true,
          publishedAt: new Date(),
          requiredPermission: null,
          storageKey: 'secret/internal/path.exe',
          externalUrl: 'https://internal.example/agent.exe',
        },
      ]);

      const result = await service.list(normalUser);
      const serialized = JSON.stringify(result.items[0]);

      expect(serialized).not.toContain('secret/internal/path.exe');
      expect(serialized).not.toContain('internal.example');
      expect(result.items[0].downloadPath).toBe('/app-releases/r5/download');
    });
  });
});

/**
 * Promotion (TASK-0026). A promotion is a NEW row in the target channel that
 * reuses the source's storage key, so the promoted channel ships the exact
 * bytes tested in the source channel, and the source stays downloadable.
 */
describe('AppReleaseService.promote', () => {
  const source = {
    id: 'src-1',
    appKey: 'AGENT_DESKTOP',
    name: 'DijiPeople Desktop Agent',
    description: null,
    version: '1.2.0',
    platform: 'WINDOWS',
    architecture: 'X64',
    channel: 'BETA',
    storageKey: 'app-releases/AGENT_DESKTOP/1.2.0/setup.exe',
    externalUrl: null,
    fileName: 'setup.exe',
    fileSizeBytes: 123,
    checksumSha256: 'abc',
    checksumSha512: 'def',
    minimumSupportedVersion: null,
    releaseNotes: null,
    requiredPermission: null,
    isActive: true,
    publishedAt: new Date(),
  };

  function build() {
    const created: Array<{ channel: string; storageKey: string | null }> = [];
    const prisma = {
      applicationRelease: {
        findUnique: jest.fn().mockResolvedValue(source),
        create: jest.fn().mockImplementation((args: { data: unknown }) => {
          created.push(
            args.data as { channel: string; storageKey: string | null },
          );
          return Promise.resolve({
            id: 'promoted-1',
            ...(args.data as object),
          });
        }),
        update: jest.fn(),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AppReleaseService(
      prisma as unknown as PrismaService,
      {} as StorageService,
      audit as unknown as AuditService,
    );
    return { service, prisma, audit, created };
  }

  const actor = { userId: 'u-1', tenantId: 'platform' } as never;

  it('creates a STABLE row that reuses the source storage key, and audits it', async () => {
    const { service, audit, created } = build();

    const result = await service.promote(actor, 'src-1', 'STABLE' as never);

    expect(created[0].channel).toBe('STABLE');
    expect(created[0].storageKey).toBe(source.storageKey);
    expect(result.channel).toBe('STABLE');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.application_release_promoted',
      }),
    );
  });

  it('is a no-op when the release is already in the target channel', async () => {
    const { service, prisma } = build();

    const result = await service.promote(actor, 'src-1', 'BETA' as never);

    expect(result.channel).toBe('BETA');
    expect(prisma.applicationRelease.create).not.toHaveBeenCalled();
  });
});

/**
 * BUG-2888 — an externally hosted AGENT_DESKTOP release had no way to carry a
 * checksumSha512, so it was accepted, listed and downloadable while the
 * update feed (`checksumSha512: { not: null }`) silently never saw it.
 *
 * These tests pin both halves of the fix: the digest now persists, and a
 * STABLE AGENT_DESKTOP release that would still leave the feed empty is
 * refused rather than silently accepted.
 */
describe('AppReleaseService.publish — BUG-2888 sha512', () => {
  function build(
    existing: {
      checksumSha256: string | null;
      checksumSha512: string | null;
    } | null = null,
  ) {
    const upserted: Array<{
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }> = [];
    const prisma = {
      applicationRelease: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest
          .fn()
          .mockImplementation(
            (args: {
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            }) => {
              upserted.push(args);
              return Promise.resolve({
                id: 'rel-1',
                ...(existing ? args.update : args.create),
              });
            },
          ),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AppReleaseService(
      prisma as unknown as PrismaService,
      {} as StorageService,
      audit as unknown as AuditService,
    );
    return { service, prisma, upserted };
  }

  const actor = { userId: 'u-1', tenantId: 'platform' } as never;

  const basePublish = {
    appKey: 'AGENT_DESKTOP',
    name: 'DijiPeople Desktop Agent',
    version: '1.1.0',
    platform: 'WINDOWS' as never,
    architecture: 'X64' as never,
    channel: 'STABLE' as never,
    externalUrl: 'https://downloads.example.com/agent-desktop/1.1.0/setup.exe',
    fileName: 'setup.exe',
    fileSizeBytes: 1024,
    checksumSha256: 'a'.repeat(64),
  };

  it('refuses a STABLE AGENT_DESKTOP release with no checksumSha512', async () => {
    const { service, prisma } = build();

    await expect(service.publish(actor, basePublish)).rejects.toMatchObject({
      errorCode: 'RELEASE_SHA512_REQUIRED',
    });
    expect(prisma.applicationRelease.upsert).not.toHaveBeenCalled();
  });

  it('accepts and persists a STABLE AGENT_DESKTOP release carrying a checksumSha512', async () => {
    const { service, upserted } = build();
    const sha512 = 'b'.repeat(128);

    const result = await service.publish(actor, {
      ...basePublish,
      checksumSha512: sha512,
    });

    expect(upserted[0].create.checksumSha512).toBe(sha512);
    expect(result.id).toBe('rel-1');
  });

  it('does not require a checksumSha512 on a BETA release, only STABLE', async () => {
    const { service, upserted } = build();

    await service.publish(actor, { ...basePublish, channel: 'BETA' as never });

    expect(upserted[0].create.checksumSha512).toBeNull();
  });

  it('does not require a checksumSha512 for other apps', async () => {
    const { service, upserted } = build();

    await service.publish(actor, {
      ...basePublish,
      appKey: 'INTEGRATION_GATEWAY',
    });

    expect(upserted[0].create.checksumSha512).toBeNull();
  });

  it('is satisfied by a checksumSha512 already on record from an earlier metadata-only republish', async () => {
    const { service, upserted } = build({
      checksumSha256: basePublish.checksumSha256,
      checksumSha512: 'c'.repeat(128),
    });

    // Re-publishing metadata (e.g. release notes) with no checksumSha512 in
    // this call must not be refused when the stored row already has one, and
    // the update must not clobber the existing digest with null.
    await service.publish(actor, {
      ...basePublish,
      releaseNotes: 'Fixed a crash',
    } as never);

    expect(upserted[0].update.checksumSha512).toBeUndefined();
  });
});
