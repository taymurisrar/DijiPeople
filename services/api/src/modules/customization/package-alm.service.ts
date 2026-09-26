/*
 * Package application lifecycle: publishers, released versions, package
 * dependencies, portable export, staged import, uninstall and environment
 * variables.
 *
 * TASK-0033 / EXECPLAN-0052. This sits ON TOP of the existing package layer in
 * CustomizationService — the same CustomizationSolution rows, the same layer
 * model, the same publish snapshot the runtime reads. It adds lifecycle, not a
 * second customization system.
 *
 * Tenant isolation: every query is scoped by `currentUser.tenantId`, and every
 * record addressed by id is loaded with `{ id, tenantId }`. An artifact carries
 * no tenant, id or user field, and the importer would ignore one if it did —
 * everything it writes is keyed by the caller's tenant.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CustomizationPackageOperation,
  CustomizationSolution,
  CustomizationSolutionComponentType,
  Prisma,
  TenantEnvironmentType,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from '../../common/constants/audit-actions';
import { SecretEncryptionService } from '../../common/security/secret-encryption.service';
import { AuditService } from '../audit/audit.service';
import { CustomizationService } from './customization.service';
import {
  CUSTOMIZATION_METADATA_SCHEMA_VERSION,
  PUBLISHER_PREFIX_PATTERN,
  RESERVED_PUBLISHER_PREFIXES,
  SYSTEM_PUBLISHER_KEY,
  buildPackageArtifact,
  bumpVersion,
  canonicalJson,
  compareSemver,
  findPackageDependencyCycle,
  isSemver,
  parsePackageArtifact,
  parseSemver,
  satisfiesVersionRange,
  sha256,
  type PackageArtifact,
  type PackageManifest,
  type PortableComponent,
} from './package-artifact';
import {
  comparePackageToTarget,
  describeKey,
  type ComparisonResult,
} from './package-comparison';
import { PackagePortableReader, parseKey } from './package-portable.reader';
import { packageKind } from './package-kind';
import type {
  CreateCustomizationPublisherDto,
  CreateEnvironmentVariableDto,
  ExecutePackageImportDto,
  ReleasePackageDto,
  SetPackageDependenciesDto,
} from './dto/package-alm.dto';

type Db = PrismaService | Prisma.TransactionClient;

export type PackageIssue = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  componentKey?: string | null;
  /* What the administrator can do about it, when there is something. */
  remedy?: { action: 'addComponent' | 'addDependency'; target: string } | null;
};

const IMPORT_TRANSACTION_TIMEOUT_MS = 120_000;
const LEGACY_UNASSIGNED_PACKAGE_KEY = 'unassigned-draft-customizations';

@Injectable()
export class PackageAlmService {
  private readonly logger = new Logger(PackageAlmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customization: CustomizationService,
    private readonly reader: PackagePortableReader,
    private readonly audit: AuditService,
    private readonly encryption: SecretEncryptionService,
  ) {}

  /* ============================================================ publishers */

  async listPublishers(currentUser: AuthenticatedUser) {
    const publishers = await this.prisma.customizationPublisher.findMany({
      where: { tenantId: currentUser.tenantId },
      include: { _count: { select: { packages: true } } },
      orderBy: { displayName: 'asc' },
    });
    return [
      {
        id: `system:${SYSTEM_PUBLISHER_KEY}`,
        publisherKey: SYSTEM_PUBLISHER_KEY,
        displayName: 'DijiPeople',
        prefix: '',
        isSystem: true,
        packageCount: 1,
      },
      ...publishers.map((publisher) => ({
        id: publisher.id,
        publisherKey: publisher.publisherKey,
        displayName: publisher.displayName,
        prefix: publisher.prefix,
        description: publisher.description,
        isSystem: publisher.isSystem,
        packageCount: publisher._count.packages,
      })),
    ];
  }

  async createPublisher(
    currentUser: AuthenticatedUser,
    dto: CreateCustomizationPublisherDto,
  ) {
    this.assertPrefixAllowed(dto.prefix);
    if (dto.publisherKey === SYSTEM_PUBLISHER_KEY) {
      throw this.readOnly('The DijiPeople publisher is reserved.');
    }
    const clash = await this.prisma.customizationPublisher.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        OR: [{ prefix: dto.prefix }, { publisherKey: dto.publisherKey }],
      },
    });
    if (clash) {
      throw new AppError('VALIDATION_FAILED', {
        message:
          clash.prefix === dto.prefix
            ? `Prefix ${dto.prefix} is already used by publisher ${clash.displayName}.`
            : `Publisher key ${dto.publisherKey} is already in use.`,
        statusCode: 409,
      });
    }
    const publisher = await this.prisma.customizationPublisher.create({
      data: {
        tenantId: currentUser.tenantId,
        publisherKey: dto.publisherKey,
        displayName: dto.displayName.trim(),
        prefix: dto.prefix,
        description: dto.description?.trim() || null,
        createdByUserId: currentUser.userId,
        updatedByUserId: currentUser.userId,
      },
    });
    await this.audit.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: AUDIT_ACTIONS.PACKAGE_PUBLISHER_CREATED,
      entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_PUBLISHER,
      entityId: publisher.id,
      sourceModule: 'customization',
      afterSnapshot: {
        publisherKey: publisher.publisherKey,
        prefix: publisher.prefix,
        displayName: publisher.displayName,
      },
    });
    return publisher;
  }

  /**
   * The publisher a package's logical names must carry, creating it from the
   * package key's prefix when a package predates stored publishers.
   */
  async ensurePackagePublisher(
    currentUser: AuthenticatedUser,
    record: CustomizationSolution,
    publisherName?: string | null,
    db: Db = this.prisma,
  ) {
    if (record.publisherId) {
      const existing = await db.customizationPublisher.findFirst({
        where: { id: record.publisherId, tenantId: currentUser.tenantId },
      });
      if (existing) return existing;
    }
    const prefix = /^([a-z][a-z0-9]*)_/.exec(record.solutionKey)?.[1];
    if (!prefix) return null;
    const publisher =
      (await db.customizationPublisher.findFirst({
        where: { tenantId: currentUser.tenantId, prefix },
      })) ??
      (await db.customizationPublisher.create({
        data: {
          tenantId: currentUser.tenantId,
          publisherKey: prefix,
          displayName:
            publisherName?.trim() || currentUser.tenantName?.trim() || prefix,
          prefix,
          createdByUserId: currentUser.userId,
          updatedByUserId: currentUser.userId,
        },
      }));
    await db.customizationSolution.update({
      where: { id: record.id },
      data: { publisherId: publisher.id },
    });
    return publisher;
  }

  /* ================================================ lifecycle / overview */

  async getLifecycle(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.findPackage(currentUser, packageId);
    const [publisher, dependencies, versions, dependents, operations] =
      await Promise.all([
        record.isDefault
          ? Promise.resolve(null)
          : this.ensurePackagePublisher(currentUser, record),
        this.prisma.customizationPackageDependency.findMany({
          where: { tenantId: currentUser.tenantId, packageId: record.id },
          orderBy: { dependsOnPackageKey: 'asc' },
        }),
        this.prisma.customizationPackageVersion.findMany({
          where: { tenantId: currentUser.tenantId, packageId: record.id },
          orderBy: { releasedAt: 'desc' },
          select: {
            id: true,
            version: true,
            checksum: true,
            componentCount: true,
            notes: true,
            releasedAt: true,
            releasedByUserId: true,
          },
        }),
        this.prisma.customizationPackageDependency.findMany({
          where: {
            tenantId: currentUser.tenantId,
            dependsOnPackageKey: record.solutionKey,
          },
          include: {
            package: {
              select: {
                id: true,
                solutionKey: true,
                displayName: true,
                version: true,
              },
            },
          },
        }),
        this.prisma.customizationPackageOperation.findMany({
          where: {
            tenantId: currentUser.tenantId,
            packageKey: record.solutionKey,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: operationSummarySelect,
        }),
      ]);
    const installedPackages = await this.installedPackageVersions(
      currentUser,
      dependencies.map((dependency) => dependency.dependsOnPackageKey),
    );

    return {
      packageId: record.id,
      packageKey: record.solutionKey,
      kind: packageKind(record),
      version: record.isDefault
        ? CUSTOMIZATION_METADATA_SCHEMA_VERSION
        : record.version,
      origin: record.origin,
      installedVersion: record.installedVersion,
      installedAt: record.installedAt,
      sourceEnvironmentType: record.sourceEnvironmentType,
      publisher: record.isDefault
        ? {
            publisherKey: SYSTEM_PUBLISHER_KEY,
            displayName: 'DijiPeople',
            prefix: '',
          }
        : publisher
          ? {
              publisherKey: publisher.publisherKey,
              displayName: publisher.displayName,
              prefix: publisher.prefix,
            }
          : null,
      permissions: this.packageActions(record),
      dependencies: dependencies.map((dependency) => {
        const installed = installedPackages.get(dependency.dependsOnPackageKey);
        return {
          packageKey: dependency.dependsOnPackageKey,
          publisherKey: dependency.dependsOnPublisherKey,
          displayName:
            dependency.dependsOnDisplayName ??
            installed?.displayName ??
            dependency.dependsOnPackageKey,
          minVersion: dependency.minVersion,
          maxVersion: dependency.maxVersion,
          availableVersion: installed?.version ?? null,
          satisfied: installed
            ? satisfiesVersionRange(
                installed.version,
                dependency.minVersion,
                dependency.maxVersion,
              )
            : false,
        };
      }),
      dependents: dependents.map((dependent) => ({
        packageId: dependent.package.id,
        packageKey: dependent.package.solutionKey,
        displayName: dependent.package.displayName,
        version: dependent.package.version,
        minVersion: dependent.minVersion,
      })),
      versions,
      recentOperations: operations,
    };
  }

  async setDependencies(
    currentUser: AuthenticatedUser,
    packageId: string,
    dto: SetPackageDependenciesDto,
  ) {
    const record = await this.findPackage(currentUser, packageId);
    this.assertEditable(record);
    const keys = dto.dependencies.map((dependency) => dependency.packageKey);
    if (keys.includes(record.solutionKey)) {
      throw this.validation('A package cannot depend on itself.');
    }
    if (new Set(keys).size !== keys.length) {
      throw this.validation(
        'Each package can be listed as a dependency only once.',
      );
    }
    for (const dependency of dto.dependencies) {
      if (
        dependency.maxVersion &&
        compareSemver(dependency.maxVersion, dependency.minVersion) < 0
      ) {
        throw this.validation(
          `${dependency.packageKey}: the maximum version is lower than the minimum.`,
        );
      }
    }

    /* Refuse a cycle across every package in this workspace. */
    const existing = await this.prisma.customizationPackageDependency.findMany({
      where: { tenantId: currentUser.tenantId, NOT: { packageId: record.id } },
      include: { package: { select: { solutionKey: true } } },
    });
    const edges = new Map<string, string[]>();
    for (const edge of existing) {
      edges.set(edge.package.solutionKey, [
        ...(edges.get(edge.package.solutionKey) ?? []),
        edge.dependsOnPackageKey,
      ]);
    }
    edges.set(record.solutionKey, keys);
    const cycle = findPackageDependencyCycle(edges);
    if (cycle) {
      throw this.validation(
        `These dependencies would create a cycle: ${cycle.join(' → ')}. Packages cannot depend on each other in a loop.`,
      );
    }

    const before = await this.prisma.customizationPackageDependency.findMany({
      where: { tenantId: currentUser.tenantId, packageId: record.id },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.customizationPackageDependency.deleteMany({
        where: { tenantId: currentUser.tenantId, packageId: record.id },
      });
      if (dto.dependencies.length) {
        await tx.customizationPackageDependency.createMany({
          data: dto.dependencies.map((dependency) => ({
            tenantId: currentUser.tenantId,
            packageId: record.id,
            dependsOnPackageKey: dependency.packageKey,
            dependsOnPublisherKey: dependency.publisherKey ?? null,
            dependsOnDisplayName: dependency.displayName?.trim() || null,
            minVersion: dependency.minVersion,
            maxVersion: dependency.maxVersion ?? null,
          })),
        });
      }
      await this.audit.log(
        {
          tenantId: currentUser.tenantId,
          actorUserId: currentUser.userId,
          action: AUDIT_ACTIONS.PACKAGE_DEPENDENCIES_UPDATED,
          entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_PACKAGE,
          entityId: record.id,
          sourceModule: 'customization',
          beforeSnapshot: { dependencies: before.map(dependencySnapshot) },
          afterSnapshot: {
            dependencies: dto.dependencies.map((dependency) => ({
              packageKey: dependency.packageKey,
              minVersion: dependency.minVersion,
              maxVersion: dependency.maxVersion ?? null,
            })),
          },
        },
        tx,
      );
    });
    return this.getLifecycle(currentUser, record.id);
  }

  /* ============================================================ validation */

  /**
   * Everything that would make this package fail to import somewhere else,
   * found here, before release. ERROR blocks release and export; WARNING and
   * INFO are reported and allowed.
   */
  async validateForRelease(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.findPackage(currentUser, packageId);
    const issues: PackageIssue[] = [];

    if (record.isDefault || record.isSystem) {
      issues.push(
        issue(
          'SYSTEM_PACKAGE',
          'error',
          'DijiPeople Core is released by the platform, not from a workspace.',
        ),
      );
    } else if (record.isManaged || record.origin === 'IMPORTED') {
      issues.push(
        issue(
          'INSTALLED_PACKAGE',
          'error',
          'This package was installed from another environment. Release it where it is authored.',
        ),
      );
    } else if (record.solutionKey === LEGACY_UNASSIGNED_PACKAGE_KEY) {
      issues.push(
        issue(
          'LEGACY_PACKAGE',
          'error',
          'Move these drafts into a real package before releasing.',
        ),
      );
    }

    const publisher = record.isDefault
      ? null
      : await this.ensurePackagePublisher(currentUser, record);
    if (!record.isDefault && !publisher) {
      issues.push(
        issue(
          'NO_PUBLISHER',
          'error',
          `Package key ${record.solutionKey} carries no publisher prefix, so it cannot be released.`,
        ),
      );
    } else if (publisher && !PUBLISHER_PREFIX_PATTERN.test(publisher.prefix)) {
      issues.push(
        issue(
          'INVALID_PREFIX',
          'error',
          `Publisher prefix ${publisher.prefix} is not valid for release (2-8 lowercase letters or digits).`,
        ),
      );
    } else if (
      publisher &&
      RESERVED_PUBLISHER_PREFIXES.includes(publisher.prefix)
    ) {
      issues.push(
        issue(
          'RESERVED_PREFIX',
          'error',
          `Prefix ${publisher.prefix} is reserved for DijiPeople.`,
        ),
      );
    }

    const read = await this.reader.readPackage(currentUser.tenantId, record.id);
    const componentRows =
      await this.prisma.customizationSolutionComponent.findMany({
        where: { tenantId: currentUser.tenantId, solutionId: record.id },
        select: { componentType: true, lifecycleState: true, objectKey: true },
      });
    const unsupported = componentRows.filter(
      (row) =>
        !read.rowByKey.has(`${row.componentType}:${row.objectKey}`) &&
        row.lifecycleState !== 'retired',
    );
    const componentKeys = new Set(
      read.components.map((component) => component.key),
    );
    for (const row of unsupported) {
      if (
        [...componentKeys].some(
          (key) =>
            key.startsWith(`${row.componentType}:`) &&
            key.endsWith(row.objectKey.split('.').pop() ?? ''),
        )
      ) {
        continue;
      }
      issues.push(
        issue(
          'UNSUPPORTED_COMPONENT',
          'warning',
          `${row.componentType} ${row.objectKey} cannot be carried by a package yet and will be left out.`,
        ),
      );
    }

    if (!read.components.length) {
      issues.push(
        issue(
          'EMPTY_PACKAGE',
          'error',
          'The package has no components to release.',
        ),
      );
    }

    const drafts = componentRows.filter(
      (row) => row.lifecycleState === 'draft',
    ).length;
    if (drafts) {
      issues.push(
        issue(
          'DRAFTS_WILL_PUBLISH',
          'warning',
          `${drafts} draft component(s) will be published in this workspace by the release.`,
        ),
      );
    }

    /* Prefix discipline: what this publisher creates carries its prefix. */
    if (publisher) {
      for (const component of read.components) {
        if (
          component.type !== 'column' ||
          component.layerAction !== 'create' ||
          component.baseIsSystem
        )
          continue;
        const local = component.objectKey.split('.').pop() ?? '';
        if (!local.startsWith(`${publisher.prefix}_`)) {
          issues.push({
            ...issue(
              'PREFIX_MISMATCH',
              'error',
              `Field ${component.objectKey} does not use this package's publisher prefix ${publisher.prefix}_. Move it to a package of its own publisher, or recreate it with the prefix.`,
            ),
            componentKey: component.key,
          });
        }
      }
    }

    /* Component dependencies outside the package. */
    const external = new Set<string>();
    for (const component of read.components) {
      for (const dependency of component.dependsOn) {
        if (!componentKeys.has(dependency)) external.add(dependency);
      }
    }
    const declared = await this.prisma.customizationPackageDependency.findMany({
      where: { tenantId: currentUser.tenantId, packageId: record.id },
    });
    const declaredKeys = new Set(
      declared.map((dependency) => dependency.dependsOnPackageKey),
    );
    if (external.size) {
      const { target } = await this.reader.readTargetIndex({
        tenantId: currentUser.tenantId,
        importingPackageKey: record.solutionKey,
        keys: [...external],
      });
      for (const key of [...external].sort()) {
        const entry = target.get(key);
        const needers = read.components
          .filter((component) => component.dependsOn.includes(key))
          .map((component) => component.objectKey);
        if (!entry) {
          issues.push({
            ...issue(
              'MISSING_COMPONENT',
              'error',
              `${describeKey(key)} is required by ${needers.join(', ')} but does not exist.`,
            ),
            componentKey: key,
          });
        } else if (entry.ownerKind === 'core') {
          issues.push({
            ...issue(
              'CORE_DEPENDENCY',
              'info',
              `${needers.join(', ')} build on ${describeKey(key)} from DijiPeople Core.`,
            ),
            componentKey: key,
          });
        } else if (
          entry.ownerKind === 'package' &&
          entry.ownerPackageKey &&
          declaredKeys.has(entry.ownerPackageKey)
        ) {
          issues.push({
            ...issue(
              'DECLARED_DEPENDENCY',
              'info',
              `${describeKey(key)} comes from ${entry.ownerPackageName}, a declared dependency.`,
            ),
            componentKey: key,
          });
        } else if (entry.ownerKind === 'package' && entry.ownerPackageKey) {
          issues.push({
            ...issue(
              'UNDECLARED_DEPENDENCY',
              'error',
              `${describeKey(key)} is required by ${needers.join(', ')} and belongs to ${entry.ownerPackageName}, which this package does not declare as a dependency.`,
            ),
            componentKey: key,
            remedy: { action: 'addDependency', target: entry.ownerPackageKey },
          });
        } else {
          issues.push({
            ...issue(
              'UNPACKAGED_DEPENDENCY',
              'error',
              `${describeKey(key)} is required by ${needers.join(', ')} but belongs to no package. Add it to this package.`,
            ),
            componentKey: key,
            remedy: { action: 'addComponent', target: key },
          });
        }
      }
    }

    for (const component of read.components) {
      if (component.layerAction !== 'reference' || !component.baseIsSystem) {
        continue;
      }
      issues.push({
        ...issue(
          'CORE_DEPENDENCY',
          'info',
          `This package extends ${describeKey(component.key)} from DijiPeople Core, which every environment has.`,
        ),
        componentKey: component.key,
      });
    }

    /* Declared dependencies must be present here at a satisfying version. */
    const installed = await this.installedPackageVersions(currentUser, [
      ...declaredKeys,
    ]);
    for (const dependency of declared) {
      const present = installed.get(dependency.dependsOnPackageKey);
      if (!present) {
        issues.push(
          issue(
            'DEPENDENCY_NOT_PRESENT',
            'error',
            `Dependency ${dependency.dependsOnDisplayName ?? dependency.dependsOnPackageKey} >= ${dependency.minVersion} is not present in this workspace.`,
          ),
        );
      } else if (
        !satisfiesVersionRange(
          present.version,
          dependency.minVersion,
          dependency.maxVersion,
        )
      ) {
        issues.push(
          issue(
            'DEPENDENCY_VERSION',
            'warning',
            `Dependency ${present.displayName} is at ${present.version} here, outside the declared range ${dependency.minVersion}${dependency.maxVersion ? ` – ${dependency.maxVersion}` : '+'}.`,
          ),
        );
      } else {
        issues.push(
          issue(
            'DEPENDENCY_OK',
            'info',
            `Requires ${present.displayName} >= ${dependency.minVersion} (available ${present.version}).`,
          ),
        );
      }
    }

    for (const component of read.components) {
      if (
        component.type === 'environmentVariable' &&
        component.definition?.isRequired &&
        component.definition.defaultValue == null
      ) {
        issues.push({
          ...issue(
            'ENVIRONMENT_VALUE_REQUIRED',
            'info',
            `Environment variable ${component.objectKey} must be given a value in every environment it is imported into.`,
          ),
          componentKey: component.key,
        });
      }
    }

    const latest = await this.latestVersion(currentUser, record.id);
    if (
      latest &&
      isSemver(record.version) &&
      compareSemver(record.version, latest.version) <= 0
    ) {
      issues.push(
        issue(
          'VERSION_NOT_HIGHER',
          'error',
          `The working version ${record.version} is not higher than the last release ${latest.version}.`,
        ),
      );
    }

    return summarizeIssues(issues, read.components.length);
  }

  /* =============================================================== release */

  async release(
    currentUser: AuthenticatedUser,
    packageId: string,
    dto: ReleasePackageDto,
  ) {
    let record = await this.findPackage(currentUser, packageId);
    this.assertEditable(record);
    /*
     * Checked before anything is written: a refused release must leave the
     * working version exactly where it was.
     */
    const requested = dto.version ?? record.version;
    const latest = await this.latestVersion(currentUser, record.id);
    if (latest && compareSemver(requested, latest.version) <= 0) {
      throw new AppError('PACKAGE_VERSION_CONFLICT', {
        message: `Version ${requested} is not higher than the last release ${latest.version}. A released version is immutable.`,
      });
    }
    if (dto.version && dto.version !== record.version) {
      record = await this.prisma.customizationSolution.update({
        where: { id: record.id },
        data: { version: dto.version, updatedByUserId: currentUser.userId },
      });
    }
    const validation = await this.validateForRelease(currentUser, record.id);
    if (!validation.valid) {
      throw new AppError('PACKAGE_VALIDATION_FAILED', {
        details: { issues: validation.issues },
      });
    }

    /* Release publishes the package's drafts through the existing path. */
    const drafts = await this.prisma.customizationSolutionComponent.findMany({
      where: {
        tenantId: currentUser.tenantId,
        solutionId: record.id,
        lifecycleState: 'draft',
      },
      select: { id: true },
    });
    if (drafts.length) {
      await this.customization.publishComponents(
        currentUser,
        drafts.map((draft) => draft.id),
      );
    }

    const artifact = await this.buildArtifact(currentUser, record);
    const existing = await this.prisma.customizationPackageVersion.findUnique({
      where: {
        packageId_version: { packageId: record.id, version: record.version },
      },
    });
    if (existing) {
      throw new AppError('PACKAGE_VERSION_CONFLICT', {
        message: `Version ${record.version} of this package was already released.`,
      });
    }
    const nextVersion = bumpVersion(record.version, dto.nextBump ?? 'patch');
    const version = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customizationPackageVersion.create({
        data: {
          tenantId: currentUser.tenantId,
          packageId: record.id,
          version: record.version,
          artifactJson: artifact.artifact as unknown as Prisma.InputJsonValue,
          checksum: artifact.artifact.contentChecksum,
          componentCount: artifact.artifact.components.length,
          notes: dto.notes?.trim() || null,
          releasedByUserId: currentUser.userId,
        },
      });
      await tx.customizationSolution.update({
        where: { id: record.id },
        data: { version: nextVersion, updatedByUserId: currentUser.userId },
      });
      await this.audit.log(
        {
          tenantId: currentUser.tenantId,
          actorUserId: currentUser.userId,
          action: AUDIT_ACTIONS.PACKAGE_RELEASED,
          entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_PACKAGE,
          entityId: record.id,
          sourceModule: 'customization',
          afterSnapshot: {
            packageKey: record.solutionKey,
            version: created.version,
            checksum: created.checksum,
            componentCount: created.componentCount,
            nextWorkingVersion: nextVersion,
          },
        },
        tx,
      );
      return created;
    });

    this.logger.log(
      JSON.stringify({
        event: 'PACKAGE_RELEASED',
        tenantId: currentUser.tenantId,
        packageKey: record.solutionKey,
        version: version.version,
        checksum: version.checksum,
      }),
    );
    return {
      id: version.id,
      version: version.version,
      checksum: version.checksum,
      componentCount: version.componentCount,
      releasedAt: version.releasedAt,
      nextWorkingVersion: nextVersion,
      validation,
    };
  }

  private async buildArtifact(
    currentUser: AuthenticatedUser,
    record: CustomizationSolution,
  ) {
    const publisher = await this.ensurePackagePublisher(currentUser, record);
    if (!publisher) {
      throw this.validation('The package has no publisher prefix.');
    }
    const [read, dependencies, tenant] = await Promise.all([
      this.reader.readPackage(currentUser.tenantId, record.id),
      this.prisma.customizationPackageDependency.findMany({
        where: { tenantId: currentUser.tenantId, packageId: record.id },
      }),
      this.prisma.tenant.findUnique({
        where: { id: currentUser.tenantId },
        select: { environmentType: true },
      }),
    ]);
    const packageKeys = new Set(
      read.components.map((component) => component.key),
    );
    /*
     * What the package builds on from outside itself: dependencies it does not
     * carry, plus the DijiPeople Core components it only references (a field
     * added to Employees references the Employees module; it never ships it).
     */
    const coreDependencies = [
      ...read.components
        .flatMap((component) => component.dependsOn)
        .filter((key) => !packageKeys.has(key)),
      ...read.components
        .filter(
          (component) =>
            component.layerAction === 'reference' && component.baseIsSystem,
        )
        .map((component) => component.key),
    ];

    const manifest: Omit<PackageManifest, 'componentCount' | 'signature'> = {
      packageKey: record.solutionKey,
      displayName: record.displayName,
      description: record.description ?? null,
      version: record.version,
      publisher: {
        publisherKey: publisher.publisherKey,
        displayName: publisher.displayName,
        prefix: publisher.prefix,
      },
      metadataSchemaVersion: CUSTOMIZATION_METADATA_SCHEMA_VERSION,
      sourceEnvironmentType: tenant?.environmentType ?? null,
      releasedAt: null,
      dependencies: dependencies.map((dependency) => ({
        packageKey: dependency.dependsOnPackageKey,
        publisherKey: dependency.dependsOnPublisherKey,
        displayName: dependency.dependsOnDisplayName,
        minVersion: dependency.minVersion,
        maxVersion: dependency.maxVersion,
      })),
      coreDependencies,
    };
    try {
      return buildPackageArtifact({ manifest, components: read.components });
    } catch (error) {
      throw this.validation(
        error instanceof Error
          ? error.message
          : 'The package could not be serialized.',
      );
    }
  }

  async listVersions(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.findPackage(currentUser, packageId);
    return this.prisma.customizationPackageVersion.findMany({
      where: { tenantId: currentUser.tenantId, packageId: record.id },
      orderBy: { releasedAt: 'desc' },
      select: {
        id: true,
        version: true,
        checksum: true,
        componentCount: true,
        notes: true,
        releasedAt: true,
        releasedByUserId: true,
      },
    });
  }

  /**
   * The `.djpkg` bytes for a released version. Re-serialized canonically from
   * the stored artifact, so every export of the same version is identical.
   */
  async exportVersion(
    currentUser: AuthenticatedUser,
    packageId: string,
    version?: string,
  ) {
    const record = await this.findPackage(currentUser, packageId);
    if (record.isDefault || record.isSystem) {
      throw this.readOnly(
        'DijiPeople Core ships with the platform and is not exported.',
      );
    }
    const stored = version
      ? await this.prisma.customizationPackageVersion.findFirst({
          where: {
            tenantId: currentUser.tenantId,
            packageId: record.id,
            version,
          },
        })
      : await this.latestVersion(currentUser, record.id, true);
    if (!stored) {
      throw this.validation(
        version
          ? `Version ${version} of this package has not been released.`
          : 'Release a version of this package before exporting it.',
      );
    }
    const content = canonicalJson(stored.artifactJson);
    /* A stored artifact that no longer verifies must never be handed out. */
    const verified = parsePackageArtifact(content);
    if (
      !verified.artifact ||
      verified.artifact.contentChecksum !== stored.checksum
    ) {
      this.logger.error(
        `Stored artifact ${record.solutionKey}@${stored.version} failed verification.`,
      );
      throw new AppError('SYSTEM_UNEXPECTED_ERROR', {
        message:
          'The stored package version failed its integrity check and was not exported.',
      });
    }
    await this.audit.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: AUDIT_ACTIONS.PACKAGE_EXPORTED,
      entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_PACKAGE,
      entityId: record.id,
      sourceModule: 'customization',
      afterSnapshot: {
        packageKey: record.solutionKey,
        version: stored.version,
        checksum: stored.checksum,
      },
    });
    const safeName =
      record.displayName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
      record.solutionKey;
    return {
      fileName: `${safeName}-${stored.version}.djpkg`,
      content,
      checksum: stored.checksum,
    };
  }

  /* =============================================================== import */

  /**
   * Stage 1-10: everything short of changing metadata. Persists the plan as an
   * operation so the administrator reviews exactly what `executeImport` will
   * apply, and so a refused package still leaves a diagnosis in the history.
   */
  async analyzeImport(
    currentUser: AuthenticatedUser,
    file: { buffer: Buffer; originalname?: string } | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw this.validation('Choose a .djpkg file to import.');
    }
    const correlationId = randomUUID();
    this.logger.log(
      JSON.stringify({
        event: 'PACKAGE_IMPORT_STARTED',
        tenantId: currentUser.tenantId,
        correlationId,
        bytes: file.buffer.length,
      }),
    );

    const parsed = parsePackageArtifact(file.buffer);
    if (!parsed.artifact) {
      const operation = await this.prisma.customizationPackageOperation.create({
        data: {
          tenantId: currentUser.tenantId,
          kind: 'IMPORT',
          status: 'BLOCKED',
          packageKey: 'unknown',
          packageDisplayName:
            file.originalname?.slice(0, 200) || 'Uploaded package',
          version: '0.0.0',
          correlationId,
          actorUserId: currentUser.userId,
          errorJson: { problems: parsed.problems } as Prisma.InputJsonValue,
          planJson: {
            packageIssues: parsed.problems.map((problem) => ({
              code: 'INVALID_ARTIFACT',
              severity: 'error',
              message: problem.path
                ? `${problem.message} (${problem.path})`
                : problem.message,
            })),
          } as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      this.logger.warn(
        JSON.stringify({
          event: 'PACKAGE_MANIFEST_REJECTED',
          tenantId: currentUser.tenantId,
          correlationId,
          problems: parsed.problems.length,
        }),
      );
      return this.operationResponse(operation);
    }

    const artifact = parsed.artifact;
    const plan = await this.buildImportPlan(currentUser, artifact, false);
    const status = plan.blocking ? 'BLOCKED' : 'READY';

    const operation = await this.prisma.$transaction(async (tx) => {
      /* A newer analysis of the same package replaces a pending one. */
      await tx.customizationPackageOperation.updateMany({
        where: {
          tenantId: currentUser.tenantId,
          packageKey: artifact.manifest.packageKey,
          kind: 'IMPORT',
          status: 'READY',
        },
        data: { status: 'SUPERSEDED' },
      });
      const created = await tx.customizationPackageOperation.create({
        data: {
          tenantId: currentUser.tenantId,
          packageId: plan.existingPackageId,
          kind: 'IMPORT',
          status,
          packageKey: artifact.manifest.packageKey,
          packageDisplayName: artifact.manifest.displayName,
          publisherKey: artifact.manifest.publisher.publisherKey,
          version: artifact.manifest.version,
          previousVersion: plan.installedVersion,
          artifactChecksum: artifact.contentChecksum,
          artifactJson: artifact as unknown as Prisma.InputJsonValue,
          planJson: plan.stored as unknown as Prisma.InputJsonValue,
          correlationId,
          createdCount: plan.comparison.summary.NEW,
          updatedCount:
            plan.comparison.summary.UPDATE +
            plan.comparison.summary.TARGET_MODIFIED,
          unchangedCount: plan.comparison.summary.MATCHING,
          skippedCount: plan.comparison.summary.SKIPPED,
          conflictCount:
            plan.comparison.summary.CONFLICT +
            plan.comparison.summary.MISSING_DEPENDENCY +
            plan.comparison.summary.INCOMPATIBLE,
          warningCount:
            plan.packageIssues.filter((entry) => entry.severity === 'warning')
              .length + plan.comparison.summary.TARGET_MODIFIED,
          actorUserId: currentUser.userId,
        },
      });
      await this.audit.log(
        {
          tenantId: currentUser.tenantId,
          actorUserId: currentUser.userId,
          action: AUDIT_ACTIONS.PACKAGE_IMPORT_ANALYZED,
          entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_PACKAGE_OPERATION,
          entityId: created.id,
          sourceModule: 'customization',
          afterSnapshot: {
            packageKey: created.packageKey,
            version: created.version,
            status: created.status,
            mode: plan.mode,
            correlationId,
          },
        },
        tx,
      );
      return created;
    });
    this.logger.log(
      JSON.stringify({
        event: 'PACKAGE_DEPENDENCY_VALIDATION_COMPLETED',
        tenantId: currentUser.tenantId,
        correlationId,
        operationId: operation.id,
        status,
        mode: plan.mode,
      }),
    );
    return this.operationResponse(operation);
  }

  /**
   * Package-level analysis plus the per-component comparison. Pure reads.
   * `allowDowngrade` only ever lifts the DOWNGRADE block, nothing else.
   */
  private async buildImportPlan(
    currentUser: AuthenticatedUser,
    artifact: PackageArtifact,
    allowDowngrade: boolean,
    db: Db = this.prisma,
  ) {
    const manifest = artifact.manifest;
    const packageIssues: PackageIssue[] = [];

    /* Platform compatibility. */
    const server = parseSemver(CUSTOMIZATION_METADATA_SCHEMA_VERSION)!;
    const source = parseSemver(manifest.metadataSchemaVersion)!;
    if (source.major !== server.major) {
      packageIssues.push(
        issue(
          'PLATFORM_INCOMPATIBLE',
          'error',
          `This package was written for metadata schema ${manifest.metadataSchemaVersion}; this environment reads ${CUSTOMIZATION_METADATA_SCHEMA_VERSION}. Major versions must match.`,
        ),
      );
    } else if (source.minor > server.minor) {
      packageIssues.push(
        issue(
          'PLATFORM_OLDER',
          'error',
          `This package was exported from a newer DijiPeople platform (metadata schema ${manifest.metadataSchemaVersion}). Update this environment first; it reads ${CUSTOMIZATION_METADATA_SCHEMA_VERSION}.`,
        ),
      );
    }

    /* The package's identity in this workspace. */
    const existing = await db.customizationSolution.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        solutionKey: manifest.packageKey,
      },
    });
    let mode: 'INSTALL' | 'UPGRADE' | 'REINSTALL' | 'DOWNGRADE' = 'INSTALL';
    if (existing) {
      if (existing.isDefault || existing.isSystem) {
        packageIssues.push(
          issue(
            'SYSTEM_COLLISION',
            'error',
            'This package key belongs to DijiPeople Core.',
          ),
        );
      } else if (existing.origin !== 'IMPORTED') {
        packageIssues.push(
          issue(
            'AUTHORED_HERE',
            'error',
            `${existing.displayName} is authored in this workspace. Importing it here would overwrite the source of truth. Import it into a different environment.`,
          ),
        );
      } else if (
        existing.installedVersion &&
        isSemver(existing.installedVersion)
      ) {
        const order = compareSemver(
          manifest.version,
          existing.installedVersion,
        );
        if (order > 0) {
          mode = 'UPGRADE';
          packageIssues.push(
            issue(
              'UPGRADE',
              'info',
              `Upgrade from ${existing.installedVersion} to ${manifest.version}.`,
            ),
          );
        } else if (order === 0) {
          mode = 'REINSTALL';
          const installed = await db.customizationPackageVersion.findFirst({
            where: {
              tenantId: currentUser.tenantId,
              packageId: existing.id,
              version: manifest.version,
            },
            select: { checksum: true },
          });
          if (installed && installed.checksum !== artifact.contentChecksum) {
            packageIssues.push(
              issue(
                'SAME_VERSION_DIFFERENT_CONTENT',
                'error',
                `Version ${manifest.version} is already installed with different content. A released version is immutable; the source must release a new version.`,
              ),
            );
          } else {
            packageIssues.push(
              issue(
                'ALREADY_INSTALLED',
                'info',
                `Version ${manifest.version} is already installed. Only components changed in this workspace since then will be restored.`,
              ),
            );
          }
        } else {
          mode = 'DOWNGRADE';
          packageIssues.push(
            issue(
              'DOWNGRADE',
              allowDowngrade ? 'warning' : 'error',
              `Version ${existing.installedVersion} is installed and this package is the older ${manifest.version}. A downgrade can reintroduce fixed problems and silently drop metadata newer versions added${allowDowngrade ? '; proceeding because the downgrade override was chosen.' : '. It is blocked unless the downgrade override is chosen.'}`,
            ),
          );
        }
      }
    }

    /* Publisher: the prefix belongs to exactly one publisher per workspace. */
    const publisherClash = await db.customizationPublisher.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        OR: [
          {
            prefix: manifest.publisher.prefix,
            NOT: { publisherKey: manifest.publisher.publisherKey },
          },
          {
            publisherKey: manifest.publisher.publisherKey,
            NOT: { prefix: manifest.publisher.prefix },
          },
        ],
      },
    });
    if (publisherClash) {
      packageIssues.push(
        issue(
          'PUBLISHER_COLLISION',
          'error',
          publisherClash.prefix === manifest.publisher.prefix
            ? `Prefix ${manifest.publisher.prefix} already belongs to publisher ${publisherClash.displayName} here. Two publishers cannot share a prefix.`
            : `Publisher ${manifest.publisher.publisherKey} uses prefix ${publisherClash.prefix} here, not ${manifest.publisher.prefix}.`,
        ),
      );
    }

    /* Package dependencies against what this workspace has. */
    const installed = await this.installedPackageVersions(
      currentUser,
      manifest.dependencies.map((dependency) => dependency.packageKey),
      db,
    );
    for (const dependency of manifest.dependencies) {
      const present = installed.get(dependency.packageKey);
      const label = dependency.displayName ?? dependency.packageKey;
      const range = `${dependency.minVersion}${dependency.maxVersion ? ` – ${dependency.maxVersion}` : '+'}`;
      if (!present) {
        packageIssues.push(
          issue(
            'DEPENDENCY_MISSING',
            'error',
            `Required dependency ${label} ${range} is not installed. Install it before importing this package.`,
          ),
        );
      } else if (
        !satisfiesVersionRange(
          present.version,
          dependency.minVersion,
          dependency.maxVersion,
        )
      ) {
        packageIssues.push(
          issue(
            'DEPENDENCY_VERSION',
            'error',
            `Required dependency ${label} ${range}; installed ${present.version}. ${compareSemver(present.version, dependency.minVersion) < 0 ? `Upgrade ${label}` : `Install a compatible ${label}`} before importing this package.`,
          ),
        );
      } else {
        packageIssues.push(
          issue(
            'DEPENDENCY_OK',
            'info',
            `Requires ${label} ${range}; available ${present.version}.`,
          ),
        );
      }
    }

    /* Component comparison. */
    const keys = new Set<string>();
    for (const component of artifact.components) {
      keys.add(component.key);
      for (const dependency of component.dependsOn) keys.add(dependency);
    }
    const index = await this.reader.readTargetIndex({
      tenantId: currentUser.tenantId,
      importingPackageKey: manifest.packageKey,
      keys: [...keys],
      db,
    });
    const comparison: ComparisonResult = comparePackageToTarget({
      components: artifact.components,
      target: index.target,
      ownedByPackageInTarget: index.ownedByPackageInTarget,
    });

    /* Environment variables this workspace must supply a value for. */
    const variableKeys = artifact.components
      .filter((component) => component.type === 'environmentVariable')
      .map((component) => component.objectKey);
    const values = variableKeys.length
      ? await db.customizationEnvironmentVariableValue.findMany({
          where: {
            tenantId: currentUser.tenantId,
            variable: { variableKey: { in: variableKeys } },
          },
          select: { variable: { select: { variableKey: true } } },
        })
      : [];
    const valued = new Set(values.map((value) => value.variable.variableKey));
    const requiredInputs = artifact.components
      .filter(
        (component) =>
          component.type === 'environmentVariable' &&
          component.definition?.isRequired === true &&
          component.definition.defaultValue == null &&
          !valued.has(component.objectKey),
      )
      .map((component) => ({
        variableKey: component.objectKey,
        displayName: String(
          component.definition?.displayName ?? component.objectKey,
        ),
        type: String(component.definition?.type ?? 'text'),
        description:
          (component.definition?.description as string | null) ?? null,
      }));

    const blocking =
      comparison.blocking ||
      packageIssues.some((entry) => entry.severity === 'error');
    const fingerprint = sha256(
      canonicalJson({
        items: comparison.items.map((item) => [
          item.key,
          item.status,
          item.apply,
        ]),
        removed: comparison.removedFromSource.map((item) => item.key),
        issues: packageIssues.map((entry) => [entry.code, entry.severity]),
      }),
    );

    return {
      mode,
      blocking,
      existingPackageId: existing?.id ?? null,
      installedVersion: existing?.installedVersion ?? null,
      packageIssues,
      comparison,
      requiredInputs,
      fingerprint,
      stored: {
        mode,
        fingerprint,
        manifest: {
          packageKey: manifest.packageKey,
          displayName: manifest.displayName,
          description: manifest.description,
          version: manifest.version,
          publisher: manifest.publisher,
          metadataSchemaVersion: manifest.metadataSchemaVersion,
          sourceEnvironmentType: manifest.sourceEnvironmentType,
          dependencies: manifest.dependencies,
          componentCount: manifest.componentCount,
        },
        integrity: {
          contentChecksum: artifact.contentChecksum,
          verified: true,
          signed: false,
          note: 'Checksums prove the file is intact. They do not prove who published it.',
        },
        packageIssues,
        items: comparison.items,
        removedFromSource: comparison.removedFromSource,
        summary: comparison.summary,
        requiredInputs,
      },
    };
  }

  /**
   * Stage 12-14. Re-verifies the stored artifact and re-plans against the
   * workspace as it is now; if anything moved since the reviewed analysis the
   * import is refused as stale. Then applies every change in ONE transaction:
   * a failure anywhere rolls back everything, so there is no partial import to
   * clean up and no compensation journal to trust.
   */
  async executeImport(
    currentUser: AuthenticatedUser,
    operationId: string,
    dto: ExecutePackageImportDto,
  ) {
    const operation = await this.findOperation(currentUser, operationId);
    if (operation.kind !== 'IMPORT') {
      throw this.validation('This operation is not an import.');
    }
    if (operation.status === 'COMPLETED') {
      throw this.validation('This import has already been applied.');
    }
    const downgradeOnly =
      operation.status === 'BLOCKED' &&
      dto.allowDowngrade === true &&
      onlyDowngradeBlocks(operation.planJson);
    if (operation.status !== 'READY' && !downgradeOnly) {
      throw new AppError('PACKAGE_IMPORT_BLOCKED', {
        message:
          operation.status === 'SUPERSEDED'
            ? 'A newer analysis of this package replaced this one. Apply the newest analysis.'
            : operation.status === 'FAILED'
              ? 'This import failed and was rolled back. Analyze the package again to retry.'
              : 'This import plan has blocking items. Resolve them and analyze the package again.',
        details: { issues: planIssues(operation.planJson) },
      });
    }

    const parsed = parsePackageArtifact(canonicalJson(operation.artifactJson));
    if (
      !parsed.artifact ||
      parsed.artifact.contentChecksum !== operation.artifactChecksum
    ) {
      throw new AppError('PACKAGE_IMPORT_BLOCKED', {
        message:
          'The stored package no longer matches its checksum. Upload it again.',
      });
    }
    const artifact = parsed.artifact;
    const allowDowngrade = dto.allowDowngrade === true;
    const replanned = await this.buildImportPlan(
      currentUser,
      artifact,
      allowDowngrade,
    );
    const storedFingerprint = (
      operation.planJson as { fingerprint?: string } | null
    )?.fingerprint;
    if (replanned.blocking) {
      throw new AppError('PACKAGE_IMPORT_BLOCKED', {
        details: {
          issues: [
            ...replanned.packageIssues,
            ...itemIssues(replanned.comparison),
          ],
        },
      });
    }
    if (!downgradeOnly && replanned.fingerprint !== storedFingerprint) {
      throw new AppError('PACKAGE_IMPORT_STALE');
    }

    const values = dto.environmentValues ?? {};
    const missingInputs = replanned.requiredInputs.filter(
      (input) =>
        typeof values[input.variableKey] !== 'string' ||
        !values[input.variableKey].trim(),
    );
    if (missingInputs.length) {
      throw new AppError('PACKAGE_IMPORT_BLOCKED', {
        message: `Provide a value for ${missingInputs.map((input) => input.displayName).join(', ')} before importing.`,
        details: { requiredInputs: missingInputs },
      });
    }

    const claimed = await this.prisma.customizationPackageOperation.updateMany({
      where: {
        id: operation.id,
        tenantId: currentUser.tenantId,
        status: operation.status,
      },
      data: { status: 'IMPORTING', startedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new AppError('PACKAGE_IMPORT_STALE', {
        message: 'This import is already being applied.',
      });
    }
    this.logger.log(
      JSON.stringify({
        event: 'PACKAGE_IMPORT_APPLYING',
        tenantId: currentUser.tenantId,
        correlationId: operation.correlationId,
        operationId: operation.id,
        mode: replanned.mode,
      }),
    );

    const journal: { key: string; action: string }[] = [];
    let failedComponent: string | null = null;
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const applied = await this.applyImport(
            tx,
            currentUser,
            artifact,
            replanned,
            values,
            journal,
            (key) => {
              failedComponent = key;
            },
          );
          const snapshotVersion =
            await this.customization.recordPublishSnapshot(
              currentUser,
              applied.componentIds,
              tx,
            );
          const completed = await tx.customizationPackageOperation.update({
            where: { id: operation.id },
            data: {
              status: 'COMPLETED',
              packageId: applied.packageId,
              completedAt: new Date(),
              resultJson: {
                mode: replanned.mode,
                journal,
                snapshotVersion,
                removedFromSource: replanned.comparison.removedFromSource,
                downgradeOverride:
                  replanned.mode === 'DOWNGRADE' ? allowDowngrade : undefined,
              } as Prisma.InputJsonValue,
            },
          });
          await this.audit.log(
            {
              tenantId: currentUser.tenantId,
              actorUserId: currentUser.userId,
              action:
                replanned.mode === 'UPGRADE'
                  ? AUDIT_ACTIONS.PACKAGE_UPGRADED
                  : AUDIT_ACTIONS.PACKAGE_IMPORTED,
              entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_PACKAGE,
              entityId: applied.packageId,
              sourceModule: 'customization',
              beforeSnapshot: { version: replanned.installedVersion },
              afterSnapshot: {
                packageKey: artifact.manifest.packageKey,
                version: artifact.manifest.version,
                mode: replanned.mode,
                created: replanned.comparison.summary.NEW,
                updated:
                  replanned.comparison.summary.UPDATE +
                  replanned.comparison.summary.TARGET_MODIFIED,
                downgradeOverride:
                  replanned.mode === 'DOWNGRADE' ? allowDowngrade : undefined,
                correlationId: operation.correlationId,
                operationId: operation.id,
              },
            },
            tx,
          );
          return completed;
        },
        { timeout: IMPORT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
      );
      this.logger.log(
        JSON.stringify({
          event: 'PACKAGE_IMPORT_COMPLETED',
          tenantId: currentUser.tenantId,
          correlationId: operation.correlationId,
          operationId: operation.id,
          applied: journal.length,
        }),
      );
      return this.operationResponse(result);
    } catch (error) {
      const message =
        error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unknown error';
      const failed = await this.prisma.customizationPackageOperation.update({
        where: { id: operation.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorJson: {
            message,
            failedComponent,
            rolledBack: true,
            appliedBeforeFailure: journal.length,
          } as Prisma.InputJsonValue,
        },
      });
      await this.audit.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: AUDIT_ACTIONS.PACKAGE_IMPORT_FAILED,
        entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_PACKAGE_OPERATION,
        entityId: failed.id,
        sourceModule: 'customization',
        afterSnapshot: {
          packageKey: failed.packageKey,
          version: failed.version,
          failedComponent,
          rolledBack: true,
          correlationId: failed.correlationId,
        },
      });
      this.logger.error(
        JSON.stringify({
          event: 'PACKAGE_IMPORT_FAILED',
          tenantId: currentUser.tenantId,
          correlationId: operation.correlationId,
          operationId: operation.id,
          failedComponent,
          message,
        }),
      );
      throw new AppError('PACKAGE_IMPORT_FAILED', {
        message: failedComponent
          ? `The import failed while applying ${describeKey(failedComponent)} and was rolled back. Nothing was changed. ${message}`
          : `The import failed and was rolled back. Nothing was changed. ${message}`,
        details: {
          operationId: failed.id,
          failedComponent,
          correlationId: failed.correlationId,
        },
        cause: error,
      });
    }
  }

  private async applyImport(
    tx: Prisma.TransactionClient,
    currentUser: AuthenticatedUser,
    artifact: PackageArtifact,
    plan: Awaited<ReturnType<PackageAlmService['buildImportPlan']>>,
    values: Record<string, string>,
    journal: { key: string; action: string }[],
    onComponent: (key: string) => void,
  ) {
    const tenantId = currentUser.tenantId;
    const manifest = artifact.manifest;
    const now = new Date();

    const publisher =
      (await tx.customizationPublisher.findFirst({
        where: { tenantId, publisherKey: manifest.publisher.publisherKey },
      })) ??
      (await tx.customizationPublisher.create({
        data: {
          tenantId,
          publisherKey: manifest.publisher.publisherKey,
          displayName: manifest.publisher.displayName,
          prefix: manifest.publisher.prefix,
          createdByUserId: currentUser.userId,
          updatedByUserId: currentUser.userId,
        },
      }));

    const sourceEnvironmentType = (
      Object.values(TenantEnvironmentType) as string[]
    ).includes(manifest.sourceEnvironmentType ?? '')
      ? (manifest.sourceEnvironmentType as TenantEnvironmentType)
      : null;
    const packageData = {
      displayName: manifest.displayName,
      description: manifest.description,
      scope: 'tenant' as const,
      isDefault: false,
      isSystem: false,
      isManaged: true,
      isActive: true,
      origin: 'IMPORTED' as const,
      version: manifest.version,
      installedVersion: manifest.version,
      installedAt: now,
      sourceEnvironmentType,
      publisherId: publisher.id,
      updatedByUserId: currentUser.userId,
    };
    const packageRecord = await tx.customizationSolution.upsert({
      where: {
        tenantId_solutionKey: { tenantId, solutionKey: manifest.packageKey },
      },
      create: {
        tenantId,
        solutionKey: manifest.packageKey,
        ...packageData,
        createdByUserId: currentUser.userId,
      },
      update: packageData,
    });

    await tx.customizationPackageDependency.deleteMany({
      where: { tenantId, packageId: packageRecord.id },
    });
    if (manifest.dependencies.length) {
      await tx.customizationPackageDependency.createMany({
        data: manifest.dependencies.map((dependency) => ({
          tenantId,
          packageId: packageRecord.id,
          dependsOnPackageKey: dependency.packageKey,
          dependsOnPublisherKey: dependency.publisherKey,
          dependsOnDisplayName: dependency.displayName,
          minVersion: dependency.minVersion,
          maxVersion: dependency.maxVersion,
        })),
      });
    }

    /* The installed version is kept here too: Versions tab + TARGET_MODIFIED. */
    await tx.customizationPackageVersion.upsert({
      where: {
        packageId_version: {
          packageId: packageRecord.id,
          version: manifest.version,
        },
      },
      create: {
        tenantId,
        packageId: packageRecord.id,
        version: manifest.version,
        artifactJson: artifact as unknown as Prisma.InputJsonValue,
        checksum: artifact.contentChecksum,
        componentCount: artifact.components.length,
        releasedByUserId: currentUser.userId,
      },
      update: {},
    });

    /* Logical keys resolved to this workspace's ids as the import proceeds. */
    const tables = await tx.customizationTable.findMany({
      where: { tenantId },
      select: { id: true, tableKey: true },
    });
    const tableIdByKey = new Map(
      tables.map((table) => [table.tableKey, table.id]),
    );
    const existingRows = await tx.customizationSolutionComponent.findMany({
      where: { tenantId, solutionId: packageRecord.id },
    });
    const statusByKey = new Map(
      plan.comparison.items.map((item) => [item.key, item]),
    );
    const componentIds: string[] = [];

    for (const component of artifact.components) {
      onComponent(component.key);
      const item = statusByKey.get(component.key);
      if (!item) continue;
      if (item.status === 'SKIPPED') continue;

      const base = await this.applyBaseObject(
        tx,
        currentUser,
        component,
        item.apply,
        tableIdByKey,
        packageRecord.id,
      );
      const existing = existingRows.find(
        (row) =>
          row.componentType === component.type &&
          (row.objectId === base.objectId ||
            row.objectKey === component.objectKey),
      );
      if (
        existing &&
        item.apply === 'none' &&
        existing.checksum === component.checksum &&
        existing.lifecycleState === 'published'
      ) {
        continue;
      }
      const row = await tx.customizationSolutionComponent.upsert({
        where: {
          solutionId_componentType_objectId: {
            solutionId: packageRecord.id,
            componentType: component.type as CustomizationSolutionComponentType,
            objectId: base.objectId,
          },
        },
        create: {
          tenantId,
          solutionId: packageRecord.id,
          componentType: component.type as CustomizationSolutionComponentType,
          objectId: base.objectId,
          objectKey: component.objectKey,
          tableId: base.tableId,
          baseComponentId:
            component.layerAction === 'create' ? null : base.objectId,
          layerAction: component.layerAction,
          lifecycleState: 'published',
          /*
           * Installed layers sit between DijiPeople Core (100) / module
           * references (200) and this workspace's own unmanaged layers (300),
           * so a local customization still wins over an installed package.
           */
          layerOrder: component.layerAction === 'reference' ? 200 : 250,
          version: manifest.version,
          checksum: component.checksum,
          metadataJson: (component.layer ??
            Prisma.JsonNull) as Prisma.InputJsonValue,
          publishedAt: now,
          publishedByUserId: currentUser.userId,
          isSystem: component.baseIsSystem,
          isCustom: !component.baseIsSystem,
          isManaged: true,
          createdByUserId: currentUser.userId,
          updatedByUserId: currentUser.userId,
        },
        update: {
          objectKey: component.objectKey,
          tableId: base.tableId,
          layerAction: component.layerAction,
          lifecycleState: 'published',
          layerOrder: component.layerAction === 'reference' ? 200 : 250,
          version: manifest.version,
          checksum: component.checksum,
          metadataJson: (component.layer ??
            Prisma.JsonNull) as Prisma.InputJsonValue,
          publishedAt: now,
          publishedByUserId: currentUser.userId,
          isManaged: true,
          updatedByUserId: currentUser.userId,
        },
      });
      componentIds.push(row.id);
      journal.push({
        key: component.key,
        action: item.apply === 'none' ? 'ensure' : item.apply,
      });
    }

    for (const [variableKey, value] of Object.entries(values)) {
      const variable = await tx.customizationEnvironmentVariable.findFirst({
        where: { tenantId, variableKey },
      });
      if (!variable || !value.trim()) continue;
      await tx.customizationEnvironmentVariableValue.upsert({
        where: { tenantId_variableId: { tenantId, variableId: variable.id } },
        create: {
          tenantId,
          variableId: variable.id,
          value: this.storeValue(variable.type, value),
          updatedByUserId: currentUser.userId,
        },
        update: {
          value: this.storeValue(variable.type, value),
          updatedByUserId: currentUser.userId,
        },
      });
      journal.push({
        key: `environmentVariable:${variableKey}`,
        action: 'value-set',
      });
    }

    return { packageId: packageRecord.id, componentIds };
  }

  /**
   * Creates or updates the object a component describes, and returns the id
   * the component row must point at. For a layer over something this package
   * does not own, nothing is written here — the layer row carries the change.
   */
  private async applyBaseObject(
    tx: Prisma.TransactionClient,
    currentUser: AuthenticatedUser,
    component: PortableComponent,
    apply: 'create' | 'update' | 'none',
    tableIdByKey: Map<string, string>,
    packageId: string,
  ): Promise<{ objectId: string; tableId: string | null }> {
    const tenantId = currentUser.tenantId;
    const parentTableId = component.parentKey
      ? (tableIdByKey.get(component.parentKey) ?? null)
      : null;
    const writes =
      component.layerAction === 'create' &&
      !component.baseIsSystem &&
      apply !== 'none';
    const definition = component.definition ?? {};
    const user = {
      createdByUserId: currentUser.userId,
      updatedByUserId: currentUser.userId,
    };

    if (component.type === 'table') {
      const tableKey = component.objectKey;
      if (writes) {
        const data = {
          systemName: String(definition.systemName),
          displayName: String(definition.displayName),
          pluralDisplayName: String(definition.pluralDisplayName),
          description: nullableString(definition.description),
          icon: nullableString(definition.icon),
          ownershipType: nullableString(definition.ownershipType),
          moduleKey: nullableString(definition.moduleKey),
          displayOrder: Number(definition.displayOrder ?? 9000),
          isSystem: false,
          isCustom: true,
          isCustomizable: definition.isCustomizable !== false,
          isVisibleInCustomization:
            definition.isVisibleInCustomization !== false,
          isValidForAdvancedFind: definition.isValidForAdvancedFind !== false,
          isValidForFormDesigner: definition.isValidForFormDesigner !== false,
          isValidForViewDesigner: definition.isValidForViewDesigner !== false,
          isActive: definition.isActive !== false,
          updatedByUserId: currentUser.userId,
        };
        const table = await tx.customizationTable.upsert({
          where: { tenantId_tableKey: { tenantId, tableKey } },
          create: {
            tenantId,
            tableKey,
            ...data,
            createdByUserId: currentUser.userId,
          },
          update: data,
        });
        tableIdByKey.set(tableKey, table.id);
        return { objectId: table.id, tableId: table.id };
      }
      const id = tableIdByKey.get(tableKey);
      if (!id) throw new Error(`Module ${tableKey} does not exist.`);
      return { objectId: id, tableId: id };
    }

    if (
      component.type === 'column' ||
      component.type === 'form' ||
      component.type === 'view'
    ) {
      if (!parentTableId)
        throw new Error(`Module ${component.parentKey} does not exist.`);
      const localKey = component.objectKey.slice(
        component.objectKey.indexOf('.') + 1,
      );
      if (component.type === 'column') {
        if (writes) {
          const data = {
            systemName: String(definition.systemName ?? localKey),
            displayName: String(definition.displayName),
            description: nullableString(definition.description),
            dataType:
              definition.dataType as Prisma.CustomizationColumnCreateInput['dataType'],
            fieldType: (definition.fieldType ??
              definition.dataType) as Prisma.CustomizationColumnCreateInput['fieldType'],
            isSystem: false,
            isCustom: true,
            isActive: definition.isActive !== false,
            isRequired: definition.isRequired === true,
            isSearchable: definition.isSearchable === true,
            isFilterable: definition.isFilterable === true,
            isSortable: definition.isSortable === true,
            isVisible: definition.isVisible !== false,
            isVisibleInCustomization:
              definition.isVisibleInCustomization !== false,
            isValidForFormDesigner: definition.isValidForFormDesigner !== false,
            isValidForViewDesigner: definition.isValidForViewDesigner !== false,
            isReadOnly: definition.isReadOnly === true,
            isPrimaryName: definition.isPrimaryName === true,
            maxLength:
              typeof definition.maxLength === 'number'
                ? definition.maxLength
                : null,
            minValue: nullableString(definition.minValue),
            maxValue: nullableString(definition.maxValue),
            defaultValue: nullableString(definition.defaultValue),
            lookupTargetTableKey: nullableString(
              definition.lookupTargetTableKey,
            ),
            optionSetJson: jsonOrNull(definition.optionSetJson),
            validationJson: jsonOrNull(definition.validationJson),
            sortOrder: Number(definition.sortOrder ?? 0),
            updatedByUserId: currentUser.userId,
          };
          const column = await tx.customizationColumn.upsert({
            where: {
              tenantId_tableId_columnKey: {
                tenantId,
                tableId: parentTableId,
                columnKey: localKey,
              },
            },
            create: {
              tenantId,
              tableId: parentTableId,
              columnKey: localKey,
              ...data,
              createdByUserId: currentUser.userId,
            },
            update: data,
          });
          return { objectId: column.id, tableId: parentTableId };
        }
        const column = await tx.customizationColumn.findFirst({
          where: { tenantId, tableId: parentTableId, columnKey: localKey },
          select: { id: true },
        });
        if (!column)
          throw new Error(`Field ${component.objectKey} does not exist.`);
        return { objectId: column.id, tableId: parentTableId };
      }
      if (component.type === 'form') {
        if (writes) {
          const data = {
            name: String(definition.name),
            description: nullableString(definition.description),
            type: definition.type as Prisma.CustomizationFormCreateInput['type'],
            isDefault: definition.isDefault === true,
            isActive: definition.isActive !== false,
            isSystem: false,
            isCustom: true,
            layoutJson: (definition.layoutJson ?? {}) as Prisma.InputJsonValue,
            updatedByUserId: currentUser.userId,
          };
          const form = await tx.customizationForm.upsert({
            where: {
              tenantId_tableId_formKey: {
                tenantId,
                tableId: parentTableId,
                formKey: localKey,
              },
            },
            create: {
              tenantId,
              tableId: parentTableId,
              formKey: localKey,
              ...data,
              createdByUserId: currentUser.userId,
            },
            update: data,
          });
          return { objectId: form.id, tableId: parentTableId };
        }
        const form = await tx.customizationForm.findFirst({
          where: { tenantId, tableId: parentTableId, formKey: localKey },
          select: { id: true },
        });
        if (!form)
          throw new Error(`Form ${component.objectKey} does not exist.`);
        return { objectId: form.id, tableId: parentTableId };
      }
      if (writes) {
        const data = {
          name: String(definition.name),
          description: nullableString(definition.description),
          type: definition.type as Prisma.CustomizationViewCreateInput['type'],
          isDefault: definition.isDefault === true,
          isHidden: definition.isHidden === true,
          isSystem: false,
          isCustom: true,
          columnsJson: (definition.columnsJson ?? []) as Prisma.InputJsonValue,
          filtersJson: jsonOrNull(definition.filtersJson),
          sortingJson: jsonOrNull(definition.sortingJson),
          visibilityScope: (definition.visibilityScope ??
            'tenant') as Prisma.CustomizationViewCreateInput['visibilityScope'],
          updatedByUserId: currentUser.userId,
        };
        const view = await tx.customizationView.upsert({
          where: {
            tenantId_tableId_viewKey: {
              tenantId,
              tableId: parentTableId,
              viewKey: localKey,
            },
          },
          create: {
            tenantId,
            tableId: parentTableId,
            viewKey: localKey,
            ...data,
            createdByUserId: currentUser.userId,
          },
          update: data,
        });
        return { objectId: view.id, tableId: parentTableId };
      }
      const view = await tx.customizationView.findFirst({
        where: { tenantId, tableId: parentTableId, viewKey: localKey },
        select: { id: true },
      });
      if (!view) throw new Error(`View ${component.objectKey} does not exist.`);
      return { objectId: view.id, tableId: parentTableId };
    }

    if (component.type === 'environmentVariable') {
      const variableKey = component.objectKey;
      const data = {
        displayName: String(definition.displayName ?? variableKey),
        description: nullableString(definition.description),
        type: (definition.type ??
          'text') as Prisma.CustomizationEnvironmentVariableCreateInput['type'],
        isRequired: definition.isRequired === true,
        defaultValue:
          definition.type === 'secret'
            ? null
            : nullableString(definition.defaultValue),
        packageId,
        updatedByUserId: currentUser.userId,
      };
      const variable = await tx.customizationEnvironmentVariable.upsert({
        where: { tenantId_variableKey: { tenantId, variableKey } },
        create: { tenantId, variableKey, ...data, ...user },
        update: data,
      });
      return { objectId: variable.id, tableId: null };
    }

    /*
     * JSON-only types. A layer over a Core component points at the Core row's
     * object; a component this package creates gets a stable synthetic id.
     */
    if (component.layerAction !== 'create' || component.baseIsSystem) {
      const core = await tx.customizationSolutionComponent.findFirst({
        where: {
          tenantId,
          componentType: component.type as CustomizationSolutionComponentType,
          objectKey: component.objectKey,
          NOT: { solutionId: packageId },
        },
        orderBy: { layerOrder: 'asc' },
        select: { objectId: true },
      });
      if (core) return { objectId: core.objectId, tableId: parentTableId };
    }
    return {
      objectId: `${component.type}:${component.objectKey}`,
      tableId: parentTableId,
    };
  }

  /* ============================================================ uninstall */

  async uninstall(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.findPackage(currentUser, packageId);
    if (record.isDefault || record.isSystem) {
      throw this.readOnly('DijiPeople Core cannot be uninstalled.');
    }
    if (record.origin !== 'IMPORTED') {
      throw this.validation(
        'Only packages installed from another environment can be uninstalled. Delete an editable package instead.',
      );
    }
    const blockers = await this.uninstallBlockers(currentUser, record);
    if (blockers.length) {
      throw new AppError('PACKAGE_UNINSTALL_BLOCKED', {
        message: `Cannot uninstall ${record.displayName}. ${blockers[0].message}`,
        details: { issues: blockers },
      });
    }

    const correlationId = randomUUID();
    const rows = await this.prisma.customizationSolutionComponent.findMany({
      where: { tenantId: currentUser.tenantId, solutionId: record.id },
    });
    const owned = (type: string) =>
      rows
        .filter(
          (row) =>
            row.componentType === type &&
            row.layerAction === 'create' &&
            !row.isSystem,
        )
        .map((row) => row.objectId);

    const operation = await this.prisma.$transaction(
      async (tx) => {
        await tx.customizationSolutionComponent.deleteMany({
          where: { tenantId: currentUser.tenantId, solutionId: record.id },
        });
        /* Only what this package created, and only once nothing else layers on it. */
        await tx.customizationColumn.deleteMany({
          where: {
            tenantId: currentUser.tenantId,
            id: { in: owned('column') },
            isSystem: false,
          },
        });
        await tx.customizationForm.deleteMany({
          where: {
            tenantId: currentUser.tenantId,
            id: { in: owned('form') },
            isSystem: false,
          },
        });
        await tx.customizationView.deleteMany({
          where: {
            tenantId: currentUser.tenantId,
            id: { in: owned('view') },
            isSystem: false,
          },
        });
        await tx.customizationTable.deleteMany({
          where: {
            tenantId: currentUser.tenantId,
            id: { in: owned('table') },
            isSystem: false,
          },
        });
        await tx.customizationEnvironmentVariable.deleteMany({
          where: {
            tenantId: currentUser.tenantId,
            id: { in: owned('environmentVariable') },
          },
        });
        await tx.customizationSolution.delete({ where: { id: record.id } });
        const snapshotVersion = await this.customization.recordPublishSnapshot(
          currentUser,
          [],
          tx,
        );
        const created = await tx.customizationPackageOperation.create({
          data: {
            tenantId: currentUser.tenantId,
            kind: 'UNINSTALL',
            status: 'COMPLETED',
            packageKey: record.solutionKey,
            packageDisplayName: record.displayName,
            version: record.installedVersion ?? record.version,
            previousVersion: record.installedVersion,
            correlationId,
            actorUserId: currentUser.userId,
            startedAt: new Date(),
            completedAt: new Date(),
            resultJson: {
              removedComponents: rows.length,
              snapshotVersion,
            } as Prisma.InputJsonValue,
          },
        });
        await this.audit.log(
          {
            tenantId: currentUser.tenantId,
            actorUserId: currentUser.userId,
            action: AUDIT_ACTIONS.PACKAGE_UNINSTALLED,
            entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_PACKAGE,
            entityId: record.id,
            sourceModule: 'customization',
            beforeSnapshot: {
              packageKey: record.solutionKey,
              version: record.installedVersion,
              components: rows.length,
            },
            afterSnapshot: { uninstalled: true, correlationId },
          },
          tx,
        );
        return created;
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );
    this.logger.log(
      JSON.stringify({
        event: 'PACKAGE_UNINSTALLED',
        tenantId: currentUser.tenantId,
        correlationId,
        packageKey: record.solutionKey,
      }),
    );
    return this.operationResponse(operation);
  }

  /* Whether Uninstall is available, and every reason it is not. */
  async uninstallCheck(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.findPackage(currentUser, packageId);
    if (packageKind(record) !== 'installed') {
      return { canUninstall: false, blockers: [] as PackageIssue[] };
    }
    const blockers = await this.uninstallBlockers(currentUser, record);
    return { canUninstall: blockers.length === 0, blockers };
  }

  /**
   * Why a package cannot be uninstalled, as a list — each entry names the
   * dependency path so the administrator knows what to remove first.
   */
  async uninstallBlockers(
    currentUser: AuthenticatedUser,
    record: CustomizationSolution,
  ) {
    const blockers: PackageIssue[] = [];
    const tenantId = currentUser.tenantId;

    /* 1. Other packages that declare a dependency on this one, transitively. */
    const edges = await this.prisma.customizationPackageDependency.findMany({
      where: { tenantId },
      include: {
        package: { select: { solutionKey: true, displayName: true } },
      },
    });
    const dependentsOf = (key: string) =>
      edges.filter((edge) => edge.dependsOnPackageKey === key);
    const visit = (key: string, path: string[]) => {
      for (const edge of dependentsOf(key)) {
        if (path.includes(edge.package.displayName)) continue;
        const chain = [...path, edge.package.displayName];
        blockers.push(
          issue(
            'PACKAGE_DEPENDENT',
            'error',
            `${chain.slice().reverse().join(' → depends on → ')}.`,
          ),
        );
        visit(edge.package.solutionKey, chain);
      }
    };
    visit(record.solutionKey, [record.displayName]);

    /* 2. Layers in other packages on components this package created. */
    const rows = await this.prisma.customizationSolutionComponent.findMany({
      where: { tenantId, solutionId: record.id, layerAction: 'create' },
      select: { objectId: true, objectKey: true, componentType: true },
    });
    const ownedIds = rows.map((row) => row.objectId);
    if (ownedIds.length) {
      const layered = await this.prisma.customizationSolutionComponent.findMany(
        {
          where: {
            tenantId,
            objectId: { in: ownedIds },
            NOT: { solutionId: record.id },
          },
          include: { solution: { select: { displayName: true } } },
          take: 50,
        },
      );
      for (const layer of layered) {
        blockers.push(
          issue(
            'COMPONENT_DEPENDENT',
            'error',
            `${layer.solution.displayName} customizes ${layer.componentType} ${layer.objectKey}, which this package provides.`,
          ),
        );
      }

      /* 3. Records stored in modules this package created. */
      const tableIds = rows
        .filter((row) => row.componentType === 'table')
        .map((row) => row.objectId);
      if (tableIds.length) {
        const counts = await this.prisma.customDataRecord.groupBy({
          by: ['tableId'],
          where: { tenantId, tableId: { in: tableIds }, isDeleted: false },
          _count: { _all: true },
        });
        for (const count of counts) {
          const table = rows.find((row) => row.objectId === count.tableId);
          blockers.push(
            issue(
              'HAS_RECORDS',
              'error',
              `Module ${table?.objectKey ?? count.tableId} holds ${count._count._all} record(s). Uninstalling would orphan them; detach the package to keep its modules instead.`,
            ),
          );
        }
      }
    }
    return blockers;
  }

  /**
   * Keeps an installed package's components but makes them this workspace's
   * own, editable ones. The escape hatch when uninstall is refused because
   * the modules hold data.
   */
  async detach(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.findPackage(currentUser, packageId);
    if (record.origin !== 'IMPORTED') {
      throw this.validation('Only an installed package can be detached.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.customizationSolution.update({
        where: { id: record.id },
        data: {
          origin: 'LOCAL',
          isManaged: false,
          updatedByUserId: currentUser.userId,
        },
      });
      await tx.customizationSolutionComponent.updateMany({
        where: { tenantId: currentUser.tenantId, solutionId: record.id },
        data: { isManaged: false },
      });
      await this.audit.log(
        {
          tenantId: currentUser.tenantId,
          actorUserId: currentUser.userId,
          action: AUDIT_ACTIONS.PACKAGE_DETACHED,
          entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_PACKAGE,
          entityId: record.id,
          sourceModule: 'customization',
          beforeSnapshot: {
            origin: 'IMPORTED',
            installedVersion: record.installedVersion,
          },
          afterSnapshot: { origin: 'LOCAL' },
        },
        tx,
      );
    });
    return this.getLifecycle(currentUser, record.id);
  }

  /* ========================================================== operations */

  async listOperations(
    currentUser: AuthenticatedUser,
    query: { packageKey?: string; take?: number },
  ) {
    return this.prisma.customizationPackageOperation.findMany({
      where: {
        tenantId: currentUser.tenantId,
        ...(query.packageKey ? { packageKey: query.packageKey } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(query.take ?? 50, 1), 200),
      select: operationSummarySelect,
    });
  }

  async getOperation(currentUser: AuthenticatedUser, operationId: string) {
    return this.operationResponse(
      await this.findOperation(currentUser, operationId),
    );
  }

  /* ======================================================== dependencies */

  /**
   * "Show Dependencies" for one component: what it needs, and what uses it,
   * across every package in the workspace.
   */
  async componentDependencies(
    currentUser: AuthenticatedUser,
    componentId: string,
  ) {
    const row = await this.prisma.customizationSolutionComponent.findFirst({
      where: { id: componentId, tenantId: currentUser.tenantId },
      include: {
        solution: { select: { displayName: true, solutionKey: true } },
      },
    });
    if (!row) {
      throw new AppError('VALIDATION_FAILED', {
        message: 'Component was not found.',
        statusCode: 404,
      });
    }
    const [self] = (await this.reader.toPortable(currentUser.tenantId, [row]))
      .components;
    if (!self) {
      return {
        componentKey: `${row.componentType}:${row.objectKey}`,
        dependsOn: [],
        usedBy: [],
      };
    }

    const others = await this.prisma.customizationSolutionComponent.findMany({
      where: {
        tenantId: currentUser.tenantId,
        lifecycleState: { not: 'retired' },
        NOT: { id: row.id },
        solution: { isDefault: false },
        tableId: row.tableId ?? undefined,
      },
      include: {
        solution: { select: { displayName: true, solutionKey: true } },
      },
      take: 2000,
    });
    const portableOthers = await this.reader.toPortable(
      currentUser.tenantId,
      others,
    );
    const usedBy = portableOthers.components
      .filter((component) => component.dependsOn.includes(self.key))
      .map((component) => {
        const source = portableOthers.rowByKey.get(component.key);
        const owner = others.find((other) => other.id === source?.id);
        return {
          componentKey: component.key,
          label: `${describeKey(component.key)}`,
          displayName:
            portableOthers.displayNames.get(component.key) ??
            component.objectKey,
          packageName: owner?.solution.displayName ?? null,
        };
      });

    const index = await this.reader.readTargetIndex({
      tenantId: currentUser.tenantId,
      importingPackageKey: row.solution.solutionKey,
      keys: self.dependsOn,
    });
    const dependsOn = self.dependsOn.map((key) => {
      const entry = index.target.get(key);
      return {
        componentKey: key,
        label: describeKey(key),
        owner:
          entry?.ownerKind === 'core'
            ? 'DijiPeople Core'
            : (entry?.ownerPackageName ?? (entry ? 'No package' : 'Missing')),
        missing: !entry,
      };
    });
    return {
      componentKey: self.key,
      label: describeKey(self.key),
      packageName: row.solution.displayName,
      dependsOn,
      usedBy,
    };
  }

  /* ================================================ environment variables */

  async listEnvironmentVariables(currentUser: AuthenticatedUser) {
    const variables =
      await this.prisma.customizationEnvironmentVariable.findMany({
        where: { tenantId: currentUser.tenantId },
        include: {
          package: { select: { id: true, displayName: true, origin: true } },
          values: {
            where: { tenantId: currentUser.tenantId },
            select: { value: true, updatedAt: true },
          },
        },
        orderBy: { variableKey: 'asc' },
      });
    return variables.map((variable) => {
      const value = variable.values[0];
      return {
        id: variable.id,
        variableKey: variable.variableKey,
        displayName: variable.displayName,
        description: variable.description,
        type: variable.type,
        isRequired: variable.isRequired,
        defaultValue: variable.type === 'secret' ? null : variable.defaultValue,
        package: variable.package,
        hasValue: Boolean(value),
        /* A secret is never returned, not even to an administrator. */
        value: value ? (variable.type === 'secret' ? null : value.value) : null,
        valueUpdatedAt: value?.updatedAt ?? null,
        effectiveSource: value
          ? 'environment'
          : variable.defaultValue
            ? 'default'
            : 'unset',
      };
    });
  }

  async createEnvironmentVariable(
    currentUser: AuthenticatedUser,
    dto: CreateEnvironmentVariableDto,
  ) {
    const record = await this.findPackage(currentUser, dto.packageId);
    this.assertEditable(record);
    const publisher = await this.ensurePackagePublisher(currentUser, record);
    if (publisher && !dto.variableKey.startsWith(`${publisher.prefix}_`)) {
      throw this.validation(
        `Environment variable keys in this package must start with ${publisher.prefix}_.`,
      );
    }
    if (dto.type === 'secret' && dto.defaultValue) {
      throw this.validation(
        'A secret cannot have a default value: it would be exported with the package.',
      );
    }
    const clash = await this.prisma.customizationEnvironmentVariable.findFirst({
      where: { tenantId: currentUser.tenantId, variableKey: dto.variableKey },
    });
    if (clash) {
      throw new AppError('VALIDATION_FAILED', {
        message: `${dto.variableKey} already exists.`,
        statusCode: 409,
      });
    }
    const variable = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customizationEnvironmentVariable.create({
        data: {
          tenantId: currentUser.tenantId,
          packageId: record.id,
          variableKey: dto.variableKey,
          displayName: dto.displayName.trim(),
          description: dto.description?.trim() || null,
          type: dto.type,
          isRequired: dto.isRequired ?? false,
          defaultValue:
            dto.type === 'secret' ? null : (dto.defaultValue ?? null),
          createdByUserId: currentUser.userId,
          updatedByUserId: currentUser.userId,
        },
      });
      await tx.customizationSolutionComponent.create({
        data: {
          tenantId: currentUser.tenantId,
          solutionId: record.id,
          componentType: 'environmentVariable',
          objectId: created.id,
          objectKey: created.variableKey,
          layerAction: 'create',
          lifecycleState: 'draft',
          layerOrder: 300,
          isSystem: false,
          isCustom: true,
          isManaged: false,
          createdByUserId: currentUser.userId,
          updatedByUserId: currentUser.userId,
        },
      });
      await this.audit.log(
        {
          tenantId: currentUser.tenantId,
          actorUserId: currentUser.userId,
          action: AUDIT_ACTIONS.PACKAGE_ENVIRONMENT_VARIABLE_CREATED,
          entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_ENVIRONMENT_VARIABLE,
          entityId: created.id,
          sourceModule: 'customization',
          afterSnapshot: {
            variableKey: created.variableKey,
            type: created.type,
            packageKey: record.solutionKey,
          },
        },
        tx,
      );
      return created;
    });
    return variable;
  }

  async setEnvironmentVariableValue(
    currentUser: AuthenticatedUser,
    variableId: string,
    value: string,
  ) {
    const variable =
      await this.prisma.customizationEnvironmentVariable.findFirst({
        where: { id: variableId, tenantId: currentUser.tenantId },
      });
    if (!variable) {
      throw new AppError('VALIDATION_FAILED', {
        message: 'Environment variable was not found.',
        statusCode: 404,
      });
    }
    const trimmed = value.trim();
    if (!trimmed) throw this.validation('A value is required.');
    if (variable.type === 'number' && !Number.isFinite(Number(trimmed))) {
      throw this.validation(`${variable.displayName} must be a number.`);
    }
    if (variable.type === 'boolean' && !['true', 'false'].includes(trimmed)) {
      throw this.validation(`${variable.displayName} must be true or false.`);
    }
    if (variable.type === 'url' && !/^https?:\/\/[^\s]+$/i.test(trimmed)) {
      throw this.validation(
        `${variable.displayName} must be an http or https URL.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.customizationEnvironmentVariableValue.upsert({
        where: {
          tenantId_variableId: {
            tenantId: currentUser.tenantId,
            variableId: variable.id,
          },
        },
        create: {
          tenantId: currentUser.tenantId,
          variableId: variable.id,
          value: this.storeValue(variable.type, trimmed),
          updatedByUserId: currentUser.userId,
        },
        update: {
          value: this.storeValue(variable.type, trimmed),
          updatedByUserId: currentUser.userId,
        },
      });
      await this.audit.log(
        {
          tenantId: currentUser.tenantId,
          actorUserId: currentUser.userId,
          action: AUDIT_ACTIONS.PACKAGE_ENVIRONMENT_VALUE_SET,
          entityType: AUDIT_ENTITY_TYPES.CUSTOMIZATION_ENVIRONMENT_VARIABLE,
          entityId: variable.id,
          sourceModule: 'customization',
          /* The key only — never the value, secret or not. */
          afterSnapshot: { variableKey: variable.variableKey, valueSet: true },
        },
        tx,
      );
    });
    return { variableKey: variable.variableKey, hasValue: true };
  }

  /**
   * The value a running feature should use here: this environment's value,
   * else the definition's default. Decrypts secrets for server-side callers
   * only; nothing returns this over HTTP.
   */
  async resolveEnvironmentValue(tenantId: string, variableKey: string) {
    const variable =
      await this.prisma.customizationEnvironmentVariable.findFirst({
        where: { tenantId, variableKey },
        include: { values: { where: { tenantId } } },
      });
    if (!variable) return null;
    const stored = variable.values[0]?.value;
    if (stored !== undefined) {
      return variable.type === 'secret'
        ? this.encryption.decrypt(stored)
        : stored;
    }
    return variable.defaultValue ?? null;
  }

  private storeValue(type: string, value: string) {
    return type === 'secret' ? this.encryption.encrypt(value) : value;
  }

  /* ============================================================= helpers */

  private async findPackage(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.prisma.customizationSolution.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        OR: [{ id: packageId }, { solutionKey: packageId }],
      },
    });
    if (!record) {
      throw new AppError('VALIDATION_FAILED', {
        message: 'Customization package was not found.',
        statusCode: 404,
      });
    }
    return record;
  }

  private async findOperation(
    currentUser: AuthenticatedUser,
    operationId: string,
  ) {
    const operation = await this.prisma.customizationPackageOperation.findFirst(
      {
        where: { id: operationId, tenantId: currentUser.tenantId },
      },
    );
    if (!operation) {
      throw new AppError('VALIDATION_FAILED', {
        message: 'Package operation was not found.',
        statusCode: 404,
      });
    }
    return operation;
  }

  private async latestVersion(
    currentUser: AuthenticatedUser,
    packageId: string,
    withArtifact = false,
  ) {
    const versions = await this.prisma.customizationPackageVersion.findMany({
      where: { tenantId: currentUser.tenantId, packageId },
      select: {
        id: true,
        version: true,
        checksum: true,
        artifactJson: withArtifact,
      },
    });
    return (
      versions.sort((left, right) =>
        compareSemver(right.version, left.version),
      )[0] ?? null
    );
  }

  /* The version of each named package present here, installed or authored. */
  private async installedPackageVersions(
    currentUser: AuthenticatedUser,
    packageKeys: readonly string[],
    db: Db = this.prisma,
  ) {
    if (!packageKeys.length)
      return new Map<string, { version: string; displayName: string }>();
    const packages = await db.customizationSolution.findMany({
      where: {
        tenantId: currentUser.tenantId,
        solutionKey: { in: [...packageKeys] },
      },
      select: {
        id: true,
        solutionKey: true,
        displayName: true,
        origin: true,
        installedVersion: true,
      },
    });
    const result = new Map<string, { version: string; displayName: string }>();
    for (const record of packages) {
      if (record.origin === 'IMPORTED' && record.installedVersion) {
        result.set(record.solutionKey, {
          version: record.installedVersion,
          displayName: record.displayName,
        });
        continue;
      }
      /* An authored package counts at its latest released version. */
      const versions = await db.customizationPackageVersion.findMany({
        where: { tenantId: currentUser.tenantId, packageId: record.id },
        select: { version: true },
      });
      const latest = versions
        .map((entry) => entry.version)
        .sort((a, b) => compareSemver(b, a))[0];
      if (latest)
        result.set(record.solutionKey, {
          version: latest,
          displayName: record.displayName,
        });
    }
    return result;
  }

  packageActions(record: CustomizationSolution) {
    const kind = packageKind(record);
    return {
      kind,
      canEdit:
        kind === 'editable' &&
        record.solutionKey !== LEGACY_UNASSIGNED_PACKAGE_KEY,
      canRelease:
        kind === 'editable' &&
        record.solutionKey !== LEGACY_UNASSIGNED_PACKAGE_KEY,
      canExport: kind !== 'system',
      canUninstall: kind === 'installed',
      canDetach: kind === 'installed',
    };
  }

  private assertEditable(record: CustomizationSolution) {
    if (record.isDefault || record.isSystem) {
      throw this.readOnly('DijiPeople Core is read-only.');
    }
    if (record.isManaged || record.origin === 'IMPORTED') {
      throw this.readOnly(
        `${record.displayName} was installed from another environment and is read-only here.`,
      );
    }
  }

  private assertPrefixAllowed(prefix: string) {
    if (!PUBLISHER_PREFIX_PATTERN.test(prefix)) {
      throw this.validation(
        'Prefix must be 2-8 lowercase letters or digits and start with a letter.',
      );
    }
    if (RESERVED_PUBLISHER_PREFIXES.includes(prefix)) {
      throw this.validation(`Prefix ${prefix} is reserved for DijiPeople.`);
    }
  }

  private operationResponse(operation: CustomizationPackageOperation) {
    return {
      id: operation.id,
      kind: operation.kind,
      status: operation.status,
      packageId: operation.packageId,
      packageKey: operation.packageKey,
      packageDisplayName: operation.packageDisplayName,
      publisherKey: operation.publisherKey,
      version: operation.version,
      previousVersion: operation.previousVersion,
      artifactChecksum: operation.artifactChecksum,
      correlationId: operation.correlationId,
      counts: {
        created: operation.createdCount,
        updated: operation.updatedCount,
        unchanged: operation.unchangedCount,
        skipped: operation.skippedCount,
        conflicts: operation.conflictCount,
        warnings: operation.warningCount,
      },
      plan: operation.planJson,
      result: operation.resultJson,
      error: operation.errorJson,
      actorUserId: operation.actorUserId,
      createdAt: operation.createdAt,
      startedAt: operation.startedAt,
      completedAt: operation.completedAt,
    };
  }

  private validation(message: string) {
    return new AppError('VALIDATION_FAILED', { message });
  }

  private readOnly(message: string) {
    return new AppError('PACKAGE_READ_ONLY', { message });
  }
}

/* ------------------------------------------------------------ free helpers */

const operationSummarySelect = {
  id: true,
  kind: true,
  status: true,
  packageId: true,
  packageKey: true,
  packageDisplayName: true,
  version: true,
  previousVersion: true,
  correlationId: true,
  createdCount: true,
  updatedCount: true,
  unchangedCount: true,
  skippedCount: true,
  conflictCount: true,
  warningCount: true,
  actorUserId: true,
  createdAt: true,
  completedAt: true,
} satisfies Prisma.CustomizationPackageOperationSelect;

function issue(
  code: string,
  severity: PackageIssue['severity'],
  message: string,
): PackageIssue {
  return { code, severity, message, componentKey: null, remedy: null };
}

export function summarizeIssues(
  issues: PackageIssue[],
  componentCount: number,
) {
  const order = { error: 0, warning: 1, info: 2 };
  const sorted = [...issues].sort(
    (left, right) => order[left.severity] - order[right.severity],
  );
  const errors = sorted.filter((entry) => entry.severity === 'error').length;
  const warnings = sorted.filter(
    (entry) => entry.severity === 'warning',
  ).length;
  const infos = sorted.filter((entry) => entry.severity === 'info').length;
  return {
    valid: errors === 0,
    health: errors ? 'errors' : warnings ? 'warnings' : 'healthy',
    componentCount,
    errors,
    warnings,
    infos,
    issues: sorted,
  };
}

function dependencySnapshot(dependency: {
  dependsOnPackageKey: string;
  minVersion: string;
  maxVersion: string | null;
}) {
  return {
    packageKey: dependency.dependsOnPackageKey,
    minVersion: dependency.minVersion,
    maxVersion: dependency.maxVersion,
  };
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function jsonOrNull(value: unknown) {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

function planIssues(plan: Prisma.JsonValue | null) {
  const stored = plan as {
    packageIssues?: PackageIssue[];
    items?: { blocking?: boolean; messages?: string[]; key?: string }[];
  } | null;
  return [
    ...(stored?.packageIssues ?? []).filter(
      (entry) => entry.severity === 'error',
    ),
    ...(stored?.items ?? [])
      .filter((item) => item.blocking)
      .flatMap((item) =>
        (item.messages ?? []).map((message) => ({
          code: 'COMPONENT',
          severity: 'error',
          message,
          componentKey: item.key,
        })),
      ),
  ];
}

function itemIssues(comparison: ComparisonResult) {
  return comparison.items
    .filter((item) => item.blocking)
    .flatMap((item) =>
      item.messages.map((message) => ({
        code: item.status,
        severity: 'error' as const,
        message,
        componentKey: item.key,
      })),
    );
}

/* True when the only thing blocking a stored plan is a downgrade. */
function onlyDowngradeBlocks(plan: Prisma.JsonValue | null) {
  const stored = plan as {
    packageIssues?: PackageIssue[];
    items?: { blocking?: boolean }[];
  } | null;
  const errors = (stored?.packageIssues ?? []).filter(
    (entry) => entry.severity === 'error',
  );
  return (
    errors.length > 0 &&
    errors.every((entry) => entry.code === 'DOWNGRADE') &&
    !(stored?.items ?? []).some((item) => item.blocking)
  );
}

export { parseKey };
