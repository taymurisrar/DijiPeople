import { ForbiddenException, Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { TenantSettingsRepository } from './tenant-settings.repository';
import { TENANT_FEATURE_DEFINITIONS } from './tenant-settings.catalog';

@Injectable()
export class FeatureAccessService {
  constructor(
    private readonly tenantSettingsRepository: TenantSettingsRepository,
  ) {}

  async getResolvedTenantFeatures(tenantId: string) {
    const [subscription, tenantOverrides] = await Promise.all([
      this.tenantSettingsRepository.findSubscriptionForTenant(tenantId),
      this.tenantSettingsRepository.findFeaturesByTenant(tenantId),
    ]);

    const tenantOverrideMap = new Map(
      tenantOverrides.map((feature) => [feature.key, feature.isEnabled]),
    );
    const planFeatureMap = new Map(
      subscription?.status === SubscriptionStatus.ACTIVE ||
        subscription?.status === SubscriptionStatus.TRIALING
        ? (subscription?.plan?.features.map((feature) => [
            feature.featureKey,
            feature.isEnabled,
          ]) ?? [])
        : [],
    );

    const items = TENANT_FEATURE_DEFINITIONS.map((definition) => {
      const isIncludedInPlan = planFeatureMap.get(definition.key) ?? false;
      const tenantOverride = tenantOverrideMap.get(definition.key);
      const isEnabled =
        typeof tenantOverride === 'boolean'
          ? isIncludedInPlan && tenantOverride
          : isIncludedInPlan;

      return {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        isIncludedInPlan,
        isEnabled,
        tenantOverrideEnabled: tenantOverride ?? null,
      };
    });

    return {
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            plan: {
              id: subscription.plan.id,
              key: subscription.plan.key,
              name: subscription.plan.name,
            },
            billingCycle: subscription.billingCycle,
            finalPrice: Number(subscription.finalPrice),
            currency: subscription.currency,
          }
        : null,
      items,
      enabledKeys: items
        .filter((feature) => feature.isEnabled)
        .map((feature) => feature.key),
    };
  }

  async isFeatureEnabled(tenantId: string, featureKey: string) {
    const { enabledKeys } = await this.getResolvedTenantFeatures(tenantId);
    return (enabledKeys as string[]).includes(featureKey);
  }

  async assertFeatureEnabled(tenantId: string, featureKey: string) {
    const isEnabled = await this.isFeatureEnabled(tenantId, featureKey);

    if (!isEnabled) {
      throw new ForbiddenException(
        `The ${featureKey} feature is not enabled for this tenant plan.`,
      );
    }
  }
}
