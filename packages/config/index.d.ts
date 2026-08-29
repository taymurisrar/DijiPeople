export declare const DEFAULT_LOCAL_PORTS: Readonly<{
  landing: 3000;
  web: 3001;
  admin: 3002;
  api: 4000;
}>;

export declare const PRODUCTION_APP_URLS: Readonly<{
  landing: string;
  web: string;
  admin: string;
  api: string;
}>;

export declare const AGREEMENT_CATEGORY_OPTIONS: readonly Readonly<{
  value:
    | "PARTNER"
    | "LEAD_PROSPECT"
    | "CUSTOMER"
    | "TENANT_PROVISIONING"
    | "SUPPORT_SERVICE"
    | "OTHER";
  label: string;
}>[];

export declare const AGREEMENT_CATEGORY_VALUES: readonly (
  | "PARTNER"
  | "LEAD_PROSPECT"
  | "CUSTOMER"
  | "TENANT_PROVISIONING"
  | "SUPPORT_SERVICE"
  | "OTHER"
)[];

export declare function getAppPort(
  app: "landing" | "web" | "admin" | "api",
  env?: NodeJS.ProcessEnv,
): number;

export type DijiPeopleApp = "landing" | "web" | "admin" | "api";

export declare function getAppOrigin(
  app: DijiPeopleApp,
  env?: NodeJS.ProcessEnv,
): string;

export declare const LOOPBACK_HOSTNAMES: readonly string[];

export declare const REQUIRED_APP_URLS: Readonly<
  Record<DijiPeopleApp, readonly DijiPeopleApp[]>
>;

export declare const FORWARDED_FOR_HEADER: "x-forwarded-for";

export interface NextSecurityHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/**
 * Security response headers for a Next app (BUG-0040). The CSP is emitted as
 * Content-Security-Policy-Report-Only; frame protection is enforced.
 */
export declare function securityHeadersForApp(options?: {
  apiOrigin?: string;
  frameable?: boolean;
}): NextSecurityHeaderRule[];

export declare function baselineSecurityHeaders(options?: {
  frameable?: boolean;
}): { key: string; value: string }[];

export declare function contentSecurityPolicy(options?: {
  apiOrigin?: string;
}): string;

/**
 * The client-closest address in an `X-Forwarded-For` chain, or null when the
 * header is absent or empty. Callers must decide whether the chain is
 * trustworthy before believing the result.
 */
export declare function readForwardedForClientIp(
  headerValue: string | string[] | undefined | null,
): string | null;

/**
 * Headers a first-party proxy merges into its outbound request so the API can
 * still identify the visitor rather than the proxy. Returns an empty object when
 * there is no incoming chain to carry.
 */
export declare function buildForwardedClientHeaders(
  incomingHeaders: { get(name: string): string | null } | Headers,
): Record<string, string>;

/**
 * How many proxy hops the deployment says may be trusted, or `false` for none.
 *
 * Explicit `TRUST_PROXY_HEADERS` wins; otherwise Render and Vercel are inferred
 * as one hop. An unrecognised explicit value is `false`, never a fallback to
 * inference.
 */
export declare function resolveTrustProxySetting(
  env: Record<string, string | undefined>,
): number | false;

/** The same decision as a boolean. */
export declare function isForwardedHostTrusted(
  env: Record<string, string | undefined>,
): boolean;

/**
 * The forwarded host a proxy claims the request arrived on, normalized, or null.
 * Whether it may be believed is the caller's decision, not this function's.
 */
export declare function readForwardedHost(
  headers: { get(name: string): string | null | undefined } | Headers,
): string | null;

/** The normalized `Host` header, or null. */
export declare function readHost(
  headers: { get(name: string): string | null | undefined } | Headers,
): string | null;

/**
 * The hostname a request actually arrived on: `Host`, unless the deployment has
 * declared a proxy in front, in which case the first hop of `Forwarded` or
 * `X-Forwarded-Host` wins. Normalized, or null when there is no usable host.
 */
export declare function resolveForwardedHostname(
  headers: { get(name: string): string | null | undefined } | Headers,
  env: Record<string, string | undefined>,
): string | null;

/**
 * Every canonical app URL resolved from one env object. The only supported way
 * for application code to answer "where does the <x> app live" — call sites
 * must not re-derive an origin with their own loopback fallback.
 */
export declare function resolveAppUrls(env?: NodeJS.ProcessEnv): Readonly<{
  landing: string;
  web: string;
  admin: string;
  api: string;
  apiBaseUrl: string;
}>;

/** Absolute URL into one of the apps, joined without concatenation hazards. */
export declare function buildAppUrl(
  app: DijiPeopleApp,
  path?: string,
  env?: NodeJS.ProcessEnv,
): string;

export declare function isLoopbackUrl(value: string): boolean;

export declare function getApiBaseUrl(env?: NodeJS.ProcessEnv): string;

export declare function getAllowedCorsOrigins(
  env?: NodeJS.ProcessEnv,
): string[];

export declare function getLocalArchitecture(env?: NodeJS.ProcessEnv): {
  landing: string;
  web: string;
  admin: string;
  api: string;
};

export declare function getAppStage(env?: NodeJS.ProcessEnv): string;

export declare function isProductionLike(env?: NodeJS.ProcessEnv): boolean;

export declare function requireEnv(env: NodeJS.ProcessEnv, key: string): string;

export declare function validateDeploymentEnv(
  env?: NodeJS.ProcessEnv,
  options?: { app?: "api" | "web" | "admin" | "landing" },
): {
  app: string;
  productionLike: boolean;
  apiBaseUrl: string;
  allowedCorsOrigins: string[];
};

export type SystemWidgetAdapterMethod = "getTimelineEntries" | "getWidgetData";

export interface SystemWidgetDefinition {
  readonly widgetKey: string;
  readonly aliases: readonly string[];
  readonly displayName: string;
  readonly widgetType: "system";
  readonly supportedModules?: readonly string[];
  readonly supportedModuleCapabilities: readonly string[];
  readonly supportedFormComponentTypes: readonly string[];
  readonly requiredDataAdapterMethods: readonly SystemWidgetAdapterMethod[];
  readonly requiredPermissions: readonly string[];
  readonly allowedRoles: readonly string[];
  readonly savedRecordRequired: boolean;
  readonly emptyState: string;
  readonly unsavedRecordMessage: string;
  readonly missingAdapterDiagnostic: string;
}

export type SystemWidgetAvailabilityStatus =
  | "available"
  | "custom-widget-disabled"
  | "missing-adapter"
  | "permission-denied"
  | "role-denied"
  | "unpublished-placement"
  | "unregistered"
  | "unsaved-record"
  | "unsupported-component"
  | "unsupported-module";

export interface SystemWidgetAvailability {
  readonly status: SystemWidgetAvailabilityStatus;
  readonly definition: SystemWidgetDefinition | null;
  readonly message: string;
  readonly missingAdapterMethods?: readonly SystemWidgetAdapterMethod[];
}

export declare const SYSTEM_WIDGET_REGISTRY: Readonly<
  Record<string, SystemWidgetDefinition>
>;
export declare const SYSTEM_MODULE_CAPABILITIES: Readonly<
  Record<string, readonly string[]>
>;
export declare function listSupportedSystemWidgets(
  moduleKey: string,
): readonly SystemWidgetDefinition[];

export declare function resolveSystemWidgetDefinition(
  widgetKeyOrType?: string,
): SystemWidgetDefinition | null;

export declare function resolveSystemWidgetAvailability(input: {
  readonly widgetKey?: string;
  readonly widgetType?: string;
  readonly lifecycleState?: string;
  readonly formComponentType?: string;
  readonly moduleKey: string;
  readonly moduleCapabilities?: readonly string[];
  readonly recordId?: string;
  readonly adapterMethods?: readonly string[];
  readonly permissionKeys?: readonly string[];
  readonly roleKeys?: readonly string[];
}): SystemWidgetAvailability;

export * from "./platform-runtime-schema";
export * from "./platform-runtime-views";
export * from "./platform-domains";

/**
 * Email provider types with a working implementation behind them (BUG-0050).
 * The Prisma `EmailProviderType` enum keeps every historical value; this is the
 * narrower set the settings UI may offer.
 */
export declare const SUPPORTED_EMAIL_PROVIDER_TYPES: readonly string[];
export declare const UNIMPLEMENTED_EMAIL_PROVIDER_TYPES: readonly string[];
export declare const ALL_EMAIL_PROVIDER_TYPES: readonly string[];
export declare function isSupportedEmailProviderType(
  providerType: string,
): boolean;

/**
 * Postgres connection selection (BUG-0086).
 *
 * `DATABASE_URL` is the runtime connection and may be pooled. Prisma migrations
 * need a *direct* connection because `migrate deploy` holds a session-scoped
 * advisory lock, which a transaction pooler cannot keep across statements.
 * `DIRECT_DATABASE_URL` names that connection and is optional — unset,
 * migrations fall back to `DATABASE_URL`, which is correct for local Postgres.
 */
export declare const POOLED_HOST_INFIX: string;
export declare function isPooledConnectionUrl(url: string | undefined): boolean;
export declare function resolveMigrationDatabaseUrl(
  env?: NodeJS.ProcessEnv,
): string | undefined;
export declare function describeMigrationUrlProblem(
  env?: NodeJS.ProcessEnv,
): string | null;

/**
 * The currencies the platform supports (BUG-1425).
 *
 * One catalog for the API and the admin app, which previously held two lists of
 * different lengths while neither validated a code: partner and commission DTOs
 * checked `@MaxLength(3)` and stored whatever fitted, so `"5"` was a currency.
 */
/*
 * The union is spelled out so consumers keep literal types: `apps/admin`
 * derives `PlatformCurrencyCode` from it and uses it in `satisfies` positions
 * that a bare `string` would silently widen. `platform-currencies.test.js`
 * asserts this list and the runtime array describe the same set, so the two
 * halves of this package cannot drift the way the app-level lists did.
 */
export type PlatformCurrencyCode =
  | "QAR"
  | "SAR"
  | "AED"
  | "BHD"
  | "KWD"
  | "OMR"
  | "USD"
  | "GBP"
  | "EUR"
  | "PKR"
  | "INR"
  | "BDT"
  | "LKR"
  | "NPR"
  | "PHP"
  | "MYR"
  | "SGD"
  | "CNY"
  | "JPY"
  | "KRW"
  | "TRY"
  | "EGP"
  | "ZAR"
  | "NGN"
  | "KES"
  | "CAD"
  | "AUD"
  | "NZD"
  | "CHF"
  | "SEK"
  | "NOK"
  | "DKK"
  | "MXN"
  | "BRL"
  | "ARS";

export interface PlatformCurrency {
  readonly code: PlatformCurrencyCode;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}
export declare const PLATFORM_CURRENCIES: readonly PlatformCurrency[];
export declare const PLATFORM_CURRENCY_CODES: readonly PlatformCurrencyCode[];
export declare function isSupportedCurrencyCode(
  value: unknown,
): value is PlatformCurrencyCode;
export declare function resolvePlatformCurrency(
  value: unknown,
): PlatformCurrency | null;

/**
 * What an empty list should say (BUG-1752, BUG-1559, BUG-1654).
 *
 * The admin default blamed filters that were not set and told operators to
 * create records on screens with no create control. One implementation, shared,
 * so the next correction is not made twice.
 */
export declare function emptyListDescription(input: {
  filtered: boolean;
  canCreate?: boolean;
  singular?: string;
  origin?: string;
}): string;
export declare function emptyListTitle(input: {
  filtered: boolean;
  plural?: string;
}): string;
