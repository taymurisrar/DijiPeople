import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { loadEmployeeOptions } from "../../work/_lib/employee-options";
import { ProjectWorkArea } from "./_components/project-work-area";
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

  // The Work area is part of the project, but only for people who may read work
  // items; the API enforces the same keys on every call it makes.
  const permissionKeys = sessionUser?.permissionKeys ?? [];
  const canReadWork = hasPermission(
    permissionKeys,
    PERMISSION_KEYS.WORK_ITEMS_READ,
  );
  const people = canReadWork ? await loadEmployeeOptions() : [];

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
      {canReadWork ? (
        <ProjectWorkArea
          canWrite={hasPermission(
            permissionKeys,
            PERMISSION_KEYS.WORK_ITEMS_WRITE,
          )}
          people={people}
          projectId={project.id}
        />
      ) : null}
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
