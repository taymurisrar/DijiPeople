/**
 * Which email provider types the backend can actually deliver through.
 *
 * BUG-0050: the tenant notification settings UI offered SES, SendGrid, Mailgun,
 * Postmark and Custom. Every one of them mapped to `ApiPlaceholderEmailProvider`,
 * whose send and connection-test methods throw "not implemented". A tenant
 * administrator could configure a provider, mark it default, pass no test, and
 * silently receive no mail.
 *
 * The root cause was two catalogs: the UI listed what the *enum* allowed, the
 * factory decided what was *built*, and nothing compared them. The Prisma enum
 * is the wire contract and keeps every value — existing rows may reference one,
 * and narrowing an enum is a destructive migration. What must be shared is the
 * narrower question the UI actually needs to ask: what can send today.
 *
 * This file is that single answer. `email-provider-factory.service.ts` builds
 * from it, the settings UI offers from it, and
 * `email-provider-support.spec.ts` fails if the two ever diverge again.
 *
 * Adding a real provider is therefore a three-line change here plus its
 * implementation — and forgetting the implementation makes the spec red rather
 * than shipping an option that quietly drops mail.
 */

/** Provider types with a working implementation behind them. */
const SUPPORTED_EMAIL_PROVIDER_TYPES = ['CONSOLE', 'DEV', 'SMTP'];

/**
 * Declared in the Prisma enum but not implemented. Kept explicit rather than
 * derived by subtraction so that adding an enum value forces a decision here
 * instead of silently landing in whichever bucket the subtraction produces.
 */
const UNIMPLEMENTED_EMAIL_PROVIDER_TYPES = [
  'SES',
  'SENDGRID',
  'MAILGUN',
  'POSTMARK',
  'CUSTOM',
];

/** Every value the Prisma `EmailProviderType` enum declares. */
const ALL_EMAIL_PROVIDER_TYPES = [
  ...SUPPORTED_EMAIL_PROVIDER_TYPES,
  ...UNIMPLEMENTED_EMAIL_PROVIDER_TYPES,
];

function isSupportedEmailProviderType(providerType) {
  return SUPPORTED_EMAIL_PROVIDER_TYPES.includes(providerType);
}

module.exports = {
  SUPPORTED_EMAIL_PROVIDER_TYPES,
  UNIMPLEMENTED_EMAIL_PROVIDER_TYPES,
  ALL_EMAIL_PROVIDER_TYPES,
  isSupportedEmailProviderType,
};
