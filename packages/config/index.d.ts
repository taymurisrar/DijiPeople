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
