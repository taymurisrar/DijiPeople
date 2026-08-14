import { BadRequestException, Injectable } from '@nestjs/common';
import { SubscriptionStatus, TenantFeatureSource } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import { TENANT_FEATURE_DEFINITIONS } from '../tenant-settings/tenant-settings.catalog';
import { FeatureAccessService } from '../tenant-settings/feature-access.service';
import {
  assertTenantPlatformAccess,
  loadTenantOrThrow,
  resolvePlatformActor,
} from './tenant-control-plane.guard';
import type { UpdateTenantModulesDto } from './dto/tenant-control-plane.dto';

/**
 * Effective module state for a tenant.
 *
 * The rule already exists in FeatureAccessService and is not re-implemented
 * here:
 *
 *   plan entitlement AND tenant override = effective state
 *
 * with a missing override meaning "follow the plan". The consequence worth
 * being explicit about is that an override cannot grant what the plan does not
 * sell — enabling a module the plan excludes leaves it disabled, and this
 * service reports that as a constraint rather than silently accepting the write.
 */
export type TenantModuleState =
  | 'ENABLED_BY_PLAN'
  | 'DISABLED_BY_PLAN'
  | 'ENABLED_BY_OVERRIDE'
  | 'DISABLED_BY_OVERRIDE'
  | 'BLOCKED_BY_PLAN';

@Injectable()
export class TenantModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureAccess: FeatureAccessService,
    private readonly auditService: AuditService,
    private readonly events: PlatformEventsService,
  ) {}

  async list(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    return this.buildModuleView(tenant.id);
  }

  async update(
    user: AuthenticatedUser,
    tenantId: string,
    dto: UpdateTenantModulesDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const known = new Set<string>(
      TENANT_FEATURE_DEFINITIONS.map((item) => item.key),
    );
    const unknown = dto.overrides.find((item) => !known.has(item.key));
    if (unknown) {
      throw new BadRequestException(`Unknown module: ${unknown.key}.`);
    }

    const before = await this.buildModuleView(tenant.id);
    const planStateByKey = new Map<string, boolean>(
      before.modules.map((item) => [item.key, item.isIncludedInPlan]),
    );

    const rejected = dto.overrides.filter(
      (item) => item.isEnabled === true && !planStateByKey.get(item.key),
    );
    if (rejected.length) {
      throw new BadRequestException(
        `The current plan does not include ${rejected
          .map((item) => item.key)
          .join(', ')}. Change the subscription plan to enable it.`,
      );
    }

    /*
     * One transaction so a partial write cannot leave the tenant with half a
     * module decision applied.
     */
    await this.prisma.$transaction(async (tx) => {
      for (const override of dto.overrides) {
        if (override.isEnabled === null || override.isEnabled === undefined) {
          await tx.tenantFeature.deleteMany({
            where: { tenantId: tenant.id, key: override.key },
          });
          continue;
        }
        await tx.tenantFeature.upsert({
          where: {
            tenantId_key: { tenantId: tenant.id, key: override.key },
          },
          create: {
            tenantId: tenant.id,
            key: override.key,
            isEnabled: override.isEnabled,
            source: TenantFeatureSource.MANUAL,
            createdById: user.userId,
            updatedById: user.userId,
          },
          update: {
            isEnabled: override.isEnabled,
            source: TenantFeatureSource.MANUAL,
            updatedById: user.userId,
          },
        });
      }
    });

    const after = await this.buildModuleView(tenant.id);
    const changed = after.modules.filter((item) => {
      const previous = before.modules.find((entry) => entry.key === item.key);
      return (
        previous?.effectiveEnabled !== item.effectiveEnabled ||
        previous?.tenantOverride !== item.tenantOverride
      );
    });

    if (changed.length) {
      const actor = await resolvePlatformActor(this.prisma, user);
      await this.auditService.log({
        tenantId: tenant.id,
        actorUserId: user.userId,
        action: 'TENANT_MODULE_OVERRIDE_CHANGED',
        entityType: 'Tenant',
        entityId: tenant.id,
        sourceModule: 'tenant-control-plane',
        beforeSnapshot: {
          modules: changed.map((item) => {
            const previous = before.modules.find(
              (entry) => entry.key === item.key,
            );
            return {
              key: item.key,
              override: previous?.tenantOverride ?? null,
              effective: previous?.effectiveEnabled ?? null,
            };
          }),
        },
        afterSnapshot: {
          reason: dto.reason ?? null,
          modules: changed.map((item) => ({
            key: item.key,
            override: item.tenantOverride,
            effective: item.effectiveEnabled,
          })),
        },
      });
      await this.events.record({
        eventCode: 'TENANT_MODULE_OVERRIDE_CHANGED',
        source: 'API',
        entityType: 'Tenant',
        entityId: tenant.id,
        tenantId: tenant.id,
        actorType: 'PLATFORM_USER',
        actorId: actor.id,
        route: '/platform/tenants/:tenantId/modules',
        metadata: {
          actorName: actor.name,
          changed: changed.map((item) => item.key),
        },
      });
    }

    return after;
  }

  /** Enabled module keys, used by the overview snapshot and readiness check. */
  async enabledModuleKeys(tenantId: string) {
    const { enabledKeys } =
      await this.featureAccess.getResolvedTenantFeatures(tenantId);
    return enabledKeys;
  }

  private async buildModuleView(tenantId: string) {
    const [resolved, subscription] = await Promise.all([
      this.featureAccess.getResolvedTenantFeatures(tenantId),
      this.prisma.subscription.findUnique({
        where: { tenantId },
        select: {
          status: true,
          plan: { select: { id: true, key: true, name: true } },
        },
      }),
    ]);

    const definitionByKey = new Map<
      string,
      (typeof TENANT_FEATURE_DEFINITIONS)[number]
    >(TENANT_FEATURE_DEFINITIONS.map((item) => [item.key, item]));

    const modules = resolved.items.map((item) => {
      const definition = definitionByKey.get(item.key);
      return {
        key: item.key,
        label: definition?.label ?? item.label,
        description: definition?.description ?? item.description,
        categoryKey: definition?.categoryKey ?? 'other',
        categoryLabel: definition?.categoryLabel ?? 'Other',
        categoryOrder: definition?.categoryOrder ?? 999,
        sortOrder: definition?.sortOrder ?? 999,
        icon: definition?.icon ?? null,
        isIncludedInPlan: item.isIncludedInPlan,
        tenantOverride: item.tenantOverrideEnabled,
        effectiveEnabled: item.isEnabled,
        state: resolveState(item),
        /*
         * A plan that excludes a module makes "enable" meaningless, so the UI
         * is told which rows it must not offer as togglable rather than being
         * left to infer it.
         */
        canEnable: item.isIncludedInPlan,
      };
    });

    modules.sort(
      (left, right) =>
        left.categoryOrder - right.categoryOrder ||
        left.sortOrder - right.sortOrder ||
        left.label.localeCompare(right.label),
    );

    return {
      tenantId,
      plan: subscription?.plan ?? null,
      /*
       * Plan entitlement only counts while the subscription is live. A lapsed
       * subscription disables every module, which is a fact the screen has to
       * show rather than a bug in the override table.
       */
      planEntitlementActive:
        subscription?.status === SubscriptionStatus.ACTIVE ||
        subscription?.status === SubscriptionStatus.TRIALING,
      subscriptionStatus: subscription?.status ?? null,
      modules,
      enabledCount: modules.filter((item) => item.effectiveEnabled).length,
      overrideCount: modules.filter((item) => item.tenantOverride !== null)
        .length,
      totalCount: modules.length,
    };
  }
}

function resolveState(item: {
  isIncludedInPlan: boolean;
  isEnabled: boolean;
  tenantOverrideEnabled: boolean | null;
}): TenantModuleState {
  if (item.tenantOverrideEnabled === null) {
    return item.isIncludedInPlan ? 'ENABLED_BY_PLAN' : 'DISABLED_BY_PLAN';
  }
  if (item.tenantOverrideEnabled && !item.isIncludedInPlan)
    return 'BLOCKED_BY_PLAN';
  return item.tenantOverrideEnabled
    ? 'ENABLED_BY_OVERRIDE'
    : 'DISABLED_BY_OVERRIDE';
}
