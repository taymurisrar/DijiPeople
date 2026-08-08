import { apiRequestJson } from "@/lib/server-api";
import type {
  Workflow,
  WorkflowBuilderOptions,
  WorkflowRun,
} from "@/lib/workflows-api";
import { SettingsShell } from "../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../_lib/require-settings-permission";
import { WorkflowBuilder } from "../../../_components/workflow-builder";
import { WorkflowRunHistory } from "../../../_components/workflow-run-history";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function WorkflowDetailPage({ params }: PageProps) {
  const { id } = await params;
  await requireSettingsPermissions(["workflows.read"]);

  const [workflow, options, runs] = await Promise.all([
    apiRequestJson<Workflow>(`/workflows/${encodeURIComponent(id)}`),
    apiRequestJson<WorkflowBuilderOptions>("/workflows/builder-options"),
    apiRequestJson<{ items: WorkflowRun[] }>(
      `/workflows/${encodeURIComponent(id)}/runs`,
    ),
  ]);

  return (
    <SettingsShell
      description="Change what triggers this workflow, where it applies, and what it sends. The history below shows every time it ran."
      eyebrow="Approvals"
      title={workflow.name}
    >
      <div className="grid gap-6">
        <WorkflowBuilder options={options} workflow={workflow} />
        <WorkflowRunHistory runs={runs.items ?? []} />
      </div>
    </SettingsShell>
  );
}
