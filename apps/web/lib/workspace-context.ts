import { headers } from "next/headers";
import { getApiBaseUrl } from "@repo/config";
import type { WorkspaceRoute } from "./workspace-routing";

/**
 * The workspace a server render belongs to.
 *
 * The proxy resolves the hostname once and passes the outcome forward on request
 * headers, so a page never re-resolves it and every page agrees about which
 * workspace it is rendering. Headers set by the proxy cannot be forged by the
 * browser: Next strips incoming copies of them before the proxy runs, and the
 * proxy overwrites them unconditionally.
 */
export const WORKSPACE_HEADER = {
  outcome: "x-dijipeople-workspace-outcome",
  tenantId: "x-dijipeople-workspace-tenant",
  slug: "x-dijipeople-workspace-slug",
  name: "x-dijipeople-workspace-name",
  environment: "x-dijipeople-workspace-environment",
  hostname: "x-dijipeople-workspace-host",
} as const;

export type WorkspaceContext = {
  tenantId: string | null;
  name: string;
  slug: string;
  environmentType: "PRODUCTION" | "UAT" | "SANDBOX" | "DEVELOPMENT";
  hostname: string;
  outcome: string;
};

/**
 * Read the workspace the proxy resolved for this request.
 *
 * Never returns a tenant id the request did not resolve to — a page that needs
 * tenant data still gets it through the authenticated session, and this context
 * is only for display and routing decisions.
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const store = await headers();
  const tenantId = store.get(WORKSPACE_HEADER.tenantId);
  const outcome = store.get(WORKSPACE_HEADER.outcome);

  if (!outcome) return null;

  return {
    tenantId: tenantId || null,
    name: store.get(WORKSPACE_HEADER.name) ?? "",
    slug: store.get(WORKSPACE_HEADER.slug) ?? "",
    environmentType: readEnvironment(store.get(WORKSPACE_HEADER.environment)),
    hostname: store.get(WORKSPACE_HEADER.hostname) ?? "",
    outcome,
  };
}

/**
 * Resolve a hostname through the API.
 *
 * Used by the proxy on the edge. The response contains only what a login screen
 * has to show — display name, lifecycle, environment — and nothing that would
 * leak one customer's configuration to a request for another.
 */
export async function resolveWorkspaceRoute(
  hostname: string,
  init?: { signal?: AbortSignal },
): Promise<WorkspaceRoute | null> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/workspaces/resolve?host=${encodeURIComponent(hostname)}`,
      { cache: "no-store", signal: init?.signal },
    );
    if (!response.ok) return null;
    return (await response.json()) as WorkspaceRoute;
  } catch {
    /*
     * A resolution failure is not a routing decision. The caller decides what a
     * missing answer means — in development it may fall back, in production the
     * request is refused rather than served against a guess.
     */
    return null;
  }
}

function readEnvironment(value: string | null): WorkspaceContext["environmentType"] {
  return value === "UAT" || value === "SANDBOX" || value === "DEVELOPMENT"
    ? value
    : "PRODUCTION";
}

/** Non-production workspaces carry a visible marker so they cannot be mistaken. */
export function isNonProductionWorkspace(
  environmentType: WorkspaceContext["environmentType"] | undefined,
) {
  return Boolean(environmentType) && environmentType !== "PRODUCTION";
}

/**
 * Refuse to render a workspace the signed-in user does not belong to.
 *
 * The session says which tenant the user is; the hostname says which tenant is
 * being asked for. A valid Maseer session presented on another customer's
 * hostname must not render that customer's workspace — the session proves
 * identity, never entitlement to a workspace.
 *
 * Both values are server-side: the tenant id comes from the session the API
 * validated, and the workspace comes from the hostname the proxy resolved.
 * Neither is anything the browser can set.
 */
export async function assertSessionMatchesWorkspace(sessionTenantId: string) {
  const context = await getWorkspaceContext();

  /*
   * No workspace context means the hostname named no workspace — local
   * development, or the discovery host. There is nothing to mismatch against,
   * and the API still scopes every read by the session's own tenant.
   */
  if (!context?.tenantId) return;

  if (context.tenantId !== sessionTenantId) {
    return "/workspace/wrong-workspace";
  }
  return;
}
