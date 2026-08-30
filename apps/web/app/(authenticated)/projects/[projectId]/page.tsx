import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { projectRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import type { ProjectRecord } from "../types";

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function ProjectDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ projectId }, resolvedSearchParams, sessionUser] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { formId?: string }),
    getSessionUser(),
  ]);
  const project = await apiRequestJson<ProjectRecord>(`/projects/${projectId}`);
  const runtime = await buildPublishedStandardRouteRuntime({
    pageKind: "detail",
    recordId: project.id,
    sessionUser,
    spec: projectRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );

  return (
    <div className="dp-theme-scope dp-projects-scope grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="read"
        record={mapProjectRecord(project)}
        recordId={project.id}
        runtime={runtime}
        spec={projectRuntimeSpec}
        title={project.name}
      />
    </div>
  );
}

function mapProjectRecord(project: ProjectRecord) {
  return {
    ...project,
    customerName: project.customer?.name ?? "",
    assignedEmployeesCount: project.assignedEmployees?.length ?? 0,
  };
}
