import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  STRIPE_CLIENT,
  type StripeClient,
  type StripeRuntimeMode,
} from '../constants/stripe.constants';

@Injectable()
export class StripeBillingService {
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
      const product = await this.stripe.products.retrieve(
        input.stripeProductId,
      );
      if (!('deleted' in product) || !product.deleted) return product;
    }

    return this.stripe.products.create({
      name: input.name,
      description: input.description ?? undefined,
      metadata: { planId: input.planId, source: 'dijipeople' },
    });
  }

  async createMonthlyPerSeatPrice(input: {
    productId: string;
    unitAmount: number;
    currency: string;
    planId: string;
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
      recurring: { interval: 'month', usage_type: 'licensed' },
      metadata: {
        planId: input.planId,
        billingModel: 'PER_SEAT',
        billingInterval: 'MONTH',
      },
    });
  }

  async verifyMonthlyPerSeatPrice(input: {
    stripePriceId: string;
    expectedProductId?: string | null;
    expectedCurrency: string;
    expectedUnitAmount: number;
  }) {
    const price = await this.stripe.prices.retrieve(input.stripePriceId);
    const productId =
      typeof price.product === 'string' ? price.product : price.product.id;
    const mode = this.getRuntimeMode();
    const reasons: string[] = [];

    if (!price.active) reasons.push('Stripe Price is inactive.');
    if (price.type !== 'recurring')
      reasons.push('Stripe Price is not recurring.');
    if (price.recurring?.interval !== 'month')
      reasons.push('Stripe Price interval is not monthly.');
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

  isSecretKeyConfigured() {
    return Boolean(this.configService.get<string>('STRIPE_SECRET_KEY')?.trim());
  }

  isWebhookSecretConfigured() {
    return Boolean(
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET')?.trim(),
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

export function createStripeClient(configService: ConfigService): StripeClient {
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
