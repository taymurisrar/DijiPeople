import { Injectable } from '@nestjs/common';
import {
  Prisma,
  WorkItemStatus,
  WorkProfileVersionStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantEntitlementService } from '../../common/security/tenant-entitlement.service';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { PortableComponent } from '../customization/package-artifact';
import { WorkQueuesService } from '../work-items/work-queues.service';
import type { WorkProfileDefinition } from './work-profile-definition';
import {
  planWorkProfileImport,
  profileDefinition,
  referencedUnitKeys,
  unitDefinition,
  type ImportItem,
  type PlanOptions,
  type PortableQueueSource,
  type WorkProfileImportPlan,
} from './work-profile-portable';
import { WorkProfilesService } from './work-profiles.service';

type Db = PrismaService | Prisma.TransactionClient;
type WorkComponentType = 'workUnit' | 'workProfile' | 'workQueue';

export const WORK_COMPONENT_PERMISSION: Record<WorkComponentType, string> = {
  workUnit: 'work-profiles.manage',
  workProfile: 'work-profiles.manage',
  workQueue: 'work-queues.manage',
};

const TERMINAL_WORK_ITEM: WorkItemStatus[] = [
  WorkItemStatus.DONE,
  WorkItemStatus.CANCELLED,
];

/*
 * DP-MASTER/WP-21.S1 (ADR-0030). The one place work units, profiles and queues
 * are read for, and written by, a package import.
 *
 * Two callers share it: the package engine (customization/package-alm.service)
 * and the work-profiles import endpoint. Neither re-implements validation,
 * immutability, SLA rules or audit - every write goes through
 * WorkProfilesService / WorkQueuesService, handed the caller's transaction so a
 * whole import is one unit of work. Every read and write carries the caller's
 * tenantId; a package never names a tenant.
 */
@Injectable()
export class WorkComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: WorkProfilesService,
    private readonly queues: WorkQueuesService,
    private readonly entitlements: TenantEntitlementService,
  ) {}

  /**
   * Packaging work components for ALM (adding them to a package, analysing or
   * applying an import) is the Enterprise-only `work-intelligence` capability.
   * Enforced here, in the service, because the controllers that reach it are
   * shared with `work-management`, which Growth also buys. Non-work components
   * never come through this service, so they are unaffected.
   */
  assertPackagingEntitled(tenantId: string, route: string) {
    return this.entitlements.assertEntitled(
      tenantId,
      [TENANT_FEATURE_KEYS.WORK_INTELLIGENCE],
      route,
    );
  }

  /** Permission keys the importing user lacks for the given component types. */
  missingPermissions(
    user: AuthenticatedUser,
    types: Iterable<string>,
  ): string[] {
    const held = new Set(user.permissionKeys ?? []);
    const required = new Set<string>();
    for (const type of types) {
      const key = WORK_COMPONENT_PERMISSION[type as WorkComponentType];
      if (key && !held.has(key)) required.add(key);
    }
    return [...required].sort();
  }

  /**
   * What importing these components into the tenant would do. Reads only.
   * `components` should be just the ones to apply; units and profiles they
   * need but do not ship are looked up in the tenant.
   */
  async plan(
    db: Db,
    tenantId: string,
    components: readonly PortableComponent[],
    options: Partial<PlanOptions>,
  ): Promise<WorkProfileImportPlan> {
    if (components.length) {
      await this.assertPackagingEntitled(tenantId, 'work-components/plan');
    }
    const keysOf = (type: string) =>
      components
        .filter((component) => component.type === type)
        .map((component) => component.objectKey);
    const [units, profiles, queues] = await Promise.all([
      db.workUnit.findMany({
        where: { tenantId },
        select: { key: true, name: true, kind: true, isActive: true },
      }),
      db.workProfile.findMany({
        where: { tenantId, key: { in: keysOf('workProfile') } },
        select: {
          key: true,
          name: true,
          description: true,
          isActive: true,
          versions: {
            orderBy: { version: 'desc' },
            select: { status: true, definition: true },
          },
        },
      }),
      db.workQueue.findMany({
        where: { tenantId, key: { in: keysOf('workQueue') } },
        select: {
          key: true,
          name: true,
          description: true,
          responseSlaMinutes: true,
          resolutionSlaMinutes: true,
          isActive: true,
        },
      }),
    ]);
    return planWorkProfileImport({
      components,
      existingUnits: units,
      existingProfiles: profiles.map((profile) => ({
        key: profile.key,
        name: profile.name,
        description: profile.description,
        isActive: profile.isActive,
        hasDraft: profile.versions.some(
          (version) => version.status === WorkProfileVersionStatus.DRAFT,
        ),
        latestPublishedDefinition:
          profile.versions.find(
            (version) => version.status === WorkProfileVersionStatus.PUBLISHED,
          )?.definition ?? null,
      })),
      existingQueues: queues,
      options,
    });
  }

  /**
   * Applies a plan inside the caller's transaction: units, then profiles (which
   * need them), then queues. The plan must have no problems.
   */
  async apply(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    plan: WorkProfileImportPlan,
  ): Promise<void> {
    const tenantId = user.tenantId;
    const item = new Map<string, ImportItem>(
      plan.items.map((entry) => [entry.key, entry]),
    );

    for (const component of plan.units) {
      const step = item.get(component.key);
      if (!step || step.action === 'unchanged') continue;
      const definition = component.definition as unknown as ReturnType<
        typeof unitDefinition
      >;
      if (step.action === 'create') {
        await this.profiles.createUnit(
          user,
          { key: definition.key, name: definition.name, kind: definition.kind },
          tx,
        );
      } else {
        const existing = await tx.workUnit.findFirstOrThrow({
          where: { tenantId, key: definition.key },
          select: { id: true },
        });
        await this.profiles.updateUnit(
          user,
          existing.id,
          { name: definition.name, isActive: true },
          tx,
        );
      }
    }

    for (const component of plan.profiles) {
      const step = item.get(component.key);
      if (!step || step.action === 'unchanged') continue;
      const definition = component.definition as unknown as ReturnType<
        typeof profileDefinition
      >;
      if (step.action === 'create') {
        const created = await this.profiles.create(
          user,
          {
            key: definition.key,
            name: definition.name,
            description: definition.description ?? undefined,
            definition: definition.definition as unknown as Record<
              string,
              unknown
            >,
          },
          tx,
        );
        await this.profiles.publish(
          user,
          created.id,
          created.versions[0].id,
          {},
          tx,
        );
        continue;
      }
      const existing = await tx.workProfile.findFirstOrThrow({
        where: { tenantId, key: definition.key },
        select: { id: true },
      });
      if (step.metadata) {
        await this.profiles.update(
          user,
          existing.id,
          {
            name: definition.name,
            description: definition.description ?? '',
            isActive: true,
          },
          tx,
        );
      }
      if (step.action === 'new-version') {
        const drafted = await this.profiles.createDraft(user, existing.id, tx);
        const draft = drafted.versions.find(
          (version) => version.status === WorkProfileVersionStatus.DRAFT,
        );
        if (!draft) throw new Error('The draft was not created.');
        await this.profiles.updateDraft(
          user,
          existing.id,
          draft.id,
          {
            definition: definition.definition as unknown as Record<
              string,
              unknown
            >,
          },
          tx,
        );
        await this.profiles.publish(user, existing.id, draft.id, {}, tx);
      }
    }

    for (const component of plan.queues) {
      const step = item.get(component.key);
      if (!step || step.action === 'unchanged') continue;
      const definition = component.definition as unknown as PortableQueueSource;
      if (step.action === 'create') {
        const created = await this.queues.create(
          user,
          {
            key: definition.key,
            name: definition.name,
            description: definition.description ?? undefined,
            responseSlaMinutes: definition.responseSlaMinutes ?? undefined,
            resolutionSlaMinutes: definition.resolutionSlaMinutes ?? undefined,
          },
          tx,
        );
        if (!definition.isActive) {
          await this.queues.update(user, created.id, { isActive: false }, tx);
        }
      } else {
        const existing = await tx.workQueue.findFirstOrThrow({
          where: { tenantId, key: definition.key },
          select: { id: true },
        });
        await this.queues.update(
          user,
          existing.id,
          {
            name: definition.name,
            description: definition.description,
            responseSlaMinutes: definition.responseSlaMinutes,
            resolutionSlaMinutes: definition.resolutionSlaMinutes,
            isActive: definition.isActive,
          },
          tx,
        );
      }
    }
  }

  /** The tenant's row ids for portable work keys (`workUnit:<key>` -> id). */
  async idsByKey(
    db: Db,
    tenantId: string,
    components: readonly { type: string; objectKey: string }[],
  ): Promise<Map<string, string>> {
    const keysOf = (type: string) =>
      components
        .filter((component) => component.type === type)
        .map((component) => component.objectKey);
    const [units, profiles, queues] = await Promise.all([
      db.workUnit.findMany({
        where: { tenantId, key: { in: keysOf('workUnit') } },
        select: { id: true, key: true },
      }),
      db.workProfile.findMany({
        where: { tenantId, key: { in: keysOf('workProfile') } },
        select: { id: true, key: true },
      }),
      db.workQueue.findMany({
        where: { tenantId, key: { in: keysOf('workQueue') } },
        select: { id: true, key: true },
      }),
    ]);
    return new Map([
      ...units.map((row) => [`workUnit:${row.key}`, row.id] as const),
      ...profiles.map((row) => [`workProfile:${row.key}`, row.id] as const),
      ...queues.map((row) => [`workQueue:${row.key}`, row.id] as const),
    ]);
  }

  /**
   * Why work components cannot be removed with their package: something live
   * still points at them. Closed history never blocks - it keeps resolving,
   * because uninstall never deletes a work component (see `retire`).
   */
  async useBlockers(
    db: Db,
    tenantId: string,
    rows: readonly {
      componentType: string;
      objectId: string;
      objectKey: string;
    }[],
  ): Promise<{ code: string; message: string }[]> {
    const blockers: { code: string; message: string }[] = [];
    const now = new Date();
    const profileRows = rows.filter(
      (row) => row.componentType === 'workProfile',
    );
    const unitRows = rows.filter((row) => row.componentType === 'workUnit');
    const queueRows = rows.filter((row) => row.componentType === 'workQueue');

    for (const row of profileRows) {
      const [assignments, items] = await Promise.all([
        db.employeeWorkProfileAssignment.count({
          where: {
            tenantId,
            profileId: row.objectId,
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
        }),
        db.workItem.count({
          where: {
            tenantId,
            status: { notIn: TERMINAL_WORK_ITEM },
            workProfileVersionId: {
              in: (
                await db.workProfileVersion.findMany({
                  where: { tenantId, profileId: row.objectId },
                  select: { id: true },
                })
              ).map((version) => version.id),
            },
          },
        }),
      ]);
      if (assignments) {
        blockers.push({
          code: 'WORK_PROFILE_ASSIGNED',
          message: `Work profile ${row.objectKey} is assigned to ${assignments} employee(s). End the assignments first.`,
        });
      }
      if (items) {
        blockers.push({
          code: 'WORK_PROFILE_IN_USE',
          message: `Work profile ${row.objectKey} governs ${items} open work item(s). Finish or cancel them first.`,
        });
      }
    }

    for (const row of queueRows) {
      const open = await db.workItem.count({
        where: {
          tenantId,
          queueId: row.objectId,
          status: { notIn: TERMINAL_WORK_ITEM },
        },
      });
      if (open) {
        blockers.push({
          code: 'WORK_QUEUE_IN_USE',
          message: `Work queue ${row.objectKey} still holds ${open} open item(s). Finish or move them first.`,
        });
      }
    }

    if (unitRows.length) {
      const inPackage = new Set(profileRows.map((row) => row.objectKey));
      const versions = await db.workProfileVersion.findMany({
        where: { tenantId, profile: { key: { notIn: [...inPackage] } } },
        select: { definition: true, profile: { select: { key: true } } },
        take: 500,
      });
      for (const row of unitRows) {
        const users = new Set<string>();
        for (const version of versions) {
          const definition =
            version.definition as unknown as WorkProfileDefinition;
          if (
            Array.isArray(definition?.workTypes) &&
            referencedUnitKeys(definition).includes(row.objectKey)
          ) {
            users.add(version.profile.key);
          }
        }
        if (users.size) {
          blockers.push({
            code: 'WORK_UNIT_IN_USE',
            message: `Work unit ${row.objectKey} is measured in by profile ${[...users].sort().join(', ')}, which this package does not provide.`,
          });
        }
      }
    }
    return blockers;
  }

  /**
   * What uninstall does to a work component: it is deactivated, never deleted.
   * Assignments, work items, contributions and published profile versions all
   * point at these rows, and history must keep resolving (and a queue delete
   * would silently null every item's queue).
   */
  async retire(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    rows: readonly { componentType: string; objectId: string }[],
  ): Promise<string[]> {
    const retained: string[] = [];
    for (const row of rows) {
      if (row.componentType === 'workUnit') {
        const unit = await tx.workUnit.findFirst({
          where: { id: row.objectId, tenantId: user.tenantId, isActive: true },
          select: { key: true },
        });
        if (!unit) continue;
        await this.profiles.updateUnit(
          user,
          row.objectId,
          { isActive: false },
          tx,
        );
        retained.push(`workUnit:${unit.key}`);
      } else if (row.componentType === 'workProfile') {
        const profile = await tx.workProfile.findFirst({
          where: { id: row.objectId, tenantId: user.tenantId, isActive: true },
          select: { key: true },
        });
        if (!profile) continue;
        await this.profiles.update(user, row.objectId, { isActive: false }, tx);
        retained.push(`workProfile:${profile.key}`);
      } else if (row.componentType === 'workQueue') {
        const queue = await tx.workQueue.findFirst({
          where: { id: row.objectId, tenantId: user.tenantId, isActive: true },
          select: { key: true },
        });
        if (!queue) continue;
        await this.queues.update(user, row.objectId, { isActive: false }, tx);
        retained.push(`workQueue:${queue.key}`);
      }
    }
    return retained;
  }
}
