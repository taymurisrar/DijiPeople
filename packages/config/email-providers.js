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

/**
 * Provider types that accept a message and discard it instead of delivering it.
 * Mirrors `isSinkProvider` in the API's `providers.ts`; a spec there fails if
 * the two disagree.
 */
const SINK_EMAIL_PROVIDER_TYPES = ['CONSOLE', 'DEV'];

/**
 * Whether sink providers are retired in this environment (ADR-0015, BUG-3501).
 *
 * Production must never select or resolve a sink: the demo tenant's only
 * provider was an enabled, default CONSOLE provider, so activation, reset and
 * approval mail was written to a log while the settings screen said it was
 * being sent. Development and test keep sinks, which is what they are for.
 *
 * Both variables are read and either one naming production is enough, so
 * `NODE_ENV=development` cannot mask `APP_ENV=production` (the reasoning in
 * the API's `storage.config.ts`). Render sets both to `production`.
 *
 * `staging` is deliberately not included: the decision retires sinks in
 * production only, and no staging environment exists yet. When one does, this
 * is the single place to add it.
 *
 * Takes the environment as an argument rather than reading `process.env`, so
 * the API can pass values from `ConfigService` and tests can pass a literal.
 */
function sinkEmailProvidersRetired(env) {
  const source = env || {};
  return [source.NODE_ENV, source.APP_ENV].some(
    (value) => String(value ?? '').trim().toLowerCase() === 'production',
  );
}

/** What an administrator may choose in this environment. */
function selectableEmailProviderTypes(env) {
  return sinkEmailProvidersRetired(env)
    ? SUPPORTED_EMAIL_PROVIDER_TYPES.filter(
        (type) => !SINK_EMAIL_PROVIDER_TYPES.includes(type),
      )
    : [...SUPPORTED_EMAIL_PROVIDER_TYPES];
}

module.exports = {
  SUPPORTED_EMAIL_PROVIDER_TYPES,
  UNIMPLEMENTED_EMAIL_PROVIDER_TYPES,
  ALL_EMAIL_PROVIDER_TYPES,
  SINK_EMAIL_PROVIDER_TYPES,
  isSupportedEmailProviderType,
  sinkEmailProvidersRetired,
  selectableEmailProviderTypes,
};
