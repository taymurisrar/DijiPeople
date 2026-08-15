import { WorkspaceState } from "../_components/workspace-state";

export const metadata = { title: "Workspace unavailable" };

/** A workspace that has been retired. Deliberately says nothing more. */
export default function WorkspaceUnavailablePage() {
  return (
    <WorkspaceState
      eyebrow="Workspace"
      title="This workspace is no longer available"
      description="Contact your organization's administrator or DijiPeople support if you believe this is unexpected."
    />
  );
}
