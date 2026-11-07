import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { TenantFeatureSource } from '@prisma/client';
import { AppError } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import {
  isSubscriptionLive,
  resolveTenantFeatureState,
} from './tenant-entitlement.rule';
import {
  BASELINE_FEATURE_KEYS,
  TENANT_FEATURE_KEY_LIST,
  type TenantFeatureKey,
} from '../constants/tenant-features';

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

/**
 * Release-configuration floor for the mode (DP-QA-005).
 *
 * The stored platform setting alone is a weak place for a security posture to
 * live: a fresh, restored or re-seeded database has no row and silently comes up
 * REPORT_ONLY, so a Starter tenant can use every paid module until somebody
 * remembers to flip it. Setting this variable on a deployment makes the posture
 * part of the release: the effective mode is never weaker than it. The database
 * setting can still make it stricter, never looser.
 *
 * It is deliberately unset by default and is never changed by `seed:config`, so
 * shipping this code alters nothing until an owner sets it — after
 * `npm run entitlement:grandfather` has been run (ADR-0009).
 */
export const ENTITLEMENT_ENV_VAR = 'ENTITLEMENT_ENFORCEMENT_MODE';

const MODE_STRICTNESS: Record<EntitlementEnforcementMode, number> = {
  OFF: 0,
  REPORT_ONLY: 1,
  ENFORCE: 2,
};

export type EntitlementModeSource = 'ENV' | 'PLATFORM_SETTING' | 'DEFAULT';

/** The stricter of two modes. */
export function stricterMode(
  a: EntitlementEnforcementMode,
  b: EntitlementEnforcementMode,
): EntitlementEnforcementMode {
  return MODE_STRICTNESS[a] >= MODE_STRICTNESS[b] ? a : b;
}

/**
 * Reads the release floor. An absent or blank variable means "no floor".
 * A value that is set but is not a mode is a typo in a security setting; it
 * fails CLOSED to ENFORCE, with `invalid` set so the caller can say so, rather
 * than silently leaving the deployment unenforced.
 */
export function readEnvEnforcementFloor(
  env: Record<string, string | undefined> = process.env,
): { floor: EntitlementEnforcementMode | null; invalid: string | null } {
  const raw = env[ENTITLEMENT_ENV_VAR]?.trim();
  if (!raw) return { floor: null, invalid: null };

  const normalized = raw.toUpperCase();
  const mode = ENTITLEMENT_ENFORCEMENT_MODES.find((m) => m === normalized);
  return mode
    ? { floor: mode, invalid: null }
    : { floor: 'ENFORCE', invalid: raw };
}

/** The `PlatformSetting` row and field the mode lives in. */
export const ENTITLEMENT_SETTING_KEY = 'module-settings';
export const ENTITLEMENT_SETTING_FIELD = 'entitlementEnforcement';

/**
 * How long a resolved snapshot is trusted.
 *
 * This is the upper bound on staleness in ANY process. The control plane
 * invalidates the entry in the process that handled the change (a module override,
 * a plan edit, an operator subscription change, a plan change), so there nothing
 * waits; other API instances hold their own cache and converge within this TTL.
 * It is deliberately half of the approved 60 s withdrawal SLA (DP-QA-047): a TTL
 * equal to the SLA measured 60.0 s once request latency was added, so the margin
 * is the point. Billing state is not a security boundary, and the alternative is a
 * database round trip on every request to every gated module.
 */
export const ENTITLEMENT_CACHE_TTL_MS = 30_000;

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
export class TenantEntitlementService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TenantEntitlementService.name);
  private readonly cache = new Map<string, CacheEntry>();
  /**
   * Bumped by every invalidation. A load that started before an invalidation must
   * not write its (possibly pre-change) result into the cache afterwards, or a
   * concurrent request would re-seed the very staleness the invalidation removed
   * (DP-QA-047). Per tenant, plus one epoch for invalidateAll().
   */
  private readonly generations = new Map<string, number>();
  private epoch = 0;
  private modeCache: {
    mode: EntitlementEnforcementMode;
    source: EntitlementModeSource;
    stored: EntitlementEnforcementMode;
    floor: EntitlementEnforcementMode | null;
    expiresAt: number;
  } | null = null;

  /** The last stored mode that was read successfully; survives a later fault. */
  private lastKnownStoredMode: EntitlementEnforcementMode | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Makes an unenforced production loud at boot. A deployment that is not in
   * ENFORCE is a commercial decision, but it should never be an invisible one
   * (DP-QA-005). Never throws: the database may not be reachable yet, and a
   * boot that refuses to start over a log line would be worse than the gap.
   */
  async onApplicationBootstrap() {
    if (process.env.NODE_ENV !== 'production') return;

    try {
      const { mode, source, stored, floor } = await this.effectiveMode();
      if (mode !== 'ENFORCE') {
        this.logger.error(
          `ENTITLEMENT_NOT_ENFORCED mode=${mode} source=${source}: plan entitlements are not being refused in this environment. Set ${ENTITLEMENT_ENV_VAR}=ENFORCE after running the grandfather script (ADR-0009).`,
        );
      }
      /*
       * DP-QA-052. The release floor and the stored setting are two inputs to one
       * answer. When the floor is the only thing holding ENFORCE up, the stored
       * setting has drifted (a restore from an older backup, a manual edit): the
       * deployment is safe but the database no longer says so, and the next person
       * to remove the variable would silently withdraw enforcement. Say it at
       * boot, loudly enough to alert on.
       */
      if (floor && MODE_STRICTNESS[floor] > MODE_STRICTNESS[stored]) {
        this.logger.warn(
          `ENTITLEMENT_SETTING_DRIFT stored=${stored} floor=${floor} effective=${mode}: the ${ENTITLEMENT_ENV_VAR} release floor is overriding the stored setting. Set the stored setting to ${floor} (npm run entitlement:set-mode -- ${floor}) so the database and the deployment agree.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Entitlement mode could not be checked at startup. ${describeError(error)}`,
      );
    }
  }

  /**
   * Drops a tenant's snapshot so the next request re-reads it.
   *
   * Called by the control plane after a module override is written, because
   * waiting out the TTL there would make an operator's deliberate change look
   * like it did not take.
   */
  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
    this.generations.set(tenantId, (this.generations.get(tenantId) ?? 0) + 1);
  }

  /** Test and operational seam; not called on any request path. */
  invalidateAll() {
    this.cache.clear();
    this.epoch += 1;
    this.modeCache = null;
    this.lastKnownStoredMode = null;
  }

  async mode(): Promise<EntitlementEnforcementMode> {
    return (await this.effectiveMode()).mode;
  }

  /** The mode in force, and which input decided it. */
  async effectiveMode(): Promise<{
    mode: EntitlementEnforcementMode;
    source: EntitlementModeSource;
    /** The stored setting alone (or the last known / default one after a fault). */
    stored: EntitlementEnforcementMode;
    /** The release floor from the environment, when one is set. */
    floor: EntitlementEnforcementMode | null;
  }> {
    const now = Date.now();
    if (this.modeCache && this.modeCache.expiresAt > now) {
      const { mode, source, stored, floor } = this.modeCache;
      return { mode, source, stored, floor };
    }

    let stored: EntitlementEnforcementMode;
    let source: EntitlementModeSource = 'DEFAULT';
    try {
      const row = await this.prisma.platformSetting.findUnique({
        where: { key: ENTITLEMENT_SETTING_KEY },
        select: { value: true },
      });
      stored = parseEnforcementMode(row?.value);
      if (row?.value) source = 'PLATFORM_SETTING';
      this.lastKnownStoredMode = stored;
    } catch (error) {
      /*
       * A mode that cannot be read keeps the last one that could. A transient
       * database fault must not drop a deployment from ENFORCE to REPORT_ONLY,
       * which is the fail-open direction (DP-QA-005). With nothing known yet it
       * falls back to the default, which never refuses a request and never
       * silently disables the logging the owner relies on to measure the cutover.
       */
      stored = this.lastKnownStoredMode ?? DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE;
      this.logger.warn(
        `Entitlement enforcement mode could not be read; using ${stored}${this.lastKnownStoredMode ? ' (last known)' : ' (default)'}. ${describeError(error)}`,
      );
    }

    const { floor, invalid } = readEnvEnforcementFloor();
    if (invalid !== null) {
      this.logger.error(
        `${ENTITLEMENT_ENV_VAR}="${invalid}" is not one of ${ENTITLEMENT_ENFORCEMENT_MODES.join(', ')}; failing closed to ENFORCE.`,
      );
    }

    let mode = stored;
    if (floor && MODE_STRICTNESS[floor] > MODE_STRICTNESS[stored]) {
      mode = floor;
      source = 'ENV';
    }

    this.modeCache = {
      mode,
      source,
      stored,
      floor,
      expiresAt: now + ENTITLEMENT_CACHE_TTL_MS,
    };
    return { mode, source, stored, floor };
  }

  /**
   * What `/api/health` reports about enforcement (DP-QA-005).
   *
   * The deploy gate reads this from the RUNNING process, because the variable
   * lives on the service and not in this repository: a unit test cannot see what
   * production is configured with, a smoke check can. `enforced` is true only
   * when requests are actually refused, never merely logged. A fault reading the
   * mode reports UNKNOWN / not enforced, so the gate fails rather than assumes.
   */
  async describeEnforcement(): Promise<{
    mode: EntitlementEnforcementMode | 'UNKNOWN';
    enforced: boolean;
    /**
     * Which input decided the mode, and what each input says (DP-QA-052). A
     * deployment whose floor is carrying ENFORCE while the stored setting says
     * something weaker shows `source: 'ENV'` here, so drift between the Render
     * variable and the database is visible from outside rather than discovered
     * after a restore. Additive: `mode` and `enforced` are unchanged.
     */
    source?: EntitlementModeSource;
    stored?: EntitlementEnforcementMode;
    floor?: EntitlementEnforcementMode | null;
  }> {
    try {
      const { mode, source, stored, floor } = await this.effectiveMode();
      return { mode, enforced: mode === 'ENFORCE', source, stored, floor };
    } catch {
      return { mode: 'UNKNOWN', enforced: false };
    }
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
   * Whether a feature should be OFFERED to a tenant right now: true when
   * enforcement is not ENFORCE (nothing is refused yet, so nothing is hidden),
   * otherwise the entitlement answer. For filtering lists and menus, where
   * throwing would be wrong; use `assertEntitled` for a request that must fail.
   */
  async isOffered(
    tenantId: string,
    featureKeys: readonly TenantFeatureKey[],
  ): Promise<boolean> {
    if ((await this.mode()) !== 'ENFORCE') return true;
    return (await this.decide(tenantId, featureKeys)).allowed;
  }

  /**
   * Entitlement check for code that is NOT behind `EntitlementGuard` — the
   * `@Public()` agent login/refresh routes, which mint credentials for a tenant
   * before any guard can see one. Same semantics as the guard: OFF and
   * REPORT_ONLY let the call through (REPORT_ONLY logs), ENFORCE refuses a
   * tenant the plan does not sell the feature to, and a tenant whose entitlement
   * could not be read gets the retryable 503, never a silent pass.
   *
   * Call it only AFTER credentials have been verified, so the refusal cannot
   * become an account-enumeration oracle.
   */
  async assertEntitled(
    tenantId: string,
    featureKeys: readonly TenantFeatureKey[],
    route: string,
  ): Promise<void> {
    const mode = await this.mode();
    if (mode === 'OFF') return;

    const decision = await this.decide(tenantId, featureKeys);
    if (decision.allowed) return;

    const summary =
      `tenant=${tenantId} features=${featureKeys.join(',')} ` +
      `route=${route} outcome=${decision.outcome}`;
    if (mode === 'REPORT_ONLY') {
      this.logger.warn(`ENTITLEMENT_WOULD_REFUSE ${summary}`);
      return;
    }

    this.logger.warn(`ENTITLEMENT_REFUSED ${summary}`);
    if (decision.outcome === 'UNRESOLVABLE') {
      throw new AppError('TENANT_ENTITLEMENT_UNAVAILABLE', {
        details: { featureKeys: [...featureKeys] },
      });
    }
    throw new AppError('TENANT_FEATURE_NOT_ENTITLED', {
      details: { featureKeys: [...featureKeys] },
    });
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

    const generation = this.generations.get(tenantId) ?? 0;
    const epoch = this.epoch;
    try {
      const snapshot = await this.load(tenantId);
      // Only cache what is still current: an invalidation that landed while this
      // load was in flight means the snapshot may predate the change.
      if (
        (this.generations.get(tenantId) ?? 0) === generation &&
        this.epoch === epoch
      ) {
        this.cache.set(tenantId, {
          snapshot,
          expiresAt: now + ENTITLEMENT_CACHE_TTL_MS,
        });
      }
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
          gracePeriodEndsAt: true,
          plan: { select: { features: true } },
        },
      }),
      this.prisma.tenantFeature.findMany({
        where: { tenantId },
        select: { key: true, isEnabled: true, source: true },
      }),
    ]);

    const subscriptionLive = isSubscriptionLive(
      subscription?.status,
      subscription?.gracePeriodEndsAt,
    );
    const planFeatureByKey = new Map(
      (subscription?.plan?.features ?? []).map((feature) => [
        feature.featureKey,
        feature.isEnabled,
      ]),
    );
    const overrideByKey = new Map(
      overrides.map((override) => [override.key, override]),
    );

    const enabledKeys = new Set<string>();
    if (subscriptionLive) {
      /*
       * Every catalog key, not only the ones the plan has a `PlanFeature` row
       * for. `reconcilePlanFeatures` (commercial-bootstrap.ts) never writes a
       * disabled row for a feature a plan excludes — Starter simply has no
       * `payroll` row at all. Iterating the plan's own rows alone would mean a
       * CUSTOM override could never grant a feature the plan never mentions,
       * which is exactly the BUG-3350 grandfathering path this exists for.
       * Absence of a row is "not included", the same as an explicit
       * `isEnabled: false` one.
       */
      for (const key of TENANT_FEATURE_KEY_LIST) {
        // Baseline features (basic import/export) belong to every plan, custom
        // plans that do not list them included.
        const isIncludedInPlan =
          (planFeatureByKey.get(key) ?? false) ||
          BASELINE_FEATURE_KEYS.has(key);
        const override = overrideByKey.get(key);
        const isEnabled = resolveTenantFeatureState({
          isIncludedInPlan,
          tenantOverride: override?.isEnabled,
          overrideIsPlanCapped: override?.source !== TenantFeatureSource.CUSTOM,
        });
        if (isEnabled) enabledKeys.add(key);
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
