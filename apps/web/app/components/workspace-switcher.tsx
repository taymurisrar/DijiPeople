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
 * The id the section's own label carries, so the list of workspaces is named
 * once and the links inside it inherit that name rather than repeating it.
 * ITEM-0102 recorded the previous control announcing itself twice — the
 * disclosure carried a visually hidden "Switch workspace." *and* a visible
 * "Switch workspace", which a screen reader read back as both.
 */
const SECTION_LABEL_ID = "workspace-switcher-label";

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
 * ITEM-0102 moved it into the avatar menu, where identity-scoped actions
 * already live. It used to be a `<details>` disclosure sitting alone in the
 * band between the page header and the record action bar, which read as page
 * content rather than as a property of the session — a person scanning that row
 * for Edit or Delete passed over a control that changes their entire context.
 *
 * It is therefore **a section, not a disclosure**: a dropdown nested inside the
 * avatar dropdown would be two menus deep for a list that is almost always two
 * items long. The links themselves keep the earlier intent — switching is a
 * full navigation to another hostname under a different session scope, so it
 * should feel like leaving, because it is.
 *
 * It also renders its own separator rather than letting the caller draw one.
 * The caller receives this as an already-rendered slot and cannot see whether
 * it resolved to null, so a caller-drawn divider would hang in the menu of
 * every single-workspace user — which is nearly all of them.
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
    <div className="mt-3 border-t border-border pt-3">
      <p
        className="px-4 pb-1 text-xs font-medium uppercase tracking-[0.16em] text-muted"
        id={SECTION_LABEL_ID}
      >
        Switch workspace
      </p>

      <ul aria-labelledby={SECTION_LABEL_ID} className="grid gap-1">
        {others.map((workspace) => (
          <li key={workspace.tenantId}>
            {workspace.canOpen ? (
              <Link
                className="block rounded-2xl px-4 py-2.5 transition hover:bg-surface hover:text-accent"
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
              <div className="rounded-2xl px-4 py-2.5">
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
