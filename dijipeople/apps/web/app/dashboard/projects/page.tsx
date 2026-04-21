import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { ProjectListResponse } from "./types";
import { ProjectStatusBadge } from "./_components/project-status-badge";

export default async function ProjectsPage() {
  const projects = await apiRequestJson<ProjectListResponse>("/projects?pageSize=50");

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Projects
          </p>
          <h3 className="font-serif text-4xl text-foreground">
            Organize work and assign people to delivery teams.
          </h3>
          <p className="max-w-3xl text-muted">
            This first version focuses on clean project master data and employee assignments so timesheets and utilization can build on top.
          </p>
        </div>
        <Link
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
          href="/dashboard/projects/new"
        >
          Add project
        </Link>
      </section>

      {projects.items.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            No projects yet
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Your project catalog is empty.
          </h4>
          <p className="mt-3 text-muted">
            Create the first project to start assigning employees and linking timesheets to real work.
          </p>
        </section>
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  <th className="px-5 py-4 font-medium">Project</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Dates</th>
                  <th className="px-5 py-4 font-medium">Assigned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/90">
                {projects.items.map((project) => (
                  <tr key={project.id} className="hover:bg-accent-soft/30">
                    <td className="px-5 py-4">
                      <Link className="font-semibold text-foreground hover:text-accent" href={`/dashboard/projects/${project.id}`}>
                        {project.name}
                      </Link>
                      <p className="mt-1 text-muted">{project.code || "No code"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <ProjectStatusBadge status={project.status} />
                    </td>
                    <td className="px-5 py-4 text-muted">
                      <p>{project.startDate ? new Date(project.startDate).toLocaleDateString() : "No start date"}</p>
                      <p>{project.endDate ? new Date(project.endDate).toLocaleDateString() : "No end date"}</p>
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {project.assignedEmployees.length} employee(s)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
