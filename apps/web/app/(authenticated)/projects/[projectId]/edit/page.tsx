import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { projectRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import type { ProjectRecord } from "../../types";

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function EditProjectPage({
  params,
  searchParams,
}: PageProps) {
  const [{ projectId }, resolvedSearchParams, sessionUser] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { formId?: string }),
    getSessionUser(),
  ]);
  const project = await apiRequestJson<ProjectRecord>(`/projects/${projectId}`);
  const runtime = buildStandardRouteRuntime({
    pageKind: "edit",
    recordId: project.id,
    sessionUser,
    spec: projectRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );

  return (
    <main className="dp-theme-scope dp-projects-scope grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="edit"
        record={{
          ...project,
          customerName: project.customer?.name ?? "",
          assignedEmployeesCount: project.assignedEmployees?.length ?? 0,
        }}
        recordId={project.id}
        runtime={runtime}
        spec={projectRuntimeSpec}
        title={`Edit ${project.name}`}
      />
    </main>
  );
}
