import type { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { AppError } from '../../common/errors/app-error';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StorageService } from '../../common/storage/storage.service';
import type { AuditService } from '../audit/audit.service';
import type { ReleasePublisherIdentity } from './release-publish-token.guard';
import { ReleasePublisherService } from './release-publisher.service';

/**
 * Release publishing.
 *
 * The behaviours worth testing here are the ones that decide whether a customer
 * can trust a downloaded binary: that a version is immutable content, that the
 * checksum is computed from the bytes that arrived rather than the bytes the
 * publisher claims to have sent, that a failed registration does not leave an
 * orphan in storage, and that publishing to production cannot happen by
 * accident.
 */
describe('ReleasePublisherService', () => {
  const ARTIFACT = Buffer.from('a self-contained gateway package, pretend');
  const ARTIFACT_SHA = createHash('sha256').update(ARTIFACT).digest('hex');
  const OTHER_ARTIFACT = Buffer.from('a DIFFERENT build of the same version');

  const actor: ReleasePublisherIdentity = {
    actorLabel: 'cli:test@runner',
    credentialFingerprint: 'abc123def456',
  };

  let prisma: {
    applicationRelease: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let storage: {
    saveFile: jest.Mock;
    fileExists: jest.Mock;
    deleteFile: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let service: ReleasePublisherService;
  let originalEnvironment: string | undefined;

  function storedRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'release-1',
      appKey: 'INTEGRATION_GATEWAY',
      name: 'DijiPeople Integration Gateway',
      description: null,
      version: '2.0.0',
      platform: 'WINDOWS',
      architecture: 'X64',
      channel: 'BETA',
      storageKey: 'app-releases/INTEGRATION_GATEWAY/2-0-0/pkg.zip',
      externalUrl: null,
      fileName: 'DijiPeople.IntegrationGateway-2.0.0-win-x64.zip',
      fileSizeBytes: ARTIFACT.byteLength,
      checksumSha256: ARTIFACT_SHA,
      minimumSupportedVersion: null,
      releaseNotes: null,
      requiredPermission: 'gateways.manage',
      isActive: true,
      publishedAt: new Date('2026-08-15T00:00:00.000Z'),
      ...overrides,
    };
  }

  function publishInput(overrides: Record<string, unknown> = {}) {
    return {
      appKey: 'integration-gateway',
      version: '2.0.0',
      channel: 'BETA' as never,
      fileName: 'DijiPeople.IntegrationGateway-2.0.0-win-x64.zip',
      artifact: ARTIFACT,
      targetEnvironment: 'development',
      ...overrides,
    };
  }

  beforeEach(() => {
    originalEnvironment = process.env.PLATFORM_ENVIRONMENT;
    process.env.PLATFORM_ENVIRONMENT = 'development';

    prisma = {
      applicationRelease: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(storedRow()),
        update: jest.fn().mockResolvedValue(storedRow()),
      },
    };
    storage = {
      saveFile: jest.fn().mockResolvedValue({
        storageKey: 'app-releases/INTEGRATION_GATEWAY/2-0-0/pkg.zip',
        absolutePath: '/tmp/pkg.zip',
        size: ARTIFACT.byteLength,
      }),
      fileExists: jest.fn().mockResolvedValue(true),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ReleasePublisherService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      audit as unknown as AuditService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    if (originalEnvironment === undefined) {
      delete process.env.PLATFORM_ENVIRONMENT;
    } else {
      process.env.PLATFORM_ENVIRONMENT = originalEnvironment;
    }
  });

  /** The AppError code a rejected call carried. */
  async function codeOf(promise: Promise<unknown>) {
    try {
      await promise;
      return 'NO_ERROR_THROWN';
    } catch (error) {
      return error instanceof AppError ? error.errorCode : `${String(error)}`;
    }
  }

  // ------------------------------------------------------------ happy path

  describe('successful publish', () => {
    it('uploads, registers and reports the release', async () => {
      // Read-back for verification returns what was just created.
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce(storedRow()); // verification

      const result = await service.publish(publishInput(), actor);

      expect(result.outcome).toBe('PUBLISHED');
      expect(storage.saveFile).toHaveBeenCalledTimes(1);
      expect(prisma.applicationRelease.create).toHaveBeenCalledTimes(1);
      expect(result.release.downloadPath).toBe(
        '/app-releases/release-1/download',
      );
      expect(result.artifactAvailable).toBe(true);
    });

    it('computes the checksum from the bytes that arrived', async () => {
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedRow());

      await service.publish(publishInput(), actor);

      const [{ data }] = prisma.applicationRelease.create.mock.calls[0];
      expect(data.checksumSha256).toBe(ARTIFACT_SHA);
      expect(data.fileSizeBytes).toBe(ARTIFACT.byteLength);
    });

    it('fills name and description from the platform catalogue, not the caller', async () => {
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedRow());

      await service.publish(publishInput(), actor);

      const [{ data }] = prisma.applicationRelease.create.mock.calls[0];
      expect(data.name).toBe('DijiPeople Integration Gateway');
      expect(data.requiredPermission).toBe('gateways.manage');
    });

    it('records the publish in the PLATFORM audit trail without the credential', async () => {
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedRow());

      await service.publish(publishInput(), actor);

      const [entry] = audit.log.mock.calls[0];
      expect(entry.tenantId).toBe('platform');
      expect(entry.action).toBe('platform.application_release_published');
      expect(entry.afterSnapshot.actorLabel).toBe('cli:test@runner');
      expect(entry.afterSnapshot.credentialFingerprint).toBe('abc123def456');
      expect(JSON.stringify(entry)).not.toContain('RELEASE_PUBLISH_TOKEN');
    });

    it('does not assign the release to any tenant', async () => {
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedRow());

      await service.publish(publishInput(), actor);

      // Publishing and assignment are separate concepts: TenantAppAssignment
      // decides eligibility, and a publish must never write one.
      const [{ data }] = prisma.applicationRelease.create.mock.calls[0];
      expect(data).not.toHaveProperty('tenantAssignments');
      expect(data).not.toHaveProperty('tenantId');
    });
  });

  // -------------------------------------------------------------- duplicates

  describe('duplicate protection', () => {
    it('is idempotent when the same artefact is published twice', async () => {
      prisma.applicationRelease.findUnique.mockResolvedValueOnce(storedRow());

      const result = await service.publish(publishInput(), actor);

      expect(result.outcome).toBe('ALREADY_PUBLISHED');
      expect(storage.saveFile).not.toHaveBeenCalled();
      expect(prisma.applicationRelease.create).not.toHaveBeenCalled();
    });

    it('rejects a DIFFERENT artefact under the same version', async () => {
      prisma.applicationRelease.findUnique.mockResolvedValueOnce(storedRow());

      const code = await codeOf(
        service.publish(publishInput({ artifact: OTHER_ARTIFACT }), actor),
      );

      expect(code).toBe('RELEASE_VERSION_CONFLICT');
      // The decisive assertion: a released binary is never silently replaced.
      expect(storage.saveFile).not.toHaveBeenCalled();
      expect(prisma.applicationRelease.create).not.toHaveBeenCalled();
      expect(prisma.applicationRelease.update).not.toHaveBeenCalled();
    });

    it('re-uploads the identical artefact when the stored object has gone', async () => {
      prisma.applicationRelease.findUnique.mockResolvedValueOnce(storedRow());
      storage.fileExists.mockResolvedValueOnce(false);

      const result = await service.publish(publishInput(), actor);

      expect(result.outcome).toBe('PUBLISHED');
      expect(storage.saveFile).toHaveBeenCalledTimes(1);
      expect(prisma.applicationRelease.update).toHaveBeenCalledTimes(1);
      // The checksum is unchanged, so nothing already verified by a customer
      // becomes wrong.
      expect(prisma.applicationRelease.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------- validation

  describe('input validation', () => {
    it('rejects an unknown app key', async () => {
      expect(
        await codeOf(
          service.publish(publishInput({ appKey: 'PAYROLL' }), actor),
        ),
      ).toBe('RELEASE_METADATA_INVALID');
    });

    it('rejects an invalid version', async () => {
      expect(
        await codeOf(service.publish(publishInput({ version: 'v2' }), actor)),
      ).toBe('RELEASE_METADATA_INVALID');
    });

    it('rejects a missing artefact', async () => {
      expect(
        await codeOf(
          service.publish(
            publishInput({ artifact: undefined as never }),
            actor,
          ),
        ),
      ).toBe('RELEASE_ARTIFACT_INVALID');
    });

    it('rejects an empty artefact', async () => {
      expect(
        await codeOf(
          service.publish(publishInput({ artifact: Buffer.alloc(0) }), actor),
        ),
      ).toBe('RELEASE_ARTIFACT_INVALID');
    });

    it('rejects an artefact above the configured ceiling', async () => {
      service = new ReleasePublisherService(
        prisma as unknown as PrismaService,
        storage as unknown as StorageService,
        audit as unknown as AuditService,
        { get: jest.fn().mockReturnValue(4) } as unknown as ConfigService,
      );

      expect(await codeOf(service.publish(publishInput(), actor))).toBe(
        'RELEASE_ARTIFACT_INVALID',
      );
    });

    it('rejects an artefact whose checksum does not match the publisher’s', async () => {
      // Transfer corruption: the bytes that arrived are not the bytes that were
      // hashed locally, so registering the publisher's checksum would publish a
      // value every customer's verification would fail against.
      expect(
        await codeOf(
          service.publish(
            publishInput({ declaredChecksumSha256: 'f'.repeat(64) }),
            actor,
          ),
        ),
      ).toBe('RELEASE_ARTIFACT_INVALID');
      expect(storage.saveFile).not.toHaveBeenCalled();
    });

    it('rejects an artefact file name containing a path', async () => {
      expect(
        await codeOf(
          service.publish(
            publishInput({ fileName: '../../etc/passwd.zip' }),
            actor,
          ),
        ),
      ).toBe('RELEASE_ARTIFACT_INVALID');
    });

    it('rejects an artefact type the app does not ship', async () => {
      expect(
        await codeOf(
          service.publish(publishInput({ fileName: 'gateway.sh' }), actor),
        ),
      ).toBe('RELEASE_ARTIFACT_INVALID');
    });
  });

  // ----------------------------------------------------- environment safety

  describe('environment protection', () => {
    it('refuses when the publisher names a different environment than the API is', async () => {
      const code = await codeOf(
        service.publish(
          publishInput({ targetEnvironment: 'production' }),
          actor,
        ),
      );

      expect(code).toBe('RELEASE_ENVIRONMENT_MISMATCH');
      expect(storage.saveFile).not.toHaveBeenCalled();
    });

    it('refuses when the publisher names no environment at all', async () => {
      expect(
        await codeOf(
          service.publish(publishInput({ targetEnvironment: '' }), actor),
        ),
      ).toBe('RELEASE_ENVIRONMENT_MISMATCH');
    });

    it('accepts an equivalent spelling of the same environment', async () => {
      process.env.PLATFORM_ENVIRONMENT = 'production';
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedRow());

      const result = await service.publish(
        publishInput({ targetEnvironment: 'prod' }),
        actor,
      );

      expect(result.outcome).toBe('PUBLISHED');
    });
  });

  // ----------------------------------------------------------- compensation

  describe('failed registration', () => {
    it('deletes the uploaded artefact when the release cannot be created', async () => {
      prisma.applicationRelease.create.mockRejectedValueOnce(
        new Error('unique constraint'),
      );

      const code = await codeOf(service.publish(publishInput(), actor));

      expect(code).toBe('RELEASE_REGISTRATION_FAILED');
      expect(storage.deleteFile).toHaveBeenCalledWith(
        'app-releases/INTEGRATION_GATEWAY/2-0-0/pkg.zip',
      );
    });

    it('reports the orphaned storage key when cleanup also fails', async () => {
      prisma.applicationRelease.create.mockRejectedValueOnce(
        new Error('unique constraint'),
      );
      storage.deleteFile.mockRejectedValueOnce(new Error('storage offline'));

      try {
        await service.publish(publishInput(), actor);
        throw new Error('expected the publish to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const details = (error as AppError).details as { compensation: string };
        // Nobody can clean up an orphan they were never told about.
        expect(details.compensation).toContain(
          'app-releases/INTEGRATION_GATEWAY/2-0-0/pkg.zip',
        );
      }
    });
  });

  // ---------------------------------------------------------- verification

  describe('post-registration verification', () => {
    it('fails loudly when the artefact is not retrievable after registration', async () => {
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedRow());
      storage.fileExists.mockResolvedValue(false);

      expect(await codeOf(service.publish(publishInput(), actor))).toBe(
        'RELEASE_VERIFICATION_FAILED',
      );
    });

    it('fails when the stored checksum does not match what was published', async () => {
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedRow({ checksumSha256: 'a'.repeat(64) }));

      expect(await codeOf(service.publish(publishInput(), actor))).toBe(
        'RELEASE_VERIFICATION_FAILED',
      );
    });

    it('includes recovery instructions rather than only failing', async () => {
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(storedRow({ publishedAt: null }));

      try {
        await service.publish(publishInput(), actor);
        throw new Error('expected the publish to fail');
      } catch (error) {
        const details = (error as AppError).details as { recovery: string };
        expect(details.recovery).toContain('/disable');
      }
    });
  });

  // -------------------------------------------------------------- dry runs

  describe('dry run', () => {
    it('validates and checksums without uploading or writing anything', async () => {
      const result = await service.publish(
        publishInput({ dryRun: true }),
        actor,
      );

      expect(result.outcome).toBe('DRY_RUN');
      expect(result.release.checksumSha256).toBe(ARTIFACT_SHA);
      expect(storage.saveFile).not.toHaveBeenCalled();
      expect(prisma.applicationRelease.create).not.toHaveBeenCalled();
      expect(prisma.applicationRelease.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('still enforces environment protection', async () => {
      expect(
        await codeOf(
          service.publish(
            publishInput({ dryRun: true, targetEnvironment: 'production' }),
            actor,
          ),
        ),
      ).toBe('RELEASE_ENVIRONMENT_MISMATCH');
    });
  });

  // ------------------------------------------------------------- promotion

  describe('promotion', () => {
    const promoteInput = {
      appKey: 'integration-gateway',
      version: '2.0.0',
      toChannel: 'STABLE' as never,
      targetEnvironment: 'development',
    };

    it('reuses the tested artefact instead of rebuilding it', async () => {
      prisma.applicationRelease.findFirst.mockResolvedValueOnce(storedRow());
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null) // no existing STABLE row
        .mockResolvedValueOnce(
          storedRow({ id: 'release-2', channel: 'STABLE' }),
        );
      prisma.applicationRelease.create.mockResolvedValueOnce(
        storedRow({ id: 'release-2', channel: 'STABLE' }),
      );

      const result = await service.promote(promoteInput, actor);

      expect(result.outcome).toBe('PUBLISHED');
      const [{ data }] = prisma.applicationRelease.create.mock.calls[0];
      // The same object and the same checksum: promotion ships exactly the
      // bytes that were tested in BETA.
      expect(data.storageKey).toBe(
        'app-releases/INTEGRATION_GATEWAY/2-0-0/pkg.zip',
      );
      expect(data.checksumSha256).toBe(ARTIFACT_SHA);
      expect(data.channel).toBe('STABLE');
      expect(storage.saveFile).not.toHaveBeenCalled();
    });

    it('leaves the source release in place', async () => {
      prisma.applicationRelease.findFirst.mockResolvedValueOnce(storedRow());
      prisma.applicationRelease.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          storedRow({ id: 'release-2', channel: 'STABLE' }),
        );
      prisma.applicationRelease.create.mockResolvedValueOnce(
        storedRow({ id: 'release-2', channel: 'STABLE' }),
      );

      await service.promote(promoteInput, actor);

      // A tenant pinned to the BETA release keeps it. Promotion adds a row; it
      // never rewrites history.
      expect(prisma.applicationRelease.update).not.toHaveBeenCalled();
    });

    it('is idempotent when the target channel already has the same artefact', async () => {
      prisma.applicationRelease.findFirst.mockResolvedValueOnce(storedRow());
      prisma.applicationRelease.findUnique.mockResolvedValueOnce(
        storedRow({ id: 'release-2', channel: 'STABLE' }),
      );

      const result = await service.promote(promoteInput, actor);

      expect(result.outcome).toBe('ALREADY_PUBLISHED');
      expect(prisma.applicationRelease.create).not.toHaveBeenCalled();
    });

    it('rejects promotion over a different artefact already in the target channel', async () => {
      prisma.applicationRelease.findFirst.mockResolvedValueOnce(storedRow());
      prisma.applicationRelease.findUnique.mockResolvedValueOnce(
        storedRow({
          id: 'release-2',
          channel: 'STABLE',
          checksumSha256: 'b'.repeat(64),
        }),
      );

      expect(await codeOf(service.promote(promoteInput, actor))).toBe(
        'RELEASE_VERSION_CONFLICT',
      );
    });

    it('rejects promoting a version that was never published', async () => {
      prisma.applicationRelease.findFirst.mockResolvedValueOnce(null);

      expect(await codeOf(service.promote(promoteInput, actor))).toBe(
        'RELEASE_SOURCE_NOT_FOUND',
      );
    });

    it('rejects promoting an artefact that is no longer in storage', async () => {
      prisma.applicationRelease.findFirst.mockResolvedValueOnce(storedRow());
      prisma.applicationRelease.findUnique.mockResolvedValueOnce(null);
      storage.fileExists.mockResolvedValue(false);

      expect(await codeOf(service.promote(promoteInput, actor))).toBe(
        'RELEASE_ARTIFACT_INVALID',
      );
    });

    it('changes nothing on a dry run', async () => {
      prisma.applicationRelease.findFirst.mockResolvedValueOnce(storedRow());
      prisma.applicationRelease.findUnique.mockResolvedValueOnce(null);

      const result = await service.promote(
        { ...promoteInput, dryRun: true },
        actor,
      );

      expect(result.outcome).toBe('DRY_RUN');
      expect(prisma.applicationRelease.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------ read-back

  describe('verification read-back', () => {
    it('reports retrievability without exposing the storage key', async () => {
      prisma.applicationRelease.findMany.mockResolvedValueOnce([storedRow()]);

      const result = await service.describe({ appKey: 'integration-gateway' });

      expect(result.items[0].artifactAvailable).toBe(true);
      expect(JSON.stringify(result)).not.toContain(
        'app-releases/INTEGRATION_GATEWAY',
      );
      expect(result.items[0].downloadPath).toBe(
        '/app-releases/release-1/download',
      );
    });
  });
});
