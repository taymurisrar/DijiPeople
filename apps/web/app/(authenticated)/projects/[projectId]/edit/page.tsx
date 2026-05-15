import { apiRequestJson } from "@/lib/server-api";
import { ProjectForm } from "../../_components/project-form";
import { ProjectRecord } from "../../types";

type EditProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const { projectId } = await params;
  const project = await apiRequestJson<ProjectRecord>(`/projects/${projectId}`);

  return (
    <main className="grid gap-6">
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Edit Project
        </p>
        <h3 className="mt-3 text-3xl font-semibold text-foreground">
          Update {project.name}
        </h3>
      </section>
      <ProjectForm mode="edit" project={project} />
    </main>
  );
}
