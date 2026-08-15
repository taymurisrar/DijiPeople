import { headers } from "next/headers";
import { WORKSPACE_HEADER } from "@/lib/workspace-context";
import { WorkspaceState } from "../_components/workspace-state";

export const metadata = { title: "Workspace is being prepared" };

/**
 * A workspace that exists but is not finished.
 *
 * A Tenant Owner can land here if their invitation arrives before provisioning
 * completes, so it reads as progress rather than as a fault.
 */
export default async function WorkspacePreparingPage() {
  const store = await headers();
  const name = store.get(WORKSPACE_HEADER.name) || "Your";

  return (
    <WorkspaceState
      tone="warning"
      eyebrow="Setup in progress"
      title={`${name} workspace is being prepared`}
      description="Your workspace is still being set up. It will be available shortly — try again in a few minutes, or contact DijiPeople support if this persists."
    />
  );
}
