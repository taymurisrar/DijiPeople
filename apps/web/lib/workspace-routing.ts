import {
  PLATFORM_ENVIRONMENTS,
  isWorkspaceDiscoveryHostname,
  normalizeHostname,
  parseWorkspaceHostname,
  resolvePlatformEnvironment,
} from "@repo/config";

/**
 * What the tenant web app should do with the hostname a request arrived on.
 *
 * Every tenant hostname serves the SAME deployed application — there is no
 * per-customer build, and this is the module that makes one deployment behave
 * like many workspaces. The decision is made once, here, and the proxy applies
 * it; pages never re-derive it.
 */
export type WorkspaceRouteOutcome =
  | "WORKSPACE"
  | "PLATFORM_DISCOVERY"
  | "NOT_FOUND"
  | "SUSPENDED"
  | "PREPARING"
  | "UNAVAILABLE"
  | "REDIRECT";

export type WorkspaceRoute = {
  outcome: WorkspaceRouteOutcome;
  hostname: string;
  workspace: {
    tenantId: string;
    name: string;
    slug: string;
    status: string;
    environmentType: "PRODUCTION" | "UAT" | "SANDBOX" | "DEVELOPMENT";
    isPrimaryHost: boolean;
  } | null;
  redirectToUrl: string | null;
  message: string;
};

/** Where each non-servable outcome sends the visitor. */
export const WORKSPACE_STATE_ROUTES: Record<string, string> = {
  NOT_FOUND: "/workspace/not-found",
  SUSPENDED: "/workspace/suspended",
  PREPARING: "/workspace/preparing",
  UNAVAILABLE: "/workspace/unavailable",
};

export const WORKSPACE_STATE_PATH_PREFIX = "/workspace/";

/**
 * Whether a default tenant may be assumed when the hostname names no workspace.
 *
 * Development only, and never inferred from NODE_ENV alone. In any deployed
 * environment an unknown hostname must produce "workspace not found": falling
 * back to a default tenant would serve one customer's workspace to a request
 * that asked for another, which is the worst failure this system can have.
 */
export function isDevelopmentWorkspaceFallbackAllowed() {
  return (
    resolvePlatformEnvironment(process.env) === PLATFORM_ENVIRONMENTS.DEVELOPMENT
  );
}

/**
 * The dev-only default workspace slug, or "" outside development.
 *
 * Guarding the *reader* rather than every call site means a new caller cannot
 * accidentally reintroduce a production fallback.
 */
export function getDevelopmentFallbackWorkspaceSlug() {
  if (!isDevelopmentWorkspaceFallbackAllowed()) return "";
  const configured =
    process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ??
    process.env.DEFAULT_TENANT_SLUG ??
    "";
  return configured.trim().toLowerCase();
}

/**
 * A first-pass classification done without touching the database.
 *
 * The proxy runs on every request, so the cheap structural answers — this is the
 * discovery host, this is a local development origin, this hostname is not under
 * the tenant base domain at all — are made here, and only a plausible workspace
 * hostname costs a lookup.
 */
export function classifyHostname(host: string | null | undefined) {
  const hostname = normalizeHostname(host);

  if (!hostname) {
    return { kind: "INVALID" as const, hostname: "" };
  }
  if (isWorkspaceDiscoveryHostname(hostname)) {
    return { kind: "DISCOVERY" as const, hostname };
  }

  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost");
  if (isLocal) {
    return { kind: "LOCAL" as const, hostname };
  }

  const slug = parseWorkspaceHostname(hostname);
  if (slug) {
    return { kind: "WORKSPACE_HOST" as const, hostname, slug };
  }

  /*
   * A hostname that is neither a platform host nor under the tenant base domain
   * is still a candidate: it may be a verified custom domain. Only the database
   * can say, so it is resolved rather than rejected here.
   */
  return { kind: "CANDIDATE" as const, hostname };
}

/**
 * `maseer.localhost` in local development, so subdomain routing can be exercised
 * without wildcard DNS. Returns "" for a plain localhost origin.
 */
export function getLocalWorkspaceSlug(hostname: string) {
  if (!hostname.endsWith(".localhost")) return "";
  const label = hostname.slice(0, -".localhost".length);
  return label.includes(".") ? "" : label;
}
