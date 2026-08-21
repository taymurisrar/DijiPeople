import { buildWorkspaceUrl, getAppOrigin } from "@repo/config";

type QueryValue = string | number | boolean | null | undefined;

/**
 * Where an operator lands when they open a customer's workspace.
 *
 * This file used to build the URL itself — read
 * `NEXT_PUBLIC_TENANT_ROOT_DOMAIN`, decide whether that meant subdomain mode,
 * and otherwise append `?tenant=<slug>` to the web origin. That is a second
 * implementation of the rule `buildWorkspaceUrl` exists to be the only copy of,
 * and its own comment says why: "building `https://${slug}.dijipeople.com` by
 * hand elsewhere is how a link ends up pointing at a hostname the tenant does
 * not actually own."
 *
 * The two had already diverged. `buildWorkspaceUrl` keys on
 * `TENANT_BASE_DOMAIN` and its documented fallbacks; this file keyed on a
 * variable in that list under a different name, so with admin's configuration
 * subdomain mode never engaged and Open Tenant produced
 * `http://localhost:3001/login?tenant=xoul-ltd` while every server-generated
 * link for the same workspace used the subdomain form.
 *
 * Now there is one rule, and admin inherits its behaviour — including the
 * development port, which the hand-rolled version could not express.
 */
export function buildTenantLoginUrl(slug: string) {
  return buildTenantPortalUrl(slug, "/login");
}

export function buildTenantActivationUrl(slug: string, token?: string | null) {
  return buildTenantPortalUrl(slug, "/activate", { token });
}

export function buildTenantPortalUrl(
  slug: string,
  path = "/login",
  query?: Record<string, QueryValue>,
) {
  const url = new URL(
    buildWorkspaceUrl(slug.trim().toLowerCase(), {
      path: normalizePath(path),
      /*
       * Admin's own configured web origin, so a deployment that addresses the
       * workspace app somewhere other than the default still produces reachable
       * links. `buildWorkspaceUrl` uses this only when no workspace hostname
       * can be built — and, in development, for the port.
       */
      developmentOrigin: resolveTenantAppBaseUrl(),
    }),
  );

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export function resolveTenantAppBaseUrl() {
  // Operators follow these links into a customer's live workspace, so a
  // loopback fallback here does not degrade gracefully — it produces an
  // unreachable link that looks correct. getAppOrigin throws in production
  // rather than inventing one, and admin's next.config.ts has already run
  // validateDeploymentEnv, which requires the workspace URL to be configured.
  return (
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ||
    getAppOrigin("web", process.env)
  );
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}
