import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApplicationArchitecture,
  ApplicationPlatform,
  type ApplicationRelease,
  ApplicationReleaseChannel,
} from '@prisma/client';
import { resolvePlatformEnvironment } from '@repo/config';
import { createHash } from 'crypto';
import { extname } from 'path';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import type { ReleasePublisherIdentity } from './release-publish-token.guard';
import {
  DEFAULT_RELEASE_ARTIFACT_MAX_BYTES,
  RELEASE_STORAGE_PREFIX,
  defaultPermissionForApp,
  isValidReleaseVersion,
  resolvePublishableApp,
} from './release-publisher.constants';

/**
 * Turns a built artefact into a published release, in one call.
 *
 * WHY THE WHOLE PIPELINE LIVES SERVER-SIDE. The previous process was: build a
 * zip, upload it somewhere by hand, then hand-write an ApplicationRelease row
 * with the storage key pasted in. Every failure mode of that process is a
 * half-published release — an uploaded object nobody registered, or a row
 * pointing at an object that never arrived — and a CLI cannot reliably clean up
 * after itself if it dies between the two steps.
 *
 * So the boundary is one request: bytes in, verified release out. Upload,
 * registration, verification and compensation all happen on this side of the
 * wire, where a failure at any step can undo the previous one.
 *
 * WHAT IS DELIBERATELY NOT HERE. Tenant assignment. A published release is
 * GLOBAL and available to nobody in particular; which tenants may install it is
 * `TenantAppAssignment`'s decision (channel, updatePolicy, pinnedRelease,
 * minimumVersion). Publishing that also assigned would silently push a build to
 * every customer.
 */

export type PublishOutcome = 'PUBLISHED' | 'ALREADY_PUBLISHED' | 'DRY_RUN';

export interface PublishReleaseInput {
  appKey: string;
  version: string;
  platform?: ApplicationPlatform;
  architecture?: ApplicationArchitecture;
  channel: ApplicationReleaseChannel;
  fileName: string;
  artifact: Buffer;
  /** Checksum the publisher calculated locally, to detect transfer corruption. */
  declaredChecksumSha256?: string;
  releaseNotes?: string;
  minimumSupportedVersion?: string;
  /** The environment the publisher believes it is targeting. */
  targetEnvironment: string;
  dryRun?: boolean;
}

export interface PromoteReleaseInput {
  appKey: string;
  version: string;
  platform?: ApplicationPlatform;
  architecture?: ApplicationArchitecture;
  fromChannel?: ApplicationReleaseChannel;
  toChannel: ApplicationReleaseChannel;
  releaseNotes?: string;
  targetEnvironment: string;
  dryRun?: boolean;
}

@Injectable()
export class ReleasePublisherService {
  private readonly logger = new Logger(ReleasePublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------------ publish

  async publish(input: PublishReleaseInput, actor: ReleasePublisherIdentity) {
    const environment = this.assertEnvironment(input.targetEnvironment);
    const app = this.resolveApp(input.appKey);
    const version = this.assertVersion(input.version);
    const platform = input.platform ?? app.defaultPlatform;
    const architecture = input.architecture ?? app.defaultArchitecture;
    const channel = input.channel;

    const fileName = this.assertFileName(
      input.fileName,
      app.artifactExtensions,
    );
    const { checksum, checksumSha512 } = this.assertArtifact(
      input.artifact,
      input.declaredChecksumSha256,
    );
    const fileSizeBytes = input.artifact.byteLength;

    const identity = {
      appKey: app.appKey,
      version,
      platform,
      architecture,
      channel,
    };

    // --- duplicate protection, BEFORE anything is written -------------------
    //
    // Two very different situations share one shape ("this version already
    // exists") and must not share one answer. A re-run of the same pipeline is
    // routine and should succeed quietly. A different binary under a version
    // somebody already downloaded is a mistake that must stop the pipeline.
    const existing = await this.prisma.applicationRelease.findUnique({
      where: { appKey_version_platform_architecture_channel: identity },
    });

    if (existing) {
      const sameArtifact =
        existing.checksumSha256?.toLowerCase() === checksum.toLowerCase();

      if (!sameArtifact) {
        throw new AppError('RELEASE_VERSION_CONFLICT', {
          details: {
            ...identity,
            publishedAt: existing.publishedAt,
            existingChecksumSha256: existing.checksumSha256,
            incomingChecksumSha256: checksum,
          },
        });
      }

      // Same bytes, already registered. Idempotent success — but only after
      // confirming the artefact is still in storage, because a row whose object
      // has gone is a broken download, not a successful publish.
      const artifactAvailable = await this.storage.fileExists(
        existing.storageKey,
      );
      if (artifactAvailable) {
        return this.describeOutcome('ALREADY_PUBLISHED', existing, {
          environment,
          artifactAvailable: true,
        });
      }

      // Self-repair: re-upload the identical bytes and repoint the row. The
      // checksum is unchanged, so nothing a customer already verified changes.
      const repaired = await this.storeArtifact(
        app.appKey,
        version,
        fileName,
        input.artifact,
      );
      const updated = await this.prisma.applicationRelease.update({
        where: { id: existing.id },
        data: {
          storageKey: repaired.storageKey,
          fileSizeBytes,
          updatedById: null,
        },
      });

      await this.audit(
        actor,
        'platform.application_release_artifact_restored',
        updated.id,
        {
          ...identity,
          checksumSha256: checksum,
          checksumSha512,
          environment,
        },
      );

      return this.describeOutcome('PUBLISHED', updated, {
        environment,
        artifactAvailable: true,
        note: 'The release record already existed but its artefact was missing from storage. The identical artefact was re-uploaded.',
      });
    }

    if (input.dryRun) {
      return {
        outcome: 'DRY_RUN' as const,
        environment,
        release: {
          ...identity,
          name: app.name,
          fileName,
          fileSizeBytes,
          checksumSha256: checksum,
          checksumSha512,
          minimumSupportedVersion: input.minimumSupportedVersion ?? null,
          requiredPermission: defaultPermissionForApp(app.appKey),
        },
        artifactAvailable: false,
        message:
          'Dry run: nothing was uploaded and no release record was created or modified.',
      };
    }

    // --- upload, then register, then verify ---------------------------------

    const stored = await this.storeArtifact(
      app.appKey,
      version,
      fileName,
      input.artifact,
    );

    let created: ApplicationRelease;
    try {
      created = await this.prisma.applicationRelease.create({
        data: {
          ...identity,
          name: app.name,
          description: app.description,
          storageKey: stored.storageKey,
          fileName,
          fileSizeBytes,
          checksumSha256: checksum,
          checksumSha512,
          minimumSupportedVersion: input.minimumSupportedVersion ?? null,
          releaseNotes: input.releaseNotes ?? null,
          requiredPermission: defaultPermissionForApp(app.appKey),
          isActive: true,
          publishedAt: new Date(),
        },
      });
    } catch (error) {
      // Compensation. The upload succeeded and the registration did not, so the
      // object in storage is unreferenced. Remove it rather than leaving an
      // orphan nobody will ever recognise; if removal also fails, say exactly
      // which key needs cleaning up by hand.
      let compensation = 'The uploaded artefact was deleted.';
      try {
        await this.storage.deleteFile(stored.storageKey);
      } catch (cleanupError) {
        compensation = `The uploaded artefact could NOT be deleted and is orphaned at storage key "${stored.storageKey}". Remove it manually.`;
        this.logger.error(
          `Release registration failed and cleanup failed for ${stored.storageKey}`,
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        );
      }

      throw new AppError('RELEASE_REGISTRATION_FAILED', {
        details: { ...identity, compensation, storageKey: stored.storageKey },
        cause: error,
      });
    }

    await this.verifyRegistration(created.id, {
      ...identity,
      checksumSha256: checksum,
          checksumSha512,
      fileSizeBytes,
    });

    await this.audit(
      actor,
      'platform.application_release_published',
      created.id,
      {
        ...identity,
        checksumSha256: checksum,
          checksumSha512,
        fileSizeBytes,
        fileName,
        environment,
      },
    );

    return this.describeOutcome('PUBLISHED', created, {
      environment,
      artifactAvailable: true,
    });
  }

  // ------------------------------------------------------------------ promote

  /**
   * Moves an existing artefact into a wider channel without rebuilding it.
   *
   * `ApplicationRelease` is unique on (app, version, platform, architecture,
   * channel), so a promotion is a NEW ROW, not an edit — that is the schema's
   * semantics and this preserves it. The BETA row keeps its own history and
   * stays downloadable for anyone pinned to it.
   *
   * The new row REUSES the source storage key. That is deliberate: promoting is
   * supposed to ship the byte-for-byte artefact that was tested, and copying the
   * object would create a second thing that could differ. Two rows referencing
   * one object is safe here because release artefacts are never deleted —
   * retiring a release deactivates the row and leaves the bytes in place.
   */
  async promote(input: PromoteReleaseInput, actor: ReleasePublisherIdentity) {
    const environment = this.assertEnvironment(input.targetEnvironment);
    const app = this.resolveApp(input.appKey);
    const version = this.assertVersion(input.version);
    const platform = input.platform ?? app.defaultPlatform;
    const architecture = input.architecture ?? app.defaultArchitecture;

    const source = await this.prisma.applicationRelease.findFirst({
      where: {
        appKey: app.appKey,
        version,
        platform,
        architecture,
        ...(input.fromChannel ? { channel: input.fromChannel } : {}),
        publishedAt: { not: null },
      },
      orderBy: { publishedAt: 'desc' },
    });

    if (!source) {
      throw new AppError('RELEASE_SOURCE_NOT_FOUND', {
        details: {
          appKey: app.appKey,
          version,
          platform,
          architecture,
          channel: input.fromChannel ?? null,
        },
      });
    }

    if (!source.storageKey || !source.checksumSha256) {
      throw new AppError('RELEASE_METADATA_INVALID', {
        description:
          'The source release has no stored artefact or no checksum, so it cannot be promoted.',
        details: { id: source.id },
      });
    }

    if (source.channel === input.toChannel) {
      return this.describeOutcome('ALREADY_PUBLISHED', source, {
        environment,
        artifactAvailable: await this.storage.fileExists(source.storageKey),
        note: 'The release is already in the requested channel.',
      });
    }

    const identity = {
      appKey: app.appKey,
      version,
      platform,
      architecture,
      channel: input.toChannel,
    };

    const existingTarget = await this.prisma.applicationRelease.findUnique({
      where: { appKey_version_platform_architecture_channel: identity },
    });

    if (existingTarget) {
      if (
        existingTarget.checksumSha256?.toLowerCase() !==
        source.checksumSha256.toLowerCase()
      ) {
        throw new AppError('RELEASE_VERSION_CONFLICT', {
          details: {
            ...identity,
            existingChecksumSha256: existingTarget.checksumSha256,
            incomingChecksumSha256: source.checksumSha256,
          },
        });
      }

      return this.describeOutcome('ALREADY_PUBLISHED', existingTarget, {
        environment,
        artifactAvailable: await this.storage.fileExists(
          existingTarget.storageKey,
        ),
      });
    }

    if (!(await this.storage.fileExists(source.storageKey))) {
      throw new AppError('RELEASE_ARTIFACT_INVALID', {
        description:
          'The source release points at an artefact that is no longer in storage, so it cannot be promoted.',
        details: { id: source.id },
      });
    }

    if (input.dryRun) {
      return {
        outcome: 'DRY_RUN' as const,
        environment,
        release: {
          ...identity,
          name: source.name,
          fileName: source.fileName,
          fileSizeBytes: source.fileSizeBytes,
          checksumSha256: source.checksumSha256,
          minimumSupportedVersion: source.minimumSupportedVersion,
          requiredPermission: source.requiredPermission,
        },
        artifactAvailable: true,
        message: `Dry run: ${source.channel} -> ${input.toChannel} would reuse the existing artefact. Nothing was created or modified.`,
      };
    }

    const promoted = await this.prisma.applicationRelease.create({
      data: {
        ...identity,
        name: source.name,
        description: source.description,
        storageKey: source.storageKey,
        fileName: source.fileName,
        fileSizeBytes: source.fileSizeBytes,
        checksumSha256: source.checksumSha256,
        /*
         * BUG-0034 — carried forward, because promotion is exactly the path
         * that matters to the update feed: beta becomes stable, and stable is
         * the only channel the feed serves. Dropping it here would publish a
         * release the feed then silently skips.
         *
         * Null for anything published before the column existed. That is
         * correct rather than unfortunate — the feed skips a release it cannot
         * let the updater verify, instead of advertising one that would fail
         * verification after downloading.
         */
        checksumSha512: source.checksumSha512,
        minimumSupportedVersion: source.minimumSupportedVersion,
        // Notes may legitimately differ per channel ("promoted from beta after
        // hardware acceptance"), but the source's notes are the default so a
        // promotion never silently loses them.
        releaseNotes: input.releaseNotes ?? source.releaseNotes,
        requiredPermission: source.requiredPermission,
        isActive: true,
        publishedAt: new Date(),
      },
    });

    await this.verifyRegistration(promoted.id, {
      ...identity,
      checksumSha256: source.checksumSha256,
      checksumSha512: source.checksumSha512,
      fileSizeBytes: source.fileSizeBytes,
    });

    await this.audit(
      actor,
      'platform.application_release_promoted',
      promoted.id,
      {
        ...identity,
        fromChannel: source.channel,
        sourceReleaseId: source.id,
        checksumSha256: source.checksumSha256,
        environment,
      },
    );

    return this.describeOutcome('PUBLISHED', promoted, {
      environment,
      artifactAvailable: true,
      note: `Promoted from ${source.channel}. The ${source.channel} release remains available.`,
    });
  }

  // ------------------------------------------------------------------- verify

  /**
   * Reads a release back for verification.
   *
   * Reports whether the artefact is actually retrievable WITHOUT streaming it,
   * so a CI job can confirm a publish landed without pulling a few hundred
   * megabytes back over the wire.
   */
  async describe(query: {
    appKey: string;
    version?: string;
    channel?: ApplicationReleaseChannel;
    platform?: ApplicationPlatform;
    architecture?: ApplicationArchitecture;
  }) {
    const app = this.resolveApp(query.appKey);

    const releases = await this.prisma.applicationRelease.findMany({
      where: {
        appKey: app.appKey,
        ...(query.version ? { version: query.version.trim() } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.architecture ? { architecture: query.architecture } : {}),
      },
      orderBy: [{ publishedAt: 'desc' }],
      take: 50,
    });

    return {
      environment: resolvePlatformEnvironment(process.env),
      items: await Promise.all(
        releases.map(async (release) => ({
          id: release.id,
          appKey: release.appKey,
          name: release.name,
          version: release.version,
          platform: release.platform,
          architecture: release.architecture,
          channel: release.channel,
          fileName: release.fileName,
          fileSizeBytes: release.fileSizeBytes,
          checksumSha256: release.checksumSha256,
          minimumSupportedVersion: release.minimumSupportedVersion,
          requiredPermission: release.requiredPermission,
          isActive: release.isActive,
          publishedAt: release.publishedAt,
          downloadPath: `/app-releases/${release.id}/download`,
          // The storage key itself never crosses this boundary; only whether the
          // object it names is there.
          artifactAvailable: await this.storage.fileExists(release.storageKey),
        })),
      ),
    };
  }

  // ------------------------------------------------------------------ helpers

  /**
   * Refuses to publish into an environment the caller did not name.
   *
   * A developer with a production `.env` sourced in their shell would otherwise
   * publish to production by typing the same command they always type. The
   * publisher must state which environment it believes it is talking to, and
   * this compares that against what the API actually is.
   */
  private assertEnvironment(declared: string) {
    const actual = resolvePlatformEnvironment(process.env);
    const stated = String(declared ?? '')
      .trim()
      .toLowerCase();

    if (!stated) {
      throw new AppError('RELEASE_ENVIRONMENT_MISMATCH', {
        description:
          'The publisher did not state which environment it is targeting.',
        details: { actualEnvironment: actual },
      });
    }

    // Normalised through the same resolver the rest of the platform uses, so
    // "prod" and "production" cannot disagree.
    const normalized = resolvePlatformEnvironment({
      PLATFORM_ENVIRONMENT: stated,
    } as NodeJS.ProcessEnv);

    if (normalized !== actual) {
      throw new AppError('RELEASE_ENVIRONMENT_MISMATCH', {
        details: { declaredEnvironment: normalized, actualEnvironment: actual },
      });
    }

    return actual;
  }

  private resolveApp(appKey: string) {
    const app = resolvePublishableApp(appKey);
    if (!app) {
      throw new AppError('RELEASE_METADATA_INVALID', {
        description: `"${appKey}" is not a publishable DijiPeople application.`,
      });
    }
    return app;
  }

  private assertVersion(version: string) {
    const trimmed = String(version ?? '').trim();
    if (!isValidReleaseVersion(trimmed)) {
      throw new AppError('RELEASE_METADATA_INVALID', {
        description: `"${version}" is not a valid release version. Use MAJOR.MINOR.PATCH.`,
      });
    }
    return trimmed;
  }

  private assertFileName(fileName: string, allowedExtensions: string[]) {
    const trimmed = String(fileName ?? '').trim();
    if (trimmed.length === 0 || trimmed.length > 255) {
      throw new AppError('RELEASE_ARTIFACT_INVALID', {
        description: 'The artefact file name is missing or too long.',
      });
    }

    // Rejected here rather than sanitised: a publisher sending a path is
    // confused about what it is uploading, and silently renaming its artefact
    // would hide that.
    if (/[\\/]/.test(trimmed)) {
      throw new AppError('RELEASE_ARTIFACT_INVALID', {
        description: 'The artefact file name must not contain a path.',
      });
    }

    const extension = extname(trimmed);
    if (
      !allowedExtensions.some(
        (allowed) => allowed.toLowerCase() === extension.toLowerCase(),
      )
    ) {
      throw new AppError('RELEASE_ARTIFACT_INVALID', {
        description: `"${extension || 'no extension'}" is not an accepted artefact type for this application. Expected one of: ${allowedExtensions.join(', ')}.`,
      });
    }

    return trimmed;
  }

  private assertArtifact(artifact: Buffer | undefined, declared?: string) {
    if (!artifact || artifact.byteLength === 0) {
      throw new AppError('RELEASE_ARTIFACT_INVALID', {
        description: 'No artefact was uploaded, or the artefact was empty.',
      });
    }

    const max = Number(
      this.config.get('RELEASE_ARTIFACT_MAX_BYTES') ??
        DEFAULT_RELEASE_ARTIFACT_MAX_BYTES,
    );
    if (artifact.byteLength > max) {
      throw new AppError('RELEASE_ARTIFACT_INVALID', {
        description: `The artefact is ${artifact.byteLength} bytes, above the ${max}-byte limit for a release artefact.`,
      });
    }

    const checksum = createHash('sha256').update(artifact).digest('hex');

    /*
     * BUG-0034 — a second digest of the same bytes, for the electron-updater
     * feed. It verifies a download against sha512 and aborts the install on a
     * mismatch, so sha256 cannot serve that feed however it is re-encoded: they
     * are different digests, not two formats of one.
     *
     * Base64 rather than hex because base64 is what electron-updater writes
     * into `latest.yml` and compares against. Hex would fail every verification
     * while looking perfectly correct in the database.
     *
     * Computed here, from the bytes that ARRIVED, for the same reason the
     * sha256 is: a digest supplied by the publisher would only ever prove the
     * publisher's own copy was intact.
     */
    const checksumSha512 = createHash('sha512')
      .update(artifact)
      .digest('base64');

    // The checksum is recomputed here from the bytes that ARRIVED. The
    // publisher's own value is only ever compared, never trusted: if they
    // disagree the upload was corrupted in transit and the release must not be
    // registered with a checksum customers would fail to verify.
    if (declared && declared.trim().toLowerCase() !== checksum) {
      throw new AppError('RELEASE_ARTIFACT_INVALID', {
        description:
          'The uploaded artefact does not match the checksum the publisher calculated. The transfer was corrupted.',
        details: {
          expected: declared.trim().toLowerCase(),
          received: checksum,
        },
      });
    }

    return { checksum, checksumSha512 };
  }

  private async storeArtifact(
    appKey: string,
    version: string,
    fileName: string,
    artifact: Buffer,
  ) {
    return this.storage.saveFile({
      buffer: artifact,
      originalFileName: fileName,
      subdirectory: `${RELEASE_STORAGE_PREFIX}/${appKey}/${version}`,
    });
  }

  /**
   * Reads the row back and fails loudly if it is not what was just written.
   *
   * A create that returned without throwing is not proof the release is usable.
   * Announcing a release that cannot be downloaded is worse than failing the
   * pipeline, so this refuses to report success it has not confirmed.
   */
  private async verifyRegistration(
    id: string,
    expected: {
      appKey: string;
      version: string;
      channel: ApplicationReleaseChannel;
      checksumSha256: string;
      /* Null for releases published before the column existed — see promote(). */
      checksumSha512: string | null;
      fileSizeBytes: number | null;
    },
  ) {
    const stored = await this.prisma.applicationRelease.findUnique({
      where: { id },
    });

    const problems: string[] = [];
    if (!stored) {
      problems.push('the release record could not be read back');
    } else {
      if (stored.appKey !== expected.appKey) problems.push('appKey differs');
      if (stored.version !== expected.version) problems.push('version differs');
      if (stored.channel !== expected.channel) problems.push('channel differs');
      if (
        stored.checksumSha256?.toLowerCase() !==
        expected.checksumSha256.toLowerCase()
      ) {
        problems.push('checksum differs');
      }
      /*
       * BUG-0034 — verified as strictly as the sha256, and case-sensitively,
       * because this one is base64. Lower-casing a base64 digest would compare
       * two different values as equal, and a wrong sha512 is invisible until an
       * agent downloads the update and refuses to install it.
       */
      if (stored.checksumSha512 !== expected.checksumSha512) {
        problems.push('sha512 checksum differs');
      }
      if (stored.fileSizeBytes !== expected.fileSizeBytes) {
        problems.push('file size differs');
      }
      if (!stored.publishedAt) problems.push('publishedAt was not set');
      if (!(await this.storage.fileExists(stored.storageKey))) {
        problems.push('the artefact is not retrievable from storage');
      }
    }

    if (problems.length > 0) {
      throw new AppError('RELEASE_VERIFICATION_FAILED', {
        details: {
          releaseId: id,
          problems,
          recovery: `Disable release ${id} through POST /app-releases/${id}/disable, confirm the artefact in storage, and publish again once the cause is understood. Do not announce this version.`,
        },
      });
    }
  }

  private async audit(
    actor: ReleasePublisherIdentity,
    action: string,
    entityId: string,
    snapshot: Record<string, unknown>,
  ) {
    await this.auditService.log({
      // Releases are platform artefacts, not tenant data. 'platform' routes this
      // to PlatformAuditLog — the one sentinel this codebase uses.
      tenantId: 'platform',
      // There is no platform USER behind a machine credential, so the actor is
      // described in the snapshot instead of pointing at a user row that would
      // misattribute the action to a person.
      actorUserId: null,
      action,
      entityType: 'ApplicationRelease',
      entityId,
      sourceModule: 'app-releases',
      afterSnapshot: {
        ...snapshot,
        actorLabel: actor.actorLabel,
        // The fingerprint identifies the credential; the credential itself is
        // never logged.
        credentialFingerprint: actor.credentialFingerprint,
      },
    });
  }

  private describeOutcome(
    outcome: PublishOutcome,
    release: {
      id: string;
      appKey: string;
      name: string;
      version: string;
      platform: ApplicationPlatform;
      architecture: ApplicationArchitecture;
      channel: ApplicationReleaseChannel;
      fileName: string | null;
      fileSizeBytes: number | null;
      checksumSha256: string | null;
      minimumSupportedVersion: string | null;
      requiredPermission: string | null;
      isActive: boolean;
      publishedAt: Date | null;
    },
    extra: { environment: string; artifactAvailable: boolean; note?: string },
  ) {
    return {
      outcome,
      environment: extra.environment,
      artifactAvailable: extra.artifactAvailable,
      ...(extra.note ? { note: extra.note } : {}),
      release: {
        id: release.id,
        appKey: release.appKey,
        name: release.name,
        version: release.version,
        platform: release.platform,
        architecture: release.architecture,
        channel: release.channel,
        fileName: release.fileName,
        fileSizeBytes: release.fileSizeBytes,
        checksumSha256: release.checksumSha256,
        minimumSupportedVersion: release.minimumSupportedVersion,
        requiredPermission: release.requiredPermission,
        isActive: release.isActive,
        publishedAt: release.publishedAt,
        downloadPath: `/app-releases/${release.id}/download`,
      },
    };
  }
}
