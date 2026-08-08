import { apiRequestJson } from "@/lib/server-api";
import type { Workflow, WorkflowBuilderOptions } from "@/lib/workflows-api";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../../_lib/require-settings-permission";
import { WorkflowsTable } from "../../_components/workflows-table";

export default async function WorkflowTemplatesPage() {
  const user = await requireSettingsPermissions(["workflows.read"]);

  const [workflows, options] = await Promise.all([
    apiRequestJson<{ items: Workflow[] }>("/workflows"),
    apiRequestJson<WorkflowBuilderOptions>("/workflows/builder-options"),
  ]);

  const canManage = hasAnySettingsPermission(user, ["workflows.manage"]);

  return (
    <SettingsShell
      description="Send email automatically when something happens. Each workflow watches one event, can be limited to a module and to any part of the organization, and sends the email templates you choose."
      eyebrow="Approvals"
      title="Workflows"
    >
      <WorkflowsTable
        canManage={canManage}
        options={options}
        workflows={workflows.items ?? []}
      />
    </SettingsShell>
  );
}
