import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkProfileVersionStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { parsePackageArtifact } from '../customization/package-artifact';
import type { WorkProfileDefinition } from './work-profile-definition';
import {
  buildWorkProfilePackage,
  referencedUnitKeys,
} from './work-profile-portable';
import { WorkComponentsService } from './work-components.service';

/*
 * DP-MASTER/WP-35.S2 + WP-21.S1. The work-profiles endpoint's way into the ONE
 * package engine's work-component logic. It owns nothing but the file handling:
 * planning and writing are WorkComponentsService, the same code the package
 * engine (customization/package-alm.service) uses for a package that also
 * carries modules, so there is no second importer to drift.
 *
 * Every read and write is scoped to the caller's tenant. The package never
 * names a tenant. The plan is fully validated before anything is written, the
 * whole import is one transaction, and re-importing the same package is a
 * no-op: a profile only gets a new version when its definition changed.
 */
@Injectable()
export class WorkProfilesPortableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly components: WorkComponentsService,
    private readonly audit: AuditService,
  ) {}

  /** Serialises the profile's latest PUBLISHED version and the units it uses. */
  async exportProfile(user: AuthenticatedUser, profileId: string) {
    const profile = await this.prisma.workProfile.findFirst({
      where: { id: profileId, tenantId: user.tenantId },
      select: {
        key: true,
        name: true,
        description: true,
        versions: {
          where: { status: WorkProfileVersionStatus.PUBLISHED },
          orderBy: { version: 'desc' },
          take: 1,
          select: { version: true, definition: true, publishedAt: true },
        },
      },
    });
    if (!profile) throw new NotFoundException('Work profile was not found.');
    const published = profile.versions[0];
    if (!published) {
      throw new ConflictException({
        code: 'WORK_PROFILE_NOT_PUBLISHED',
        message: 'Only a published version can be exported. Publish one first.',
      });
    }
    const definition = published.definition as unknown as WorkProfileDefinition;
    const units = await this.prisma.workUnit.findMany({
      where: {
        tenantId: user.tenantId,
        key: { in: referencedUnitKeys(definition) },
      },
      select: { key: true, name: true, kind: true },
    });
    const { artifact, serialized } = buildWorkProfilePackage({
      profile: {
        key: profile.key,
        name: profile.name,
        description: profile.description,
        version: published.version,
        definition,
        publishedAt: published.publishedAt,
      },
      units,
    });
    return {
      fileName: `${artifact.manifest.packageKey}-${artifact.manifest.version}.djpkg`,
      checksum: artifact.contentChecksum,
      content: serialized,
    };
  }

  async importPackage(
    user: AuthenticatedUser,
    content: string,
    dryRun: boolean,
  ) {
    const parsed = parsePackageArtifact(content);
    if (!parsed.artifact) {
      throw new BadRequestException({
        code: 'WORK_PROFILE_PACKAGE_INVALID',
        message: parsed.problems
          .map((problem) =>
            problem.path
              ? `${problem.message} (${problem.path})`
              : problem.message,
          )
          .join(' '),
      });
    }

    const tenantId = user.tenantId;
    const artifact = parsed.artifact;
    const options = { standalone: true, syncMetadata: false };
    const rejected = (problems: string[]) =>
      new BadRequestException({
        code: 'WORK_PROFILE_PACKAGE_REJECTED',
        message: problems.join(' '),
      });

    if (dryRun) {
      const plan = await this.components.plan(
        this.prisma,
        tenantId,
        artifact.components,
        options,
      );
      if (plan.problems.length) throw rejected(plan.problems);
      return { dryRun: true, items: plan.items };
    }

    /*
     * Planned AND applied inside one transaction, by the same planner and the
     * same writer the package engine uses (WorkComponentsService): a problem
     * anywhere, including one found while writing, leaves the tenant untouched.
     */
    const plan = await this.prisma.$transaction(async (tx) => {
      const planned = await this.components.plan(
        tx,
        tenantId,
        artifact.components,
        options,
      );
      if (planned.problems.length) throw rejected(planned.problems);
      await this.components.apply(tx, user, planned);
      return planned;
    });

    await this.audit.log({
      tenantId,
      actorUserId: user.userId,
      action: 'WORK_PROFILE_PACKAGE_IMPORTED',
      entityType: 'WorkProfile',
      entityId: artifact.manifest.packageKey,
      afterSnapshot: {
        checksum: artifact.contentChecksum,
        items: plan.items,
      },
    });
    return { dryRun: false, items: plan.items };
  }
}
