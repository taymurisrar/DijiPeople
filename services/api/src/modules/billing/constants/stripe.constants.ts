import type Stripe from 'stripe';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export type StripeRuntimeMode = 'test' | 'live';

export type StripeClient = InstanceType<typeof Stripe>;
export type StripeEvent = ReturnType<
  StripeClient['webhooks']['constructEvent']
>;
