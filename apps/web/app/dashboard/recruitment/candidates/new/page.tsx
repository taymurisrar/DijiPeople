import { CandidateForm } from "../../_components/candidate-form";

export default function NewCandidatePage() {
  return (
    <main className="grid gap-6">
      <section className="space-y-3">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Candidates</p>
        <h3 className="font-serif text-4xl text-foreground">Create candidate</h3>
        <p className="max-w-3xl text-muted">
          Add candidate details now so you can connect them to multiple openings later.
        </p>
      </section>
      <CandidateForm mode="create" />
    </main>
  );
}
