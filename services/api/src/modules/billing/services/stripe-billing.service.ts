import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BillingInterval, BillingModel } from '@prisma/client';
import {
  STRIPE_CLIENT,
  type StripeClient,
  type StripeRuntimeMode,
} from '../constants/stripe.constants';

@Injectable()
export class StripeBillingService {
  private readonly logger = new Logger(StripeBillingService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
    private readonly configService: ConfigService,
  ) {}

  get client() {
    return this.stripe;
  }

  getRuntimeMode(): StripeRuntimeMode {
    return normalizeStripeMode(
      requireStripeEnv(this.configService, 'STRIPE_MODE'),
    );
  }

  async verifyConnection() {
    const account = await this.stripe.account.retrieve(null);
    return {
      accountId: account.id,
      mode: this.getRuntimeMode(),
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      verifiedAt: new Date(),
    };
  }

  async resolveOrCreateProduct(input: {
    stripeProductId?: string | null;
    name: string;
    description?: string | null;
    planId: string;
  }) {
    if (input.stripeProductId) {
      try {
        const product = await this.stripe.products.retrieve(
          input.stripeProductId,
        );
        if (!('deleted' in product) || !product.deleted) return product;
      } catch (error) {
        /*
         * A stored id that Stripe does not recognise is not a failure — it is
         * the exact case the "orCreate" half of this method's name promises to
         * handle. Only the *deleted* case was covered, and `products.retrieve`
         * does not return a deleted stub for an id that never existed here: it
         * throws `resource_missing`.
         *
         * That turned one stale id into a permanent dead end. Every attempt to
         * create or edit any price on the plan answered
         * `500 SYSTEM_UNEXPECTED_ERROR — No such product: 'prod_…'`, and no
         * screen offered a way to clear the id, so the plan could never be
         * priced again. Seen on production 2026-08-23 against
         * `prod_V4vU7oieZdX6kH`.
         *
         * An id goes stale for ordinary reasons: the Stripe sandbox was reset,
         * the account was switched, or the product was removed in the Stripe
         * dashboard. None of those should brick a plan.
         *
         * Only `resource_missing` is swallowed. An auth failure, a rate limit
         * or a network error must still surface — creating a duplicate product
         * because Stripe was briefly unreachable would be a worse outcome than
         * the error.
         */
        const missing =
          error instanceof Stripe.errors.StripeInvalidRequestError &&
          error.code === 'resource_missing';
        if (!missing) throw error;

        this.logger.warn(
          `Stripe product ${input.stripeProductId} no longer exists; creating a replacement for plan ${input.planId}.`,
        );
      }
    }

    return this.stripe.products.create({
      name: input.name,
      description: input.description ?? undefined,
      metadata: { planId: input.planId, source: 'dijipeople' },
    });
  }

  async createRecurringPrice(input: {
    productId: string;
    unitAmount: number;
    currency: string;
    planId: string;
    billingModel: BillingModel;
    billingInterval: BillingInterval;
  }) {
    if (!Number.isFinite(input.unitAmount) || input.unitAmount <= 0) {
      throw new BadRequestException(
        'Stripe price amount must be greater than zero.',
      );
    }

    return this.stripe.prices.create({
      product: input.productId,
      currency: input.currency.toLowerCase(),
      unit_amount: Math.round(input.unitAmount * 100),
      recurring: {
        interval:
          input.billingInterval === BillingInterval.YEAR ? 'year' : 'month',
        usage_type: 'licensed',
      },
      metadata: {
        planId: input.planId,
        billingModel: input.billingModel,
        billingInterval: input.billingInterval,
      },
    });
  }

  /**
   * Retire a Stripe Price.
   *
   * Stripe Prices cannot be deleted, only deactivated — so this is what
   * "delete" means on the Stripe side of removing a plan price. Best effort by
   * design: the caller has already established that nothing is billed against
   * the row, and a Stripe outage is not a reason to leave an unwanted price
   * sitting in the local catalogue. It reports what happened so the caller can
   * say so rather than imply a clean removal.
   */
  async archiveRecurringPrice(
    stripePriceId: string,
  ): Promise<{ archived: boolean; reason?: string }> {
    try {
      await this.stripe.prices.update(stripePriceId, { active: false });
      return { archived: true };
    } catch (error) {
      const missing =
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === 'resource_missing';
      if (missing) {
        // Already gone from Stripe's side. The outcome asked for.
        return { archived: true };
      }

      const reason =
        error instanceof Error ? error.message : 'Unknown Stripe error.';
      this.logger.warn(
        `Could not archive Stripe price ${stripePriceId}: ${reason}`,
      );
      return { archived: false, reason };
    }
  }

  async verifyRecurringPrice(input: {
    stripePriceId: string;
    expectedProductId?: string | null;
    expectedCurrency: string;
    expectedUnitAmount: number;
    expectedBillingInterval: BillingInterval;
  }) {
    const mode = this.getRuntimeMode();

    /*
     * BUG-1134 — a stale price id is a verdict, not a crash.
     *
     * This called `prices.retrieve` bare. A `stripePriceId` pointing at a price
     * that no longer exists — a reset sandbox, a switched account, a price
     * deleted in the dashboard — threw straight out of the request and became a
     * 500 on the plan-pricing screen, with no way for an operator to clear the
     * id. Seen on production 2026-08-24 against
     * `price_1U4mO1Dx5h60TWDLy3zudsug`.
     *
     * That is the same defect BUG-0995 fixed for the *product* eighty lines
     * above, and this call was left bare beside it. Fixing one half of a
     * symmetry is how the second half survives to be found in production.
     *
     * This function already speaks in verdicts — `{ valid, reasons }` — and its
     * caller turns an invalid one into `stripeSyncStatus: FAILED` with the
     * reasons attached. So "the price is gone" belongs in `reasons`, where an
     * operator can read it and re-sync, rather than in a stack trace.
     *
     * Only `resource_missing` is swallowed, for the reason given above: an auth
     * failure or a network blip must still surface, because silently marking a
     * good price unsynced during a Stripe outage is worse than the error.
     */
    // Derived from the call rather than written as `Stripe.Price`: this SDK
    // does not expose that name on the default export, and deriving it means
    // the annotation cannot drift from what `retrieve` actually returns.
    let price: Awaited<ReturnType<StripeClient['prices']['retrieve']>>;
    try {
      price = await this.stripe.prices.retrieve(input.stripePriceId);
    } catch (error) {
      const missing =
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === 'resource_missing';
      if (!missing) throw error;

      this.logger.warn(
        `Stripe price ${input.stripePriceId} no longer exists; marking it unsynced so it can be re-synced.`,
      );

      return {
        valid: false,
        reasons: [
          `Stripe Price ${input.stripePriceId} no longer exists in this Stripe account. Re-sync the price to create a replacement.`,
        ],
        productId: input.expectedProductId ?? null,
        priceId: null,
        active: false,
        currency: input.expectedCurrency.toUpperCase(),
        unitAmount: null,
        recurringInterval: null,
        usageType: null,
        // The price is gone, so it has no livemode of its own. Report the
        // runtime's, so the environment stamp stays consistent with every other
        // row written in this mode rather than flipping to a false default.
        livemode: mode === 'live',
        mode,
        verifiedAt: new Date(),
      };
    }

    const productId =
      typeof price.product === 'string' ? price.product : price.product.id;
    const reasons: string[] = [];

    if (!price.active) reasons.push('Stripe Price is inactive.');
    if (price.type !== 'recurring')
      reasons.push('Stripe Price is not recurring.');
    const expectedInterval =
      input.expectedBillingInterval === BillingInterval.YEAR ? 'year' : 'month';
    if (price.recurring?.interval !== expectedInterval)
      reasons.push(`Stripe Price interval is not ${expectedInterval}.`);
    if (price.recurring?.usage_type !== 'licensed')
      reasons.push('Stripe Price usage type is not licensed.');
    if (price.currency.toUpperCase() !== input.expectedCurrency.toUpperCase())
      reasons.push('Stripe Price currency does not match.');
    if (price.unit_amount !== Math.round(input.expectedUnitAmount * 100))
      reasons.push('Stripe Price amount does not match.');
    if (input.expectedProductId && productId !== input.expectedProductId)
      reasons.push('Stripe Product ID does not match.');
    if (price.livemode !== (mode === 'live'))
      reasons.push('Stripe Price test/live environment does not match.');

    return {
      valid: reasons.length === 0,
      reasons,
      productId,
      priceId: price.id,
      active: price.active,
      currency: price.currency.toUpperCase(),
      unitAmount: price.unit_amount === null ? null : price.unit_amount / 100,
      recurringInterval: price.recurring?.interval ?? null,
      usageType: price.recurring?.usage_type ?? null,
      livemode: price.livemode,
      mode,
      verifiedAt: new Date(),
    };
  }

  async createPromotion(input: {
    promotionId: string;
    name: string;
    percentOff?: number | null;
    amountOff?: number | null;
    currency?: string | null;
    duration: 'once' | 'repeating' | 'forever';
    durationMonths?: number | null;
    redeemBy?: Date | null;
    maximumRedemptions?: number | null;
    code?: string | null;
    productId?: string | null;
  }) {
    const coupon = await this.stripe.coupons.create({
      name: input.name,
      percent_off: input.percentOff ?? undefined,
      amount_off:
        input.amountOff == null ? undefined : Math.round(input.amountOff * 100),
      currency:
        input.amountOff == null ? undefined : input.currency?.toLowerCase(),
      duration: input.duration,
      duration_in_months:
        input.duration === 'repeating'
          ? (input.durationMonths ?? undefined)
          : undefined,
      redeem_by: input.redeemBy
        ? Math.floor(input.redeemBy.getTime() / 1000)
        : undefined,
      max_redemptions: input.maximumRedemptions ?? undefined,
      applies_to: input.productId ? { products: [input.productId] } : undefined,
      metadata: { promotionId: input.promotionId, source: 'dijipeople' },
    });
    const promotionCode = input.code
      ? await this.stripe.promotionCodes.create({
          promotion: { type: 'coupon', coupon: coupon.id },
          code: input.code,
          active: true,
          expires_at: input.redeemBy
            ? Math.floor(input.redeemBy.getTime() / 1000)
            : undefined,
          max_redemptions: input.maximumRedemptions ?? undefined,
          metadata: { promotionId: input.promotionId, source: 'dijipeople' },
        })
      : null;
    return { coupon, promotionCode };
  }

  isSecretKeyConfigured() {
    return Boolean(this.configService.get<string>('STRIPE_SECRET_KEY')?.trim());
  }

  isWebhookSecretConfigured() {
    return Boolean(
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET')?.trim(),
    );
  }

  isPublishableKeyConfigured() {
    return Boolean(
      this.configService.get<string>('STRIPE_PUBLISHABLE_KEY')?.trim(),
    );
  }

  getWebhookSecret() {
    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!secret?.trim()) {
      throw new InternalServerErrorException(
        'Stripe webhook secret is not configured.',
      );
    }

    return secret;
  }
}

/**
 * Build the real Stripe client. Throws if the configuration is incomplete.
 *
 * Kept separate from the provider factory so the same validation runs whether
 * it is triggered at boot (production) or on first use (everywhere else).
 */
function buildStripeClient(configService: ConfigService): StripeClient {
  const secretKey = requireStripeEnv(configService, 'STRIPE_SECRET_KEY');
  const apiVersion = requireStripeEnv(configService, 'STRIPE_API_VERSION');
  const mode = normalizeStripeMode(
    requireStripeEnv(configService, 'STRIPE_MODE'),
  );

  assertSecretMatchesMode(secretKey, mode);

  const stripeConfig: Record<string, unknown> = {
    apiVersion,
  };

  return new Stripe(secretKey, stripeConfig);
}

/**
 * The `STRIPE_CLIENT` provider.
 *
 * WHY THIS IS LAZY — ITEM-0047. This factory used to construct the client
 * eagerly, which meant it threw during Nest's dependency-graph construction
 * whenever Stripe was unconfigured. Because `BillingModule` is part of
 * `AppModule`, that made the **entire API un-bootable without Stripe
 * credentials** — not just billing. Eight e2e suites (app, attendance, gateway,
 * platform-workflows) failed for weeks with `STRIPE_SECRET_KEY is required`,
 * and were recorded as "database e2e suites fail against an ephemeral
 * PostgreSQL". They never touched the database; they never got that far.
 * The same trap catches any environment that does not do billing — a seed
 * script, a CLI invocation, a developer machine.
 *
 * The fix moves the failure from construction to first use. Every guarantee is
 * kept: an unconfigured client still throws, with the same message, naming the
 * same variable. What changes is that it throws when somebody tries to charge
 * a card rather than when the process starts.
 *
 * **Production still fails fast.** Deferring the check everywhere would let a
 * misconfigured production deployment serve traffic until the first customer
 * tried to pay, which is strictly worse than refusing to start. So in a
 * production-like environment the client is built eagerly, exactly as before.
 */
export function createStripeClient(configService: ConfigService): StripeClient {
  if (isProductionLike(configService)) {
    return buildStripeClient(configService);
  }

  let client: StripeClient | null = null;
  const resolve = (): StripeClient => {
    client ??= buildStripeClient(configService);
    return client;
  };

  // A Proxy rather than a hand-written façade: the Stripe client surface is
  // large and grows with the SDK, and a façade would silently omit whatever it
  // had not been taught about.
  return new Proxy({} as StripeClient, {
    get(_target, property, receiver) {
      // Do not resolve for framework probing. Nest inspects an injected value
      // during instantiation — notably reading `then` to decide whether the
      // provider is asynchronous — and resolving on those reads would rebuild
      // the eager behaviour this proxy exists to remove, throwing at boot for
      // a property nobody asked for. Symbols are excluded for the same reason:
      // `Symbol.toStringTag`, `util.inspect.custom` and friends are all
      // touched by tooling that has no interest in Stripe.
      if (typeof property === 'symbol' || FRAMEWORK_PROBE_KEYS.has(property)) {
        return undefined;
      }

      const value = Reflect.get(
        resolve() as object,
        property,
        receiver,
      ) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(resolve())
        : value;
    },
    has(_target, property) {
      if (typeof property === 'symbol' || FRAMEWORK_PROBE_KEYS.has(property)) {
        return false;
      }
      return Reflect.has(resolve() as object, property);
    },
  });
}

/**
 * Environments where an unconfigured Stripe client must stop the boot rather
 * than wait for the first charge. Mirrors `auth.config.ts`, which makes the
 * same distinction for cookie and session hardening.
 */
const PRODUCTION_LIKE_ENVIRONMENTS = new Set(['production', 'staging']);

/**
 * Property names read by frameworks and tooling rather than by billing code.
 *
 * `then` is the important one: Nest reads it to decide whether a provider
 * resolved to a promise, and that read alone would have rebuilt the eager
 * failure this whole mechanism removes.
 */
const FRAMEWORK_PROBE_KEYS = new Set([
  'then',
  'catch',
  'finally',
  'constructor',
  'prototype',
  'toJSON',
  'inspect',
  'asymmetricMatch',
  '$$typeof',
  'nodeType',
  'tagName',
  // Nest walks every provider instance on init and shutdown looking for these.
  // A Stripe client implements none of them, so answering `undefined` is both
  // correct and the difference between booting and not.
  'onModuleInit',
  'onApplicationBootstrap',
  'onModuleDestroy',
  'beforeApplicationShutdown',
  'onApplicationShutdown',
]);

function isProductionLike(configService: ConfigService): boolean {
  const appEnv =
    configService.get<string>('APP_ENV') ??
    configService.get<string>('NODE_ENV') ??
    'development';

  return PRODUCTION_LIKE_ENVIRONMENTS.has(appEnv.toLowerCase());
}

function requireStripeEnv(configService: ConfigService, key: string) {
  const value = configService.get<string>(key);

  if (!value?.trim()) {
    throw new Error(`${key} is required for Stripe billing.`);
  }

  return value.trim();
}

function normalizeStripeMode(value: string): StripeRuntimeMode {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'test' || normalized === 'live') {
    return normalized;
  }

  throw new Error('STRIPE_MODE must be either "test" or "live".');
}

function assertSecretMatchesMode(secretKey: string, mode: StripeRuntimeMode) {
  if (mode === 'test' && !secretKey.startsWith('sk_test_')) {
    throw new Error(
      'STRIPE_SECRET_KEY must be a test key when STRIPE_MODE=test.',
    );
  }

  if (mode === 'live' && !secretKey.startsWith('sk_live_')) {
    throw new Error(
      'STRIPE_SECRET_KEY must be a live key when STRIPE_MODE=live.',
    );
  }
}
