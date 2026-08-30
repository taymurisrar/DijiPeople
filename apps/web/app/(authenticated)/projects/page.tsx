import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardModuleRuntimeContext,
  buildStandardRuntimePrincipal,
} from "@/lib/runtime/modules/standard-module-runtime";
import { projectRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import type { ProjectListResponse } from "./types";

type ProjectsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <div className="dp-theme-scope dp-projects-scope grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include project records."
          title="Projects are unavailable for your current business unit access."
        />
      </div>
    );
  }

  const [projectsResponse, params, sessionUser] = await Promise.all([
    apiRequestJson<ProjectListResponse>("/projects"),
    searchParams,
    getSessionUser(),
  ]);
  const runtime = buildStandardModuleRuntimeContext({
    pageKind: "list",
    principal: buildStandardRuntimePrincipal({
      userId: sessionUser?.userId,
      tenantId: sessionUser?.tenantId,
      roleKeys: sessionUser?.roleKeys,
      roles: sessionUser?.roles,
      permissionKeys: sessionUser?.permissionKeys,
    }),
    spec: projectRuntimeSpec,
  });
  const activeView = resolveActiveView(runtime, getSearchParam(params.viewId));
  const records = (projectsResponse.items ?? []).map((project) => ({
    ...project,
    customerName: project.customer?.name ?? "",
    assignedEmployeesCount: project.assignedEmployees?.length ?? 0,
  }));

  return (
    <div className="dp-theme-scope dp-projects-scope grid gap-6">
      <StandardModuleListPage
        activeView={activeView}
        formatting={{
          dateFormat: "MM/dd/yyyy",
          locale: "en-US",
          timezone: "UTC",
        }}
        pagination={{
          page: projectsResponse.meta?.page ?? 1,
          pageSize: (projectsResponse.meta?.pageSize ?? records.length) || 10,
          totalItems: projectsResponse.meta?.total ?? records.length,
          pathname: projectRuntimeSpec.routeBase,
          searchParams: {
            viewId: activeView?.viewId ?? activeView?.id,
          },
        }}
        records={records}
        runtime={runtime}
        title="Projects"
      />
    </div>
  );
}

function resolveActiveView(
  runtime: ReturnType<typeof buildStandardModuleRuntimeContext>,
  viewId: string,
) {
  return (
    runtime.metadata.views.find(
      (view) => (view.viewId ?? view.id) === viewId,
    ) ??
    runtime.metadata.views.find((view) => view.isDefault) ??
    runtime.metadata.views[0] ??
    null
  );
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}
