import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  isSubscriptionLive,
  resolveTenantFeatureState,
} from '../../common/security/tenant-entitlement.rule';
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
      tenantOverrides.map((feature) => [feature.key, feature]),
    );
    /*
     * The subscription-live test and the plan/override combination both moved
     * to `common/security/tenant-entitlement.rule.ts` when BUG-1952 put a guard
     * on the same question. Behaviour here is unchanged; what changed is that
     * there is now exactly one implementation of the rule, so the screen and the
     * gate cannot come to disagree by a boolean.
     */
    const planFeatureMap = new Map(
      isSubscriptionLive(subscription?.status)
        ? (subscription?.plan?.features.map((feature) => [
            feature.featureKey,
            feature.isEnabled,
          ]) ?? [])
        : [],
    );

    const items = TENANT_FEATURE_DEFINITIONS.map((definition) => {
      const isIncludedInPlan = planFeatureMap.get(definition.key) ?? false;
      const override = tenantOverrideMap.get(definition.key);
      const isEnabled = resolveTenantFeatureState({
        isIncludedInPlan,
        tenantOverride: override?.isEnabled,
        // BUG-3350 — a CUSTOM override (written only by the grandfather
        // migration script) is authoritative in both directions, same as the
        // enforcement guard resolves it. Keeping this screen and the guard on
        // one rule is the whole reason `resolveTenantFeatureState` lives in
        // `common/security` rather than being reimplemented here.
        overrideIsPlanCapped: override?.source !== 'CUSTOM',
      });

      return {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        isIncludedInPlan,
        isEnabled,
        tenantOverrideEnabled: override?.isEnabled ?? null,
        tenantOverrideSource: override?.source ?? null,
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

  /**
   * Throws when a feature is off for the tenant.
   *
   * Not the enforcement layer, and never was: it had zero call sites for as long
   * as it existed, which is BUG-1952. Request-path enforcement is
   * `EntitlementGuard` plus `@RequireEntitlement`, which is declarative,
   * covered by a wiring invariant, and governed by the platform enforcement
   * mode. This remains for a domain service that needs the check mid-operation
   * rather than at the route boundary — reach for the guard first.
   */
  async assertFeatureEnabled(tenantId: string, featureKey: string) {
    const isEnabled = await this.isFeatureEnabled(tenantId, featureKey);

    if (!isEnabled) {
      throw new ForbiddenException(
        `The ${featureKey} feature is not enabled for this tenant plan.`,
      );
    }
  }
}
