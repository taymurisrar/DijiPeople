import { JobOpeningForm } from "../../_components/job-opening-form";

export default function NewJobOpeningPage() {
  return (
    <main className="grid gap-6">
      <section className="space-y-3">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Recruitment</p>
        <h3 className="font-serif text-4xl text-foreground">Create job opening</h3>
        <p className="max-w-3xl text-muted">
          Add a new opening so candidates and applications can flow into the pipeline.
        </p>
      </section>
      <JobOpeningForm mode="create" />
    </main>
  );
}
