import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import {
  formatDateWithTenantSettings,
  formatDateTimeWithTenantSettings,
} from "@/lib/date-format";
import { ProjectAssignmentsSubgrid } from "../_components/project-assignments-subgrid";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { Button } from "@/app/components/ui/button";
import { EmployeeListResponse } from "../../employees/types";
import { ProjectsCommandBar } from "../_components/projects-command-bar";
import { ProjectAssignmentForm } from "../_components/project-assignment-form";
import { ProjectStatusBadge } from "../_components/project-status-badge";
import { ProjectRecord } from "../types";

type ProjectTabKey =
  | "overview"
  | "assignments"
  | "financials"
  | "timesheets"
  | "history";

type ProjectTabConfig = {
  key: ProjectTabKey;
  label: string;
};

const projectTabs: readonly ProjectTabConfig[] = [
  { key: "overview", label: "Overview" },
  { key: "assignments", label: "Assignments" },
  { key: "financials", label: "Financials" },
  { key: "timesheets", label: "Timesheets" },
  { key: "history", label: "History" },
] as const;

type ProjectDetailPageProps = {
  params: Promise<{
    projectId: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const formattingOptions = {
  dateFormat: "MM/dd/yyyy",
  locale: "en-US",
  timeFormat: "12h",
  timezone: "UTC",
};

export default async function ProjectDetailPage({
  params,
  searchParams,
}: ProjectDetailPageProps) {
  const { projectId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const requestedTab = projectTabs.some(
    (tab) => tab.key === resolvedSearchParams.tab,
  )
    ? (resolvedSearchParams.tab as ProjectTabKey)
    : "overview";

  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login?reason=session-expired");
  }

  const project = await loadProject(projectId);

  if (!project) {
    notFound();
  }

  if (project === "ACCESS_DENIED") {
    return (
      <main className="dp-theme-scope dp-projects-scope grid gap-6">
        <AccessDeniedState
          title="You cannot view this project record."
          description="This project record is outside your accessible business-unit scope."
        />
      </main>
    );
  }

  const employees = await apiRequestJson<EmployeeListResponse>(
    "/employees?pageSize=100",
  ).catch(() => ({
    items: [],
    meta: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
    filters: {
      search: null,
      employmentStatus: null,
      reportingManagerEmployeeId: null,
    },
  }));

  const canCreateProject = hasPermission(
    sessionUser.permissionKeys,
    "projects.create",
  );

  const canUpdateProject =
    hasPermission(sessionUser.permissionKeys, "projects.update") ||
    hasPermission(sessionUser.permissionKeys, "projects.manage");

  const canDeleteProject =
    hasPermission(sessionUser.permissionKeys, "projects.delete") ||
    hasPermission(sessionUser.permissionKeys, "projects.manage");

  const canAssignProject =
    hasPermission(sessionUser.permissionKeys, "projects.assign") ||
    hasPermission(sessionUser.permissionKeys, "projects.manage");

  const canExportProject =
    hasPermission(sessionUser.permissionKeys, "projects.export") ||
    hasPermission(sessionUser.permissionKeys, "projects.manage");

  const canAccessProjectList =
    hasPermission(sessionUser.permissionKeys, "projects.read") ||
    hasPermission(sessionUser.permissionKeys, "projects.manage");

  const activeTab = requestedTab;
  const formatDateValue = (value?: string | null) =>
    formatDateWithTenantSettings(value, formattingOptions);

  return (
    <main className="dp-theme-scope dp-projects-scope grid gap-6">
      <ProjectsCommandBar
        canAssignProject={canAssignProject}
        canCreateProject={canCreateProject}
        canDeleteProject={canDeleteProject}
        canExportProject={canExportProject}
        canImportProject={false}
        canShareProject={false}
        context="detail"
        projectCode={project.code ?? project.name}
        projectId={project.id}
      />

<section className="rounded-[24px] border border-border bg-surface px-6 py-5 shadow-sm">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Project
        </p>
        <ProjectStatusBadge status={project.status} />

        {project.code ? (
          <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted">
            {project.code}
          </span>
        ) : null}
      </div>

      <h1 className="mt-3 truncate font-serif text-2xl text-foreground">
        {project.name}
      </h1>

      <p className="mt-2 text-sm text-muted">
        {[
          project.customer?.name || "No customer",
          project.businessUnit?.name || "No business unit",
          `Start: ${formatDateValue(project.startDate)}`,
          `End: ${formatDateValue(project.endDate)}`,
        ].join(" • ")}
      </p>
    </div>

    <div className="grid grid-cols-2 gap-3 text-sm sm:flex sm:items-center">
      <div className="rounded-2xl border border-border bg-white px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted">Resources</p>
        <p className="mt-1 font-semibold text-foreground">
          {project.assignedEmployees?.length ?? 0}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted">Hours</p>
        <p className="mt-1 font-semibold text-foreground">
          {project.plannedHours ?? 0}
        </p>
      </div>
    </div>
  </div>
</section>

      <nav className="flex flex-wrap gap-2">
        {projectTabs.map((tab) => {
          const isActive = tab.key === activeTab;

          return (
            <Link
              key={tab.key}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-accent text-white"
                  : "border border-border bg-surface text-foreground hover:border-accent/30 hover:text-accent"
              }`}
              href={`/projects/${project.id}?tab=${tab.key}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "overview" ? (
        <section className="grid gap-6">
          <div className="grid gap-6 xl:grid-cols-1">
            <div className="grid gap-6">
              <OverviewGrid project={project} formatDate={formatDateValue} />
              <ProjectDeliverySection project={project} />
            </div>

            {/* <div className="grid gap-6">
              <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-muted">
                  Project Assignment
                </p>
                <p className="mt-3 text-sm text-muted">
                  Assign employees and manage project allocation.
                </p>

                <div className="mt-5">
                  <ProjectAssignmentForm
                    employees={employees.items}
                    projectId={project.id}
                  />
                </div>
              </article>

              <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-muted">
                  Admin Actions
                </p>

                <div className="mt-5 grid gap-3">
                  {canUpdateProject ? (
                    <Button
                      href={`/projects/${project.id}/edit`}
                      variant="secondary"
                      size="md"
                    >
                      Edit project
                    </Button>
                  ) : null}

                  <Button href="/projects" variant="secondary" size="md">
                    Back to projects
                  </Button>
                </div>
              </article>
            </div> */}
          </div>
        </section>
      ) : null}

{activeTab === "assignments" ? (
  <ProjectAssignmentsSubgrid
    project={project}
    canAssignProject={canAssignProject}
  />
) : null}

      {activeTab === "financials" ? (
        <ProjectFinancialsSection project={project} />
      ) : null}

      {activeTab === "timesheets" ? (
        <SimpleListSection
          emptyMessage="Timesheet records will appear here once entries are linked to this project."
          items={[]}
          title="Timesheets"
        />
      ) : null}

      {activeTab === "history" ? (
        <SimpleListSection
          emptyMessage="No project history records found."
          items={[
            {
              id: project.id,
              title: `Created ${formatDateValue(project.createdAt)}`,
              detail: `Last updated ${formatDateTimeWithTenantSettings(
                project.updatedAt,
                formattingOptions,
              )}`,
            },
          ]}
          title="History"
        />
      ) : null}
    </main>
  );
}

async function loadProject(id: string) {
  try {
    return await apiRequestJson<ProjectRecord>(`/projects/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 403) return "ACCESS_DENIED" as const;
      if (error.status === 404) return null;
    }

    throw error;
  }
}

function OverviewGrid({
  project,
  formatDate,
}: {
  project: ProjectRecord;
  formatDate: (value?: string | null) => string;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Overview
        </p>

        <dl className="mt-5 grid gap-4">
          <DetailItem label="Project name" value={project.name} />
          <DetailItem label="Project code" value={project.code || "Not set"} />
          <DetailItem label="Status" value={project.status} />
          <DetailItem
            label="Customer"
            value={project.customer?.name || "Not set"}
          />
          <DetailItem
            label="Business unit"
            value={project.businessUnit?.name || "Not set"}
          />
          <DetailItem label="Start date" value={formatDate(project.startDate)} />
          <DetailItem label="End date" value={formatDate(project.endDate)} />
        </dl>
      </article>

      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Project Context
        </p>

        <dl className="mt-5 grid gap-4">
          <DetailItem
            label="Description"
            value={project.description || "No description provided."}
          />
          <DetailItem
            label="Billing type"
            value={project.billingType || "Not set"}
          />
          <DetailItem
            label="Currency"
            value={project.currencyCode || "Tenant currency"}
          />
          <DetailItem
            label="Timezone"
            value={project.timezone || "Tenant timezone"}
          />
          <DetailItem
            label="Timesheets"
            value={project.allowTimesheets ? "Allowed" : "Disabled"}
          />
          <DetailItem
            label="Approval"
            value={
              project.requireApproval
                ? project.approvalMode || "Required"
                : "Not required"
            }
          />
        </dl>
      </article>
    </section>
  );
}

function ProjectDeliverySection({ project }: { project: ProjectRecord }) {
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Delivery
        </p>

        <dl className="mt-5 grid gap-4">
          <DetailItem
            label="Project health"
            value={project.projectHealth || "Not set"}
          />
          <DetailItem label="Risk level" value={project.riskLevel || "Not set"} />
          <DetailItem
            label="Priority"
            value={project.priority || "Not set"}
          />
          <DetailItem
            label="Delivery status"
            value={project.deliveryStatus || "Not set"}
          />
        </dl>
      </article>

      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Workload
        </p>

        <div className="mt-5 grid gap-4">
          <Metric label="Planned hours" value={project.plannedHours ?? 0} />
          <Metric label="Actual hours" value={project.actualHours ?? 0} />
          <Metric label="Remaining hours" value={project.remainingHours ?? 0} />
        </div>
      </article>
    </section>
  );
}

function ProjectAssignmentsSection({
  project,
  canAssignProject = false,
}: {
  project: ProjectRecord;
  canAssignProject?: boolean;
}) {
  const assignments = project.assignedEmployees ?? [];

  return (
    <section className="rounded-[24px] border border-border bg-surface shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Related Table
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            Project Assignments
          </h2>
          <p className="mt-1 text-sm text-muted">
            Employees assigned to this project with allocation and billing setup.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canAssignProject ? (
            <Button
              href={`/projects/${project.id}/assignments/new`}
              variant="primary"
              size="sm"
            >
              New assignment
            </Button>
          ) : null}

          <Button
            href={`/projects/${project.id}?tab=assignments`}
            variant="secondary"
            size="sm"
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-white/70 px-6 py-3 text-sm">
        <button className="rounded-xl px-3 py-2 text-foreground hover:bg-accent-soft hover:text-accent">
          Edit
        </button>
        <button className="rounded-xl px-3 py-2 text-red-600 hover:bg-red-50">
          Remove
        </button>
        <button className="rounded-xl px-3 py-2 text-foreground hover:bg-accent-soft hover:text-accent">
          Export
        </button>
      </div>

      {assignments.length === 0 ? (
        <div className="p-8 text-sm text-muted">
          No project assignments found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-muted/20 text-left text-xs uppercase tracking-[0.14em] text-muted">
                <th className="px-6 py-3 font-semibold">Employee</th>
                <th className="px-6 py-3 font-semibold">Employee Code</th>
                <th className="px-6 py-3 font-semibold">Role</th>
                <th className="px-6 py-3 font-semibold">Allocation</th>
                <th className="px-6 py-3 font-semibold">Type</th>
                <th className="px-6 py-3 font-semibold">Billing</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {assignments.map((assignment) => {
                const allocation =
                  assignment.allocationPercent != null
                    ? `${assignment.allocationPercent}%`
                    : assignment.allocationHours != null
                      ? `${assignment.allocationHours} hour(s)`
                      : "Not set";

                return (
                  <tr
                    key={assignment.id}
                    className="border-b border-border bg-surface hover:bg-accent-soft/40"
                  >
                    <td className="border-t border-border px-6 py-4 font-medium text-foreground">
                      {assignment.employee.fullName}
                      {assignment.utilizationWarning ? (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          {assignment.utilizationWarning}
                        </p>
                      ) : null}
                    </td>

                    <td className="border-t border-border px-6 py-4 text-muted">
                      {assignment.employee.employeeCode || "Not set"}
                    </td>

                    <td className="border-t border-border px-6 py-4 text-muted">
                      {assignment.roleOnProject || "Not set"}
                    </td>

                    <td className="border-t border-border px-6 py-4 text-muted">
                      {allocation}
                    </td>

                    <td className="border-t border-border px-6 py-4 text-muted">
                      {assignment.allocationType || "Not set"}
                    </td>

                    <td className="border-t border-border px-6 py-4 text-muted">
                      {assignment.billableFlag ? "Billable" : "Non-billable"}
                    </td>

                    <td className="border-t border-border px-6 py-4">
                      <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold uppercase text-muted">
                        {assignment.status ?? "ACTIVE"}
                      </span>
                    </td>

                    <td className="border-t border-border px-6 py-4 text-right">
                      <Link
                        href={`/projects/${project.id}/assignments/${assignment.id}/edit`}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
} 

function ProjectFinancialsSection({ project }: { project: ProjectRecord }) {
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Budget
        </p>

        <dl className="mt-5 grid gap-4">
          <DetailItem
            label="Budget amount"
            value={`${project.budgetAmount ?? 0} ${
              project.budgetCurrencyCode || project.currencyCode || ""
            }`.trim()}
          />
          <DetailItem
            label="Consumed amount"
            value={`${project.consumedAmount ?? 0} ${
              project.budgetCurrencyCode || project.currencyCode || ""
            }`.trim()}
          />
          <DetailItem
            label="Burn rate"
            value={`${project.burnRate ?? 0}`}
          />
          <DetailItem
            label="Billing status"
            value={project.billingStatus || "Not set"}
          />
        </dl>
      </article>

      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Hours
        </p>

        <div className="mt-5 grid gap-4">
          <Metric label="Budget hours" value={project.budgetHours ?? 0} />
          <Metric label="Planned hours" value={project.plannedHours ?? 0} />
          <Metric label="Actual hours" value={project.actualHours ?? 0} />
          <Metric label="Remaining hours" value={project.remainingHours ?? 0} />
        </div>
      </article>
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white/80 px-4 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted">{helper}</p> : null}
    </div>
  );
}

function SimpleListSection({
  emptyMessage,
  items,
  title,
}: {
  emptyMessage: string;
  items: Array<{ id: string; title: string; detail: string }>;
  title: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted shadow-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">{title}</p>

      <div className="mt-5 grid gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-border bg-white/80 px-5 py-4"
          >
            <p className="font-medium text-foreground">{item.title}</p>
            <p className="mt-2 text-sm text-muted">{item.detail}</p>
          </div>
        ))}
      </div>
    </article>
  );
}