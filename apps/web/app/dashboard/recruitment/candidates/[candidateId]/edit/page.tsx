import { apiRequestJson } from "@/lib/server-api";
import { CandidateForm } from "../../../_components/candidate-form";
import { CandidateRecord } from "../../../types";

type EditCandidatePageProps = {
  params: Promise<{
    candidateId: string;
  }>;
};

export default async function EditCandidatePage({ params }: EditCandidatePageProps) {
  const { candidateId } = await params;
  const candidate = await apiRequestJson<CandidateRecord>(`/candidates/${candidateId}`);

  return (
    <main className="grid gap-6">
      <section className="space-y-3">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Candidates</p>
        <h3 className="font-serif text-4xl text-foreground">Edit candidate</h3>
        <p className="max-w-3xl text-muted">
          Keep candidate details current while the application pipeline evolves.
        </p>
      </section>
      <CandidateForm mode="edit" candidate={candidate} />
    </main>
  );
}
