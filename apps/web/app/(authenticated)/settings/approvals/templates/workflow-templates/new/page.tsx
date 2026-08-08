import { apiRequestJson } from "@/lib/server-api";
import type { WorkflowBuilderOptions } from "@/lib/workflows-api";
import { SettingsShell } from "../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../_lib/require-settings-permission";
import { WorkflowBuilder } from "../../../_components/workflow-builder";

export default async function NewWorkflowPage() {
  await requireSettingsPermissions(["workflows.manage"]);

  const options = await apiRequestJson<WorkflowBuilderOptions>(
    "/workflows/builder-options",
  );

  return (
    <SettingsShell
      description="Choose what triggers the workflow, where it applies, and which emails it sends."
      eyebrow="Approvals"
      title="New Workflow"
    >
      <WorkflowBuilder options={options} />
    </SettingsShell>
  );
}
