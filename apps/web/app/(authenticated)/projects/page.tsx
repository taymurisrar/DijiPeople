import { ModuleViewSelector } from "@/app/components/view-selector/module-view-selector";
import { getSessionUser } from "@/lib/auth";
import {
  getTableViews,
  RuntimeCustomizationView,
  withFallbackViews,
} from "@/lib/customization-views";
import { hasElevatedTenantRole } from "@/lib/elevated-roles";
import { hasPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import { ProjectsCommandBar } from "./_components/projects-command-bar";
import { ProjectsTable } from "./_components/projects-table";
import { ProjectListResponse } from "./types";

type ProjectsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="dp-theme-scope dp-projects-scope grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include project records."
          title="Projects are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const params = await searchParams;
  const selectedViewKey = getSearchParam(params.view);

  const sessionUser = await getSessionUser();
  const isElevated = hasElevatedTenantRole(sessionUser?.roleKeys);

  const canCreateProject =
    isElevated || hasPermission(sessionUser?.permissionKeys, "projects.create");

  const canViewTenantProjects =
    isElevated ||
    hasPermission(sessionUser?.permissionKeys, "projects.manage") ||
    hasPermission(sessionUser?.permissionKeys, "projects.read");

  const normalizedViewKey = selectedViewKey || "allProjects";

  const projectEndpoint = buildProjectEndpoint({
    selectedViewKey: normalizedViewKey,
  });

  const [projectsResponse, publishedViews] = await Promise.all([
    apiRequestJson<ProjectListResponse>(projectEndpoint),
    getTableViews("projects"),
  ]);

  const projects = projectsResponse.items ?? [];

  const systemViews: RuntimeCustomizationView[] = [
    {
      id: "allProjects",
      viewKey: "allProjects",
      tableKey: "projects",
      name: "All Projects",
      type: "system" as const,
      isDefault: canViewTenantProjects,
      columnsJson: {
        columns: [
          { columnKey: "name" },
          { columnKey: "code" },
          { columnKey: "status" },
          { columnKey: "customer" },
          { columnKey: "dateRange" },
          { columnKey: "assignedEmployees" },
          { columnKey: "actions" },
        ],
      },
      sortingJson: [{ columnKey: "name", direction: "asc" }],
    },
    {
      id: "myProjects",
      viewKey: "myProjects",
      tableKey: "projects",
      name: "My Projects",
      type: "system" as const,
      isDefault: !canViewTenantProjects,
      columnsJson: {
        columns: [
          { columnKey: "name" },
          { columnKey: "code" },
          { columnKey: "status" },
          { columnKey: "dateRange" },
          { columnKey: "assignedEmployees" },
          { columnKey: "actions" },
        ],
      },
      sortingJson: [{ columnKey: "name", direction: "asc" }],
    },
    buildProjectStatusView("activeProjects", "Active Projects", "ACTIVE"),
buildProjectStatusView("planningProjects", "Planning Projects", "PLANNING"),
    buildProjectStatusView("completedProjects", "Completed Projects", "COMPLETED"),
    {
      id: "teamProjects",
      viewKey: "teamProjects",
      tableKey: "projects",
      name: "Team Projects",
      type: "system" as const,
      isDefault: false,
      columnsJson: {
        columns: [
          { columnKey: "name" },
          { columnKey: "code" },
          { columnKey: "status" },
          { columnKey: "customer" },
          { columnKey: "dateRange" },
          { columnKey: "assignedEmployees" },
          { columnKey: "actions" },
        ],
      },
      sortingJson: [{ columnKey: "name", direction: "asc" }],
    },
  ];

  const projectViews = withFallbackViews(
    "projects",
    publishedViews,
    canViewTenantProjects
      ? systemViews
      : systemViews.filter((view) => view.viewKey !== "allProjects"),
  );

  const selectedView =
    projectViews.find((view) => view.viewKey === selectedViewKey) ??
    projectViews.find((view) => view.isDefault) ??
    projectViews[0] ??
    null;

  const visibleColumnKeys = selectedView?.columnsJson
    ? (
        (selectedView.columnsJson as {
          columns?: Array<{ columnKey?: string }>;
        }).columns ?? []
      )
        .map((column) => column.columnKey)
        .filter((columnKey): columnKey is string => Boolean(columnKey))
    : undefined;

  return (
    <main className="dp-theme-scope dp-projects-scope grid gap-6">
      <ModuleViewSelector
        configureHref="/settings/customization/tables/projects"
        enabled
        selectedViewId={selectedView?.viewKey ?? ""}
        views={projectViews}
      />

      <ProjectsCommandBar
        canCreateProject={canCreateProject}
        canDeleteProject={false}
        canShareProject={false}
        canAssignProject={false}
        canImportProject={false}
        canExportProject={false}
      />

      <ProjectsTable
        requests={projects}
        formatting={{
          dateFormat: "MM/dd/yyyy",
          locale: "en-US",
          timezone: "UTC",
        }}
        pagination={{
          page: 1,
          pageSize: projects.length || 10,
          totalItems: projects.length,
          pathname: "/projects",
          searchParams: {
            view: selectedViewKey,
          },
        }}
        visibleColumnKeys={visibleColumnKeys}
        enableSelection={false}
      />
    </main>
  );
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function buildProjectEndpoint(input: { selectedViewKey: string }) {
  const query = new URLSearchParams();
  const status = resolveProjectStatus(input.selectedViewKey);

  if (status) {
    query.set("status", status);
  }

  const suffix = query.toString();

  return suffix ? `/projects?${suffix}` : "/projects";
}

function resolveProjectStatus(selectedViewKey: string) {
  switch (selectedViewKey) {
    case "activeProjects":
      return "ACTIVE";
    case "plannedProjects":
      return "PLANNING";
    case "completedProjects":
      return "COMPLETED";
    default:
      return "";
  }
}

function buildProjectStatusView(id: string, name: string, status: string) {
  return {
    id,
    viewKey: id,
    tableKey: "projects",
    name,
    type: "system" as const,
    isDefault: false,
    filtersJson: { status },
    columnsJson: {
      columns: [
        { columnKey: "name" },
        { columnKey: "code" },
        { columnKey: "status" },
        { columnKey: "customer" },
        { columnKey: "dateRange" },
        { columnKey: "assignedEmployees" },
        { columnKey: "actions" },
      ],
    },
    sortingJson: [{ columnKey: "name", direction: "asc" }],
  };
}