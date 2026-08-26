import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import {
  ApplicationArchitecture,
  ApplicationPlatform,
  ApplicationReleaseChannel,
  Prisma,
} from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../audit/audit.service';

/**
 * Downloadable DijiPeople applications.
 *
 * `ApplicationRelease` is a GLOBAL platform artefact — one row per
 * app/version/platform/architecture/channel, shared by every tenant. There is no
 * `tenantId`: a gateway installer is product, not tenant data, and duplicating a
 * row per tenant would multiply the same binary for no benefit.
 *
 * Because rows are global, the security question is not ownership but
 * VISIBILITY. Two rules do that work:
 *
 *   channel   INTERNAL is invisible to every tenant user, including tenant
 *             administrators. It is support/platform only.
 *   permission each release may name a permission a caller must hold.
 *
 * Both are applied inside the query, not after it, so a caller cannot reach a
 * hidden release by guessing its id — the row simply does not match.
 */

/** Apps this build knows how to describe. */
export const APP_KEYS = {
  INTEGRATION_GATEWAY: 'INTEGRATION_GATEWAY',
  AGENT_DESKTOP: 'AGENT_DESKTOP',
  ZKTECO_DIAGNOSTIC: 'ZKTECO_DIAGNOSTIC',
} as const;

/**
 * Default permission required per app when a release does not name its own.
 *
 * The diagnostic utility is a support tool that talks directly to customer
 * hardware, so it sits behind gateway management rather than general downloads.
 */
export const DEFAULT_APP_PERMISSION: Record<string, string> = {
  [APP_KEYS.INTEGRATION_GATEWAY]: 'gateways.manage',
  [APP_KEYS.AGENT_DESKTOP]: 'appDownloads.read',
  [APP_KEYS.ZKTECO_DIAGNOSTIC]: 'gateways.manage',
};

export interface ReleaseViewer {
  permissionKeys: string[];
  /** True for DijiPeople platform/support staff, not tenant administrators. */
  isPlatformUser: boolean;
}

@Injectable()
export class AppReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
  ) {}

  static toViewer(user: AuthenticatedUser): ReleaseViewer {
    return {
      permissionKeys: user.permissionKeys ?? [],
      // Presence of a platform identity is what distinguishes DijiPeople staff
      // from a tenant administrator. A tenant admin is not internal.
      isPlatformUser: Boolean(user.platform?.id),
    };
  }

  /**
   * Channels a viewer may see.
   *
   * INTERNAL is added only for platform users. BETA follows the existing
   * downloads-management permission, which is the closest thing this codebase
   * has to a beta-eligibility signal.
   */
  private visibleChannels(viewer: ReleaseViewer): ApplicationReleaseChannel[] {
    const channels: ApplicationReleaseChannel[] = [
      ApplicationReleaseChannel.STABLE,
    ];

    if (
      viewer.isPlatformUser ||
      viewer.permissionKeys.includes('appDownloads.manage')
    ) {
      channels.push(ApplicationReleaseChannel.BETA);
    }

    if (viewer.isPlatformUser) {
      channels.push(ApplicationReleaseChannel.INTERNAL);
    }

    return channels;
  }

  /** Whether the viewer holds the permission this release requires. */
  private canDownload(
    viewer: ReleaseViewer,
    release: { appKey: string; requiredPermission: string | null },
  ): boolean {
    if (viewer.isPlatformUser) return true;
    const required =
      release.requiredPermission ?? DEFAULT_APP_PERMISSION[release.appKey];
    if (!required) return true;
    return viewer.permissionKeys.includes(required);
  }

  private baseWhere(
    viewer: ReleaseViewer,
    extra: Prisma.ApplicationReleaseWhereInput = {},
  ): Prisma.ApplicationReleaseWhereInput {
    return {
      isActive: true,
      publishedAt: { not: null },
      // Channel filtering lives in the WHERE clause, so a hidden release cannot
      // be reached by id.
      channel: { in: this.visibleChannels(viewer) },
      ...extra,
    };
  }

  async list(
    viewer: ReleaseViewer,
    query: {
      appKey?: string;
      platform?: ApplicationPlatform;
      architecture?: ApplicationArchitecture;
      channel?: ApplicationReleaseChannel;
    } = {},
  ) {
    // A caller asking explicitly for a channel they cannot see gets nothing
    // rather than an error, so the request reveals no more than a normal list.
    const requested = query.channel
      ? this.visibleChannels(viewer).includes(query.channel)
        ? [query.channel]
        : []
      : this.visibleChannels(viewer);

    const releases = await this.prisma.applicationRelease.findMany({
      where: {
        isActive: true,
        publishedAt: { not: null },
        channel: { in: requested },
        ...(query.appKey ? { appKey: query.appKey } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.architecture ? { architecture: query.architecture } : {}),
      },
      orderBy: [{ appKey: 'asc' }, { publishedAt: 'desc' }],
    });

    return {
      items: releases
        .filter((release) => this.canDownload(viewer, release))
        .map((release) => this.toResponse(release)),
    };
  }

  /** Newest published release matching the requested target. */
  async latest(
    viewer: ReleaseViewer,
    query: {
      appKey: string;
      platform?: ApplicationPlatform;
      architecture?: ApplicationArchitecture;
      channel?: ApplicationReleaseChannel;
    },
  ) {
    const release = await this.prisma.applicationRelease.findFirst({
      where: this.baseWhere(viewer, {
        appKey: query.appKey,
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.architecture ? { architecture: query.architecture } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
      }),
      orderBy: { publishedAt: 'desc' },
    });

    if (!release || !this.canDownload(viewer, release)) {
      throw new NotFoundException('No available release was found.');
    }

    return this.toResponse(release);
  }

  async findOne(viewer: ReleaseViewer, id: string) {
    const release = await this.prisma.applicationRelease.findFirst({
      where: this.baseWhere(viewer, { id }),
    });

    // Identical response whether the release is missing, inactive, in a channel
    // the viewer cannot see, or behind a permission they lack.
    if (!release || !this.canDownload(viewer, release)) {
      throw new NotFoundException('Release could not be found.');
    }

    return this.toResponse(release);
  }

  /**
   * Opens the artefact for download.
   *
   * Goes through StorageService so the stored key is never handed to the
   * browser. Releases hosted outside DijiPeople storage return their URL only
   * after the same visibility and permission checks.
   */
  async download(viewer: ReleaseViewer, id: string) {
    const release = await this.prisma.applicationRelease.findFirst({
      where: this.baseWhere(viewer, { id }),
    });

    if (!release || !this.canDownload(viewer, release)) {
      throw new NotFoundException('Release could not be found.');
    }

    if (release.storageKey) {
      const file = await this.storage.openFile(release.storageKey);
      return {
        kind: 'stream' as const,
        fileName: release.fileName ?? `${release.appKey}-${release.version}`,
        checksumSha256: release.checksumSha256,
        file: new StreamableFile(file.stream),
      };
    }

    if (release.externalUrl) {
      return {
        kind: 'redirect' as const,
        url: release.externalUrl,
        fileName: release.fileName,
        checksumSha256: release.checksumSha256,
      };
    }

    throw new NotFoundException('This release has no downloadable artefact.');
  }

  // ----------------------------------------------------- platform management

  async publish(
    user: AuthenticatedUser,
    dto: {
      appKey: string;
      name: string;
      description?: string;
      version: string;
      platform: ApplicationPlatform;
      architecture: ApplicationArchitecture;
      channel?: ApplicationReleaseChannel;
      storageKey?: string;
      externalUrl?: string;
      fileName?: string;
      fileSizeBytes?: number;
      checksumSha256?: string;
      minimumSupportedVersion?: string;
      releaseNotes?: string;
      requiredPermission?: string;
    },
  ) {
    const channel = dto.channel ?? ApplicationReleaseChannel.STABLE;

    // A published version is immutable CONTENT. Metadata may still be corrected
    // — notes, minimum supported version, the display name — and the upsert
    // below is what allows that. What it must never allow is a different binary
    // arriving under a version somebody has already downloaded, because every
    // checksum published alongside it becomes a lie.
    //
    // Only a genuine content change is rejected: both checksums present and
    // different. A metadata-only re-publish carries the same checksum, or none,
    // and still succeeds exactly as before.
    const existing = await this.prisma.applicationRelease.findUnique({
      where: {
        appKey_version_platform_architecture_channel: {
          appKey: dto.appKey,
          version: dto.version,
          platform: dto.platform,
          architecture: dto.architecture,
          channel,
        },
      },
      select: { checksumSha256: true },
    });

    if (
      existing?.checksumSha256 &&
      dto.checksumSha256 &&
      existing.checksumSha256.toLowerCase() !== dto.checksumSha256.toLowerCase()
    ) {
      throw new AppError('RELEASE_VERSION_CONFLICT', {
        details: {
          appKey: dto.appKey,
          version: dto.version,
          platform: dto.platform,
          architecture: dto.architecture,
          channel,
        },
      });
    }

    const release = await this.prisma.applicationRelease.upsert({
      where: {
        appKey_version_platform_architecture_channel: {
          appKey: dto.appKey,
          version: dto.version,
          platform: dto.platform,
          architecture: dto.architecture,
          channel,
        },
      },
      create: {
        appKey: dto.appKey,
        name: dto.name,
        description: dto.description ?? null,
        version: dto.version,
        platform: dto.platform,
        architecture: dto.architecture,
        channel,
        storageKey: dto.storageKey ?? null,
        externalUrl: dto.externalUrl ?? null,
        fileName: dto.fileName ?? null,
        fileSizeBytes: dto.fileSizeBytes ?? null,
        checksumSha256: dto.checksumSha256 ?? null,
        minimumSupportedVersion: dto.minimumSupportedVersion ?? null,
        releaseNotes: dto.releaseNotes ?? null,
        requiredPermission:
          dto.requiredPermission ?? DEFAULT_APP_PERMISSION[dto.appKey] ?? null,
        isActive: true,
        publishedAt: new Date(),
        createdById: user.userId,
        updatedById: user.userId,
      },
      update: {
        name: dto.name,
        description: dto.description ?? null,
        storageKey: dto.storageKey ?? undefined,
        externalUrl: dto.externalUrl ?? undefined,
        fileName: dto.fileName ?? undefined,
        fileSizeBytes: dto.fileSizeBytes ?? undefined,
        checksumSha256: dto.checksumSha256 ?? undefined,
        minimumSupportedVersion: dto.minimumSupportedVersion ?? undefined,
        releaseNotes: dto.releaseNotes ?? undefined,
        requiredPermission: dto.requiredPermission ?? undefined,
        isActive: true,
        publishedAt: new Date(),
        updatedById: user.userId,
      },
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'platform.application_release_published',
      entityType: 'ApplicationRelease',
      entityId: release.id,
      sourceModule: 'app-releases',
      afterSnapshot: {
        appKey: release.appKey,
        version: release.version,
        platform: release.platform,
        architecture: release.architecture,
        channel: release.channel,
      },
    });

    return this.toResponse(release);
  }

  async setActive(user: AuthenticatedUser, id: string, isActive: boolean) {
    const existing = await this.prisma.applicationRelease.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Release could not be found.');
    }

    const updated = await this.prisma.applicationRelease.update({
      where: { id },
      data: { isActive, updatedById: user.userId },
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: isActive
        ? 'platform.application_release_updated'
        : 'platform.application_release_disabled',
      entityType: 'ApplicationRelease',
      entityId: id,
      sourceModule: 'app-releases',
      beforeSnapshot: { isActive: existing.isActive },
      afterSnapshot: { isActive },
    });

    return this.toResponse(updated);
  }

  /**
   * The management catalogue (TASK-0026): every release including disabled ones
   * and every channel, so the admin releases screen shows the full version
   * history, not only the active download catalogue `list()` returns. Gated by
   * `appDownloads.manage` at the controller.
   */
  async listForManagement() {
    const releases = await this.prisma.applicationRelease.findMany({
      orderBy: [{ appKey: 'asc' }, { channel: 'asc' }, { publishedAt: 'desc' }],
    });
    return { items: releases.map((release) => this.toResponse(release)) };
  }

  /**
   * Promotes a release into another channel (TASK-0026) — the in-app equivalent
   * of `release:promote`. A promotion is a NEW row that reuses the source's
   * storage key, so the promoted channel ships the byte-for-byte artefact that
   * was tested in the source channel and the source row stays downloadable for
   * anyone pinned to it. Idempotent: promoting to a channel that already holds
   * this version returns the existing row rather than failing.
   */
  async promote(
    user: AuthenticatedUser,
    id: string,
    toChannel: ApplicationReleaseChannel,
  ) {
    const source = await this.prisma.applicationRelease.findUnique({
      where: { id },
    });
    if (!source) {
      throw new NotFoundException('Release could not be found.');
    }
    if (source.channel === toChannel) {
      return this.toResponse(source);
    }

    const promotedData = {
      appKey: source.appKey,
      name: source.name,
      description: source.description,
      version: source.version,
      platform: source.platform,
      architecture: source.architecture,
      channel: toChannel,
      // Reuse the same bytes — the promoted channel is the tested artefact.
      storageKey: source.storageKey,
      externalUrl: source.externalUrl,
      fileName: source.fileName,
      fileSizeBytes: source.fileSizeBytes,
      checksumSha256: source.checksumSha256,
      checksumSha512: source.checksumSha512,
      minimumSupportedVersion: source.minimumSupportedVersion,
      releaseNotes: source.releaseNotes,
      requiredPermission: source.requiredPermission,
      isActive: true,
      publishedAt: new Date(),
      createdById: user.userId,
      updatedById: user.userId,
    };

    let promoted;
    try {
      promoted = await this.prisma.applicationRelease.create({
        data: promotedData,
      });
    } catch (error) {
      const isDuplicate =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      if (!isDuplicate) throw error;
      const existing = await this.prisma.applicationRelease.findUnique({
        where: {
          appKey_version_platform_architecture_channel: {
            appKey: source.appKey,
            version: source.version,
            platform: source.platform,
            architecture: source.architecture,
            channel: toChannel,
          },
        },
      });
      if (!existing) throw error;
      // Re-activate a previously retired promotion so it is downloadable again.
      promoted = await this.prisma.applicationRelease.update({
        where: { id: existing.id },
        data: { isActive: true, updatedById: user.userId },
      });
    }

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'platform.application_release_promoted',
      entityType: 'ApplicationRelease',
      entityId: promoted.id,
      sourceModule: 'app-releases',
      beforeSnapshot: { fromChannel: source.channel, sourceId: source.id },
      afterSnapshot: { toChannel, version: source.version },
    });

    return this.toResponse(promoted);
  }

  /** Storage keys and internal URLs never cross this boundary. */
  private toResponse(release: {
    id: string;
    appKey: string;
    name: string;
    description: string | null;
    version: string;
    platform: ApplicationPlatform;
    architecture: ApplicationArchitecture;
    channel: ApplicationReleaseChannel;
    fileName: string | null;
    fileSizeBytes: number | null;
    checksumSha256: string | null;
    minimumSupportedVersion: string | null;
    releaseNotes: string | null;
    isActive: boolean;
    publishedAt: Date | null;
  }) {
    return {
      id: release.id,
      appKey: release.appKey,
      name: release.name,
      description: release.description,
      version: release.version,
      platform: release.platform,
      architecture: release.architecture,
      channel: release.channel,
      fileName: release.fileName,
      fileSizeBytes: release.fileSizeBytes,
      checksumSha256: release.checksumSha256,
      minimumSupportedVersion: release.minimumSupportedVersion,
      releaseNotes: release.releaseNotes,
      isActive: release.isActive,
      publishedAt: release.publishedAt,
      // The caller downloads through this route, never a storage URL.
      downloadPath: `/app-releases/${release.id}/download`,
    };
  }
}
