import { getPlatformDomainConfig } from "@repo/config";
import { WorkspaceState } from "../_components/workspace-state";

export const metadata = { title: "Workspace not found" };

/**
 * An address that names no workspace.
 *
 * Says nothing about whether the name was ever in use. A hostname that used to
 * belong to a customer, one that was disabled, and one that never existed all
 * produce exactly this page — anything else would let a visitor enumerate
 * DijiPeople's customers by trying names.
 */
export default function WorkspaceNotFoundPage() {
  const { appHost, protocol } = getPlatformDomainConfig();
  return (
    <WorkspaceState
      eyebrow="Workspace"
      title="Workspace not found"
      description="Check the address, or contact your administrator for the correct link to your workspace."
      action={
        appHost
          ? { label: "Go to DijiPeople login", href: `${protocol}://${appHost}` }
          : null
      }
    />
  );
}
