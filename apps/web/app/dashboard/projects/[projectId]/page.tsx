import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { EmployeeListResponse } from "../../employees/types";
import { ProjectAssignmentForm } from "../_components/project-assignment-form";
import { ProjectStatusBadge } from "../_components/project-status-badge";
import { ProjectRecord } from "../types";

type ProjectDetailPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params;
  const [project, employees] = await Promise.all([
    apiRequestJson<ProjectRecord>(`/projects/${projectId}`),
    apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
  ]);

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Project Detail
          </p>
          <h3 className="font-serif text-4xl text-foreground">{project.name}</h3>
          <p className="max-w-3xl text-muted">{project.description || "No project description yet."}</p>
        </div>
        <div className="flex gap-3">
          <ProjectStatusBadge status={project.status} />
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href={`/dashboard/projects/${project.id}/edit`}
          >
            Edit project
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoTile label="Code" value={project.code || "No code"} />
        <InfoTile label="Start date" value={project.startDate ? new Date(project.startDate).toLocaleDateString() : "Not set"} />
        <InfoTile label="End date" value={project.endDate ? new Date(project.endDate).toLocaleDateString() : "Not set"} />
      </section>

      <section className="grid gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Employee Assignment
          </p>
          <h4 className="mt-2 text-2xl font-semibold text-foreground">
            Assign employees to this project
          </h4>
        </div>
        <ProjectAssignmentForm employees={employees.items} projectId={project.id} />
      </section>

      <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-strong text-left text-muted">
              <tr>
                <th className="px-5 py-4 font-medium">Employee</th>
                <th className="px-5 py-4 font-medium">Role</th>
                <th className="px-5 py-4 font-medium">Allocation</th>
                <th className="px-5 py-4 font-medium">Billable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/90">
              {project.assignedEmployees.map((assignment) => (
                <tr key={assignment.id}>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-foreground">{assignment.employee.fullName}</p>
                    <p className="mt-1 text-muted">{assignment.employee.employeeCode}</p>
                  </td>
                  <td className="px-5 py-4 text-muted">{assignment.roleOnProject || "Not set"}</td>
                  <td className="px-5 py-4 text-muted">
                    {assignment.allocationPercent ? `${assignment.allocationPercent}%` : "Not set"}
                  </td>
                  <td className="px-5 py-4 text-muted">
                    {assignment.billableFlag ? "Billable" : "Non-billable"}
                  </td>
                </tr>
              ))}
              {project.assignedEmployees.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-muted" colSpan={4}>
                    No employees assigned yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </article>
  );
}
