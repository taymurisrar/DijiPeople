import { headers } from "next/headers";
import { WORKSPACE_HEADER } from "@/lib/workspace-context";
import { WorkspaceState } from "../_components/workspace-state";

export const metadata = { title: "Workspace suspended" };

/**
 * A real workspace that DijiPeople has stopped. The customer's own
 * administrator needs to know it is suspended rather than broken, so the
 * workspace is named — the name is already on its own login page — and the
 * reason deliberately is not.
 */
export default async function WorkspaceSuspendedPage() {
  const store = await headers();
  const name = store.get(WORKSPACE_HEADER.name) || "This";

  return (
    <WorkspaceState
      tone="danger"
      eyebrow="Workspace suspended"
      title={`${name} workspace is temporarily suspended`}
      description="Access has been paused. Your data, subscription and history are preserved. Contact your organization's administrator or DijiPeople support to restore access."
    />
  );
}
