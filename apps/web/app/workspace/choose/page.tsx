import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getApiBaseUrl } from "@repo/config";
import { ACCESS_TOKEN_COOKIE, AUTH_APP_CLIENT_ID, LOGIN_ROUTE } from "@/lib/auth-config";
import { WorkspaceState } from "../_components/workspace-state";

export const metadata = { title: "Your workspaces" };

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
 * Workspace discovery, reached on the generic login host after signing in.
 *
 * This page used to carry a note explaining that it would always resolve to
 * exactly one workspace, because `User.tenantId` was a single non-null column
 * and one person in two workspaces was two unrelated rows. It was written
 * against a list anyway, on the bet that membership would arrive later.
 *
 * TASK-0009 made that true: `/workspaces/mine` now resolves the identity and
 * returns every workspace it reaches. The bet paid off — this page did not have
 * to change to start working, only to stop claiming it could not.
 */
export default async function ChooseWorkspacePage() {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    redirect(LOGIN_ROUTE);
  }

  const result = await loadWorkspaces(token);

  if (!result) {
    return (
      <WorkspaceState
        eyebrow="Workspaces"
        title="We couldn't load your workspaces"
        description="Try again in a moment. If this continues, contact DijiPeople support."
        action={{ label: "Back to sign in", href: LOGIN_ROUTE }}
      />
    );
  }

  /*
   * One workspace it can actually serve — go straight there rather than making
   * someone click through a list of one.
   */
  if (result.workspaces.length === 1 && result.defaultWorkspace) {
    redirect(result.defaultWorkspace.url);
  }

  if (!result.workspaces.length) {
    return (
      <WorkspaceState
        eyebrow="Workspaces"
        title="No workspace is available for your account"
        description="Your account is not attached to an active workspace. Contact your organization's administrator."
      />
    );
  }

  const blocked = result.workspaces.filter((item) => !item.canOpen);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        Workspaces
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-950">
        Choose a workspace
      </h1>
      <ul className="mt-5 space-y-2">
        {result.workspaces.map((workspace) => (
          <li key={workspace.tenantId}>
            {workspace.canOpen ? (
              <Link
                href={workspace.url}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {workspace.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {new URL(workspace.url).host}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {/*
                    Which one they are already in. Without it, somebody with two
                    similarly-named workspaces has no way to tell where the
                    session they are currently holding actually points.
                  */}
                  {workspace.isCurrent ? (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Current
                    </span>
                  ) : null}
                  {workspace.environmentType !== "PRODUCTION" ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                      {workspace.environmentType}
                    </span>
                  ) : null}
                </span>
              </Link>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3">
                <p className="text-sm font-semibold text-slate-700">
                  {workspace.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {workspace.unavailableReason ??
                    "This workspace is currently unavailable."}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
      {blocked.length ? (
        <p className="mt-4 text-xs text-slate-500">
          Workspaces that are suspended or still being prepared are shown but
          cannot be opened.
        </p>
      ) : null}
    </div>
  );
}

async function loadWorkspaces(token: string) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/workspaces/mine`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as {
      workspaces: Workspace[];
      defaultWorkspace: Workspace | null;
    };
  } catch {
    return null;
  }
}
