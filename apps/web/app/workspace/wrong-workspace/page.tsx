import { headers } from "next/headers";
import { getApiBaseUrl } from "@repo/config";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE, AUTH_APP_CLIENT_ID } from "@/lib/auth-config";
import { WORKSPACE_HEADER } from "@/lib/workspace-context";
import { WorkspaceState } from "../_components/workspace-state";

export const metadata = { title: "Wrong workspace" };

type OwnWorkspace = {
  name: string;
  url: string;
  canOpen: boolean;
} | null;

/**
 * A signed-in user on a workspace that is not theirs.
 *
 * Says only that they do not have access, and where they *do* belong — never
 * anything about the workspace they landed on beyond the name its own login page
 * already shows. The "go to my workspace" link is offered only when their own
 * workspace can actually serve them; sending someone to a suspended tenant just
 * moves the dead end.
 */
export default async function WrongWorkspacePage() {
  const [store, ownWorkspace] = await Promise.all([
    headers(),
    loadOwnWorkspace(),
  ]);
  const attempted = store.get(WORKSPACE_HEADER.name);

  return (
    <WorkspaceState
      tone="warning"
      eyebrow="Access denied"
      title="You don't have access to this workspace"
      description={
        attempted
          ? `Your account is not a member of the ${attempted} workspace.`
          : "Your account is not a member of this workspace."
      }
      detail={
        ownWorkspace ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Your workspace
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {ownWorkspace.name}
            </p>
          </div>
        ) : null
      }
      action={
        ownWorkspace?.canOpen
          ? { label: `Go to ${ownWorkspace.name}`, href: ownWorkspace.url }
          : null
      }
    />
  );
}

/**
 * The signed-in user's own workspace, read from the API using their session.
 *
 * The API answers from the session's tenant, so this cannot be steered by
 * anything in the URL or the headers.
 */
async function loadOwnWorkspace(): Promise<OwnWorkspace> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  try {
    const response = await fetch(`${getApiBaseUrl()}/workspaces/mine`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      defaultWorkspace?: { name: string; url: string; canOpen: boolean } | null;
      workspaces?: Array<{ name: string; url: string; canOpen: boolean }>;
    };
    return payload.defaultWorkspace ?? payload.workspaces?.[0] ?? null;
  } catch {
    return null;
  }
}
