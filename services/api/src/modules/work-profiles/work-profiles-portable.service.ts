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
  planWorkProfileImport,
  referencedUnitKeys,
  type ImportItem,
} from './work-profile-portable';
import { WorkProfilesService } from './work-profiles.service';

/*
 * DP-MASTER/WP-35.S2. Export and import of work profiles as `.djpkg` components.
 *
 * Every read and write is scoped to the caller's tenant. The package never
 * names a tenant. Writes go through WorkProfilesService, so the same validation,
 * immutability and audit rules apply as for a profile built by hand. The plan is
 * fully validated before anything is written, and re-importing the same package
 * is a no-op: a profile only gets a new version when its definition changed.
 */
@Injectable()
export class WorkProfilesPortableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: WorkProfilesService,
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
    const [units, profiles] = await Promise.all([
      this.prisma.workUnit.findMany({
        where: { tenantId },
        select: { key: true, kind: true, isActive: true },
      }),
      this.prisma.workProfile.findMany({
        where: {
          tenantId,
          key: {
            in: parsed.artifact.components
              .filter((component) => component.type === 'workProfile')
              .map((component) => component.objectKey),
          },
        },
        select: {
          key: true,
          isActive: true,
          versions: {
            orderBy: { version: 'desc' },
            select: { status: true, definition: true },
          },
        },
      }),
    ]);

    const plan = planWorkProfileImport({
      components: parsed.artifact.components,
      existingUnits: units,
      existingProfiles: profiles.map((profile) => ({
        key: profile.key,
        isActive: profile.isActive,
        hasDraft: profile.versions.some(
          (version) => version.status === WorkProfileVersionStatus.DRAFT,
        ),
        latestPublishedDefinition:
          profile.versions.find(
            (version) => version.status === WorkProfileVersionStatus.PUBLISHED,
          )?.definition ?? null,
      })),
    });
    if (plan.problems.length) {
      throw new BadRequestException({
        code: 'WORK_PROFILE_PACKAGE_REJECTED',
        message: plan.problems.join(' '),
      });
    }
    if (dryRun) return { dryRun: true, items: plan.items };

    const action = new Map<string, ImportItem['action']>(
      plan.items.map((item) => [item.key, item.action]),
    );
    for (const component of plan.units) {
      if (action.get(component.key) !== 'create') continue;
      const definition = component.definition as {
        key: string;
        name: string;
        kind: 'DURATION' | 'COUNT' | 'DUTY_COMPLETION' | 'CURRENCY';
      };
      await this.profiles.createUnit(user, {
        key: definition.key,
        name: definition.name,
        kind: definition.kind,
      });
    }
    for (const component of plan.profiles) {
      const step = action.get(component.key);
      if (step === 'unchanged') continue;
      const definition = component.definition as {
        key: string;
        name: string;
        description: string | null;
        definition: Record<string, unknown>;
      };
      if (step === 'create') {
        const created = await this.profiles.create(user, {
          key: definition.key,
          name: definition.name,
          description: definition.description ?? undefined,
          definition: definition.definition,
        });
        await this.profiles.publish(
          user,
          created.id,
          created.versions[0].id,
          {},
        );
      } else {
        const existing = await this.prisma.workProfile.findFirstOrThrow({
          where: { tenantId, key: definition.key },
          select: { id: true },
        });
        const drafted = await this.profiles.createDraft(user, existing.id);
        const draft = drafted.versions.find(
          (version) => version.status === WorkProfileVersionStatus.DRAFT,
        );
        if (!draft) throw new ConflictException('The draft was not created.');
        await this.profiles.updateDraft(user, existing.id, draft.id, {
          definition: definition.definition,
        });
        await this.profiles.publish(user, existing.id, draft.id, {});
      }
    }

    await this.audit.log({
      tenantId,
      actorUserId: user.userId,
      action: 'WORK_PROFILE_PACKAGE_IMPORTED',
      entityType: 'WorkProfile',
      entityId: parsed.artifact.manifest.packageKey,
      afterSnapshot: {
        checksum: parsed.artifact.contentChecksum,
        items: plan.items,
      },
    });
    return { dryRun: false, items: plan.items };
  }
}
