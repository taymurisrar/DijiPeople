import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { ApplicationForm } from "../_components/application-form";
import { RecruitmentApplicationsBoard } from "../_components/recruitment-applications-board";
import {
  ApplicationListResponse,
  CandidateListResponse,
  JobOpeningListResponse,
} from "../types";

export default async function RecruitmentApplicationsPage() {
  const [applications, candidates, jobs] = await Promise.all([
    apiRequestJson<ApplicationListResponse>("/applications?pageSize=100"),
    apiRequestJson<CandidateListResponse>("/candidates?pageSize=100"),
    apiRequestJson<JobOpeningListResponse>("/job-openings?pageSize=100"),
  ]);

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,248,245,0.92))] p-6 shadow-lg lg:flex-row lg:items-end lg:justify-between lg:p-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Recruitment pipeline
          </p>
          <h3 className="font-serif text-3xl text-foreground lg:text-4xl">
            Move applications across hiring stages.
          </h3>
          <p className="max-w-3xl text-sm text-muted lg:text-base">
            Drag applications from one stage to another. Keep the pipeline fast,
            clean, and easy to scan without bloated cards.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/dashboard/recruitment/jobs"
          >
            Jobs
          </Link>
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/dashboard/recruitment/candidates"
          >
            Candidates
          </Link>
        </div>
      </section>

      <ApplicationForm
        candidates={candidates.items}
        jobs={jobs.items.filter(
          (job) => !["CLOSED", "FILLED", "CANCELLED"].includes(job.status),
        )}
      />

      <RecruitmentApplicationsBoard applications={applications.items} />
    </main>
  );
}