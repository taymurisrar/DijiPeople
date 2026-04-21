import { apiRequestJson } from "@/lib/server-api";
import { JobOpeningForm } from "../../../_components/job-opening-form";
import {
  hasMatchCriteriaConfigured,
  JobOpeningMatchCriteria,
  JobOpeningRecord,
} from "../../../types";

type EditJobOpeningPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

type JobOpeningWithMatchCriteria = JobOpeningRecord & {
  matchCriteria?: JobOpeningMatchCriteria | null;
};

export default async function EditJobOpeningPage({
  params,
}: EditJobOpeningPageProps) {
  const { jobId } = await params;
  const job = await apiRequestJson<JobOpeningWithMatchCriteria>(
    `/job-openings/${jobId}`,
  );

  const hasConfiguredScoring = hasMatchCriteriaConfigured(job.matchCriteria);

  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(239,248,245,0.92))] p-8 shadow-lg">
        <div className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Recruitment
            </p>
            <h1 className="font-serif text-4xl text-foreground">
              Edit job opening
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Update the opening details, hiring requirements, and scoring
              configuration without disrupting the current application pipeline.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <StatusPill
              label="Opening"
              value={job.title || "Untitled opening"}
            />
            <StatusPill
              label="Code"
              value={job.code || "No code"}
            />
            <StatusPill
              label="Scoring"
              value={hasConfiguredScoring ? "Configured" : "Not configured"}
              tone={hasConfiguredScoring ? "success" : "warning"}
            />
            <StatusPill
              label="Applications"
              value={`${job.applications?.length ?? 0} active`}
            />
          </div>
        </div>
      </section>

      <JobOpeningForm mode="edit" jobOpening={job} />
    </main>
  );
}

function StatusPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-border bg-white/90 text-foreground";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${toneClassName}`}
    >
      <span className="uppercase tracking-[0.14em] opacity-70">{label}</span>
      <span>{value}</span>
    </div>
  );
}
