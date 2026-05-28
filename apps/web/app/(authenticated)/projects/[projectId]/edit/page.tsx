import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { ProjectForm } from "../../_components/project-form";
import { ProjectRecord } from "../../types";

type EditProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function EditProjectPage({
  params,
}: EditProjectPageProps) {
  noStore();

  const { projectId } = await params;
  const project = await loadProject(projectId);

  if (!project) {
    notFound();
  }

  if (project === "ACCESS_DENIED") {
    return (
      <main className="dp-theme-scope dp-projects-scope grid gap-6">
        <AccessDeniedState
          title="You cannot edit this project."
          description="You do not have permission to edit this project record."
        />
      </main>
    );
  }

  return (
    <main className="dp-theme-scope dp-projects-scope grid gap-6">
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Edit Project
        </p>

        <h3 className="mt-3 text-3xl font-semibold text-foreground">
          Update {project.name}
        </h3>

        <p className="mt-2 max-w-3xl text-muted">
          Keep project master data accurate so assignments, timesheets,
          utilization, billing, and delivery tracking stay reliable.
        </p>
      </section>

      <ProjectForm mode="edit" project={project} />
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