import { ProjectForm } from "../_components/project-form";

export default function NewProjectPage() {
  return (
    <main className="grid gap-6">
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Create Project
        </p>
        <h3 className="mt-3 text-3xl font-semibold text-foreground">
          Add a new project
        </h3>
      </section>
      <ProjectForm mode="create" />
    </main>
  );
}
