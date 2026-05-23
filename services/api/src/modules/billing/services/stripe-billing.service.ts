import {
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
