import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  isSubscriptionLive,
  resolveTenantFeatureState,
} from './tenant-entitlement.rule';
import type { TenantFeatureKey } from '../constants/tenant-features';

/**
 * How hard the platform enforces plan entitlements.
 *
 * This is the whole rollout story for BUG-1952. Enforcement cuts off every
 * tenant already using a module it never bought, so the code ships complete and
 * inert: the default is REPORT_ONLY, the refusals are logged, and the cutover is
 * a platform setting the owner changes deliberately.
 */
export type EntitlementEnforcementMode = 'OFF' | 'REPORT_ONLY' | 'ENFORCE';

export const ENTITLEMENT_ENFORCEMENT_MODES: readonly EntitlementEnforcementMode[] =
  ['OFF', 'REPORT_ONLY', 'ENFORCE'];

export const DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE: EntitlementEnforcementMode =
  'REPORT_ONLY';

/** The `PlatformSetting` row and field the mode lives in. */
export const ENTITLEMENT_SETTING_KEY = 'module-settings';
export const ENTITLEMENT_SETTING_FIELD = 'entitlementEnforcement';

/**
 * How long a resolved snapshot is trusted.
 *
 * A plan change or a subscription lapse therefore takes up to this long to bite.
 * That is an accepted bound and not an oversight: billing state is not a
 * security boundary, and the alternative is a database round trip on every
 * request to every gated module. A tenant module override does not wait — the
 * control plane invalidates the entry as it writes.
 */
export const ENTITLEMENT_CACHE_TTL_MS = 60_000;

export type TenantEntitlementSnapshot = {
  enabledKeys: ReadonlySet<string>;
  /** Whether a live subscription backed this snapshot. See `decide()`. */
  subscriptionLive: boolean;
  resolvedAt: number;
};

export type EntitlementOutcome =
  /** The plan includes it. */
  | 'ENTITLED'
  /** A live subscription whose plan does not include it. */
  | 'NOT_ENTITLED'
  /** No subscription, or one that is neither ACTIVE nor TRIALING. */
  | 'NO_LIVE_SUBSCRIPTION'
  /** Nothing could be resolved and there was no snapshot to fall back on. */
  | 'UNRESOLVABLE';

export type EntitlementDecision = {
  outcome: EntitlementOutcome;
  allowed: boolean;
  featureKeys: readonly TenantFeatureKey[];
  /** True when the answer came from an expired snapshot after a lookup fault. */
  stale: boolean;
};

type CacheEntry = {
  snapshot: TenantEntitlementSnapshot;
  expiresAt: number;
};

/**
 * Resolves what a tenant's plan entitles it to, for the request path.
 *
 * Deliberately not `FeatureAccessService`: that service builds the full
 * presentation shape — labels, descriptions, override provenance, subscription
 * money — for two admin screens, and a guard has no business paying for that on
 * every request. Both share `tenant-entitlement.rule.ts`, so there is still one
 * rule; what differs is how much of it is dressed up.
 */
@Injectable()
export class TenantEntitlementService {
  private readonly logger = new Logger(TenantEntitlementService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private modeCache: {
    mode: EntitlementEnforcementMode;
    expiresAt: number;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Drops a tenant's snapshot so the next request re-reads it.
   *
   * Called by the control plane after a module override is written, because
   * waiting out the TTL there would make an operator's deliberate change look
   * like it did not take.
   */
  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }

  /** Test and operational seam; not called on any request path. */
  invalidateAll() {
    this.cache.clear();
    this.modeCache = null;
  }

  async mode(): Promise<EntitlementEnforcementMode> {
    const now = Date.now();
    if (this.modeCache && this.modeCache.expiresAt > now) {
      return this.modeCache.mode;
    }

    let mode = DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE;
    try {
      const row = await this.prisma.platformSetting.findUnique({
        where: { key: ENTITLEMENT_SETTING_KEY },
        select: { value: true },
      });
      mode = parseEnforcementMode(row?.value);
    } catch (error) {
      /*
       * A mode that cannot be read falls back to the default rather than to the
       * last value or to ENFORCE. REPORT_ONLY is the safe answer in both
       * directions: it never refuses a request, and it never silently disables
       * the logging the platform owner is relying on to measure the cutover.
       */
      this.logger.warn(
        `Entitlement enforcement mode could not be read; defaulting to ${DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE}. ${describeError(error)}`,
      );
      mode = DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE;
    }

    this.modeCache = { mode, expiresAt: now + ENTITLEMENT_CACHE_TTL_MS };
    return mode;
  }

  /**
   * Decides whether a tenant may reach a feature.
   *
   * `allowed` here is the *entitlement* answer only. Whether a disallowed
   * request is actually refused is the guard's business, because that depends on
   * the enforcement mode.
   */
  async decide(
    tenantId: string,
    featureKeys: readonly TenantFeatureKey[],
  ): Promise<EntitlementDecision> {
    const resolution = await this.resolve(tenantId);

    if (!resolution) {
      return {
        outcome: 'UNRESOLVABLE',
        allowed: false,
        featureKeys,
        stale: false,
      };
    }

    const { snapshot, stale } = resolution;

    /*
     * A lapsed or missing subscription is a billing state, not an entitlement
     * one. `resolveTenantFeatureState` correctly reports nothing entitled for
     * it — which is right for the admin screen that has to show a customer why
     * their modules went dark — but refusing every gated request on that basis
     * would lock a whole tenant out of its own data over an unpaid invoice or a
     * provisioning gap. Dunning has its own notice period and its own product
     * decision; this gate answers "did they buy this module", not "did they pay
     * last month".
     */
    if (!snapshot.subscriptionLive) {
      return {
        outcome: 'NO_LIVE_SUBSCRIPTION',
        allowed: true,
        featureKeys,
        stale,
      };
    }

    const entitled = featureKeys.some((key) => snapshot.enabledKeys.has(key));

    return {
      outcome: entitled ? 'ENTITLED' : 'NOT_ENTITLED',
      allowed: entitled,
      featureKeys,
      stale,
    };
  }

  /**
   * A tenant's entitlement snapshot, from cache where possible.
   *
   * Returns `null` only when there is nothing at all to answer with: the lookup
   * failed and no snapshot — current or expired — was ever taken for this tenant
   * in this process. That is the one case the guard treats as unresolvable, and
   * it answers with a retryable 503 rather than a 403, because "the platform
   * could not check" and "you did not buy this" are different statements and
   * only one of them is the customer's problem.
   */
  private async resolve(
    tenantId: string,
  ): Promise<{ snapshot: TenantEntitlementSnapshot; stale: boolean } | null> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > now) {
      return { snapshot: cached.snapshot, stale: false };
    }

    try {
      const snapshot = await this.load(tenantId);
      this.cache.set(tenantId, {
        snapshot,
        expiresAt: now + ENTITLEMENT_CACHE_TTL_MS,
      });
      return { snapshot, stale: false };
    } catch (error) {
      /*
       * Fail closed, but bounded. A database blip must not convert a paying
       * tenant into an unentitled one, so an expired snapshot is served rather
       * than discarded — it was true a minute ago and a commercial answer does
       * not change faster than that. Only a cold cache genuinely has no answer.
       */
      if (cached) {
        this.logger.warn(
          `Entitlement lookup failed for tenant ${tenantId}; serving the last known snapshot. ${describeError(error)}`,
        );
        return { snapshot: cached.snapshot, stale: true };
      }

      this.logger.error(
        `Entitlement lookup failed for tenant ${tenantId} with no cached snapshot; denying. ${describeError(error)}`,
      );
      return null;
    }
  }

  private async load(tenantId: string): Promise<TenantEntitlementSnapshot> {
    const [subscription, overrides] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { tenantId },
        select: {
          status: true,
          plan: { select: { features: true } },
        },
      }),
      this.prisma.tenantFeature.findMany({
        where: { tenantId },
        select: { key: true, isEnabled: true },
      }),
    ]);

    const subscriptionLive = isSubscriptionLive(subscription?.status);
    const overrideByKey = new Map(
      overrides.map((override) => [override.key, override.isEnabled]),
    );

    const enabledKeys = new Set<string>();
    if (subscriptionLive) {
      for (const feature of subscription?.plan?.features ?? []) {
        const isEnabled = resolveTenantFeatureState({
          isIncludedInPlan: feature.isEnabled,
          tenantOverride: overrideByKey.get(feature.featureKey),
        });
        if (isEnabled) enabledKeys.add(feature.featureKey);
      }
    }

    return { enabledKeys, subscriptionLive, resolvedAt: Date.now() };
  }
}

export function parseEnforcementMode(
  value: unknown,
): EntitlementEnforcementMode {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE;
  }

  const raw = (value as Record<string, unknown>)[ENTITLEMENT_SETTING_FIELD];
  if (typeof raw !== 'string') return DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE;

  const normalized = raw.trim().toUpperCase();
  return (
    ENTITLEMENT_ENFORCEMENT_MODES.find((mode) => mode === normalized) ??
    /*
     * An unrecognised string is a typo in an operator's payload, and a typo must
     * not silently mean "enforce". It also must not silently mean "off": the
     * default keeps the logging on so the mistake is visible.
     */
    DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE
  );
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
