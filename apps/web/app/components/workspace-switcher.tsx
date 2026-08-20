import { cookies } from "next/headers";
import Link from "next/link";
import { getApiBaseUrl } from "@repo/config";
import { ACCESS_TOKEN_COOKIE, AUTH_APP_CLIENT_ID } from "@/lib/auth-config";

type Workspace = {
  tenantId: string;
  name: string;
  slug: string;
  environmentType: string;
  url: string;
  canOpen: boolean;
  unavailableReason: string | null;
  isCurrent?: boolean;
};

/**
 * Moving between the workspaces one person belongs to.
 *
 * This is TASK-0008's WP-06, which sat `BLOCKED` because it could not be built:
 * `/workspaces/mine` returned a one-element array **by construction** — it read
 * `user.tenantId` from the session — so a switcher would have been a control
 * with nowhere to go. TASK-0009 gave it somewhere.
 *
 * **It renders nothing when there is nothing to switch to**, which is most
 * people. A menu offering one item is noise on every screen of the product, and
 * the cost of noise is that people stop reading the header.
 *
 * Deliberately a plain list of links rather than a dropdown. Switching
 * workspace is a full navigation to another hostname and a different session
 * scope — the interaction should feel like leaving, because it is. A dropdown
 * that quietly re-renders the page underneath would suggest otherwise.
 */
export async function WorkspaceSwitcher() {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const workspaces = await loadWorkspaces(token);

  /*
   * One workspace, or none, or the call failed. All three render nothing: a
   * switcher is an affordance, and an affordance that cannot be honoured is
   * worse than its absence. A failed load must not put a broken control in the
   * header of every page.
   */
  if (!workspaces || workspaces.length < 2) return null;

  const others = workspaces.filter((workspace) => !workspace.isCurrent);
  if (!others.length) return null;

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-muted hover:text-foreground">
        <span className="sr-only">Switch workspace. </span>
        <span aria-hidden="true">⌂</span>
        <span>Switch workspace</span>
      </summary>

      <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-border bg-background p-1 shadow-lg">
        <ul>
          {others.map((workspace) => (
            <li key={workspace.tenantId}>
              {workspace.canOpen ? (
                <Link
                  className="block rounded-lg px-3 py-2 hover:bg-surface-muted"
                  href={workspace.url}
                >
                  <span className="block truncate text-sm font-medium text-foreground">
                    {workspace.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {hostOf(workspace.url)}
                  </span>
                </Link>
              ) : (
                /*
                 * Shown, but not a link. Somebody whose second workspace is
                 * suspended should see that it exists and why they cannot open
                 * it — a workspace that silently disappears reads as data loss.
                 */
                <div className="rounded-lg px-3 py-2">
                  <span className="block truncate text-sm font-medium text-muted">
                    {workspace.name}
                  </span>
                  <span className="block text-xs text-muted">
                    {workspace.unavailableReason ?? "Currently unavailable."}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/** The hostname, or the raw value if it is not a URL this can parse. */
function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function loadWorkspaces(token: string): Promise<Workspace[] | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/workspaces/mine`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { workspaces?: Workspace[] };
    return body.workspaces ?? null;
  } catch {
    /*
     * Swallowed on purpose. This renders inside the authenticated shell on
     * every page; a network blip must not take the whole application down to
     * avoid drawing an optional menu.
     */
    return null;
  }
}
