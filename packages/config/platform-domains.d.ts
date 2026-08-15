export type PlatformEnvironment = "development" | "staging" | "production";

export declare const PLATFORM_ENVIRONMENTS: Readonly<{
  DEVELOPMENT: "development";
  STAGING: "staging";
  PRODUCTION: "production";
}>;

export declare const RESERVED_HOST_LABELS: readonly string[];

export interface PlatformDomainConfig {
  readonly platformEnvironment: PlatformEnvironment;
  readonly baseDomain: string;
  readonly tenantBaseDomain: string;
  readonly appHost: string;
  readonly adminHost: string;
  readonly apiHost: string;
  readonly landingHost: string;
  readonly protocol: "http" | "https";
}

export declare function getPlatformDomainConfig(
  env?: NodeJS.ProcessEnv,
): PlatformDomainConfig;

export declare function resolvePlatformEnvironment(
  env?: NodeJS.ProcessEnv,
): PlatformEnvironment;

export declare function getPlatformHostnames(
  env?: NodeJS.ProcessEnv,
): Set<string>;

export declare function isPlatformHostname(
  hostname: string | null | undefined,
  env?: NodeJS.ProcessEnv,
): boolean;

export declare function isWorkspaceDiscoveryHostname(
  hostname: string | null | undefined,
  env?: NodeJS.ProcessEnv,
): boolean;

/** Normalised hostname, or "" when the value is not a usable hostname. */
export declare function normalizeHostname(
  value: string | null | undefined,
): string;

/** The workspace slug a hostname claims, or null. Exact suffix matching. */
export declare function parseWorkspaceHostname(
  hostname: string | null | undefined,
  env?: NodeJS.ProcessEnv,
): string | null;

export declare function isReservedHostLabel(label: string): boolean;

export declare function isValidWorkspaceSlugFormat(
  value: string | null | undefined,
): boolean;

export declare function suggestWorkspaceSlug(
  value: string | null | undefined,
): string;

export declare function buildWorkspaceHostname(
  slug: string,
  env?: NodeJS.ProcessEnv,
): string;

export declare function buildWorkspaceUrl(
  slug: string,
  options?: {
    readonly env?: NodeJS.ProcessEnv;
    readonly path?: string;
    readonly hostname?: string | null;
    readonly developmentOrigin?: string;
  },
): string;
