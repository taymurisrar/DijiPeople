import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { JobOpeningStatusBadge } from "../_components/job-opening-status-badge";
import { JobOpeningListResponse } from "../types";

export default async function RecruitmentJobsPage() {
  const jobs = await apiRequestJson<JobOpeningListResponse>("/job-openings?pageSize=50");

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">Recruitment</p>
          <h3 className="font-serif text-4xl text-foreground">
            Manage job openings and keep hiring visible.
          </h3>
          <p className="max-w-3xl text-muted">
            This foundation keeps openings, candidates, and applications tenant-driven so interviews and onboarding can layer on later.
          </p>
        </div>
        <div className="flex gap-3">
          <Link className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground" href="/dashboard/recruitment/applications">
            View pipeline
          </Link>
          <Link className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong" href="/dashboard/recruitment/jobs/new">
            Add job opening
          </Link>
        </div>
      </section>

      {jobs.items.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">No job openings yet</p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">Start your hiring pipeline with the first opening.</h4>
        </section>
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  <th className="px-5 py-4 font-medium">Opening</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Applications</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/90">
                {jobs.items.map((job) => (
                  <tr key={job.id} className="hover:bg-accent-soft/30">
                    <td className="px-5 py-4">
                      <Link className="font-semibold text-foreground hover:text-accent" href={`/dashboard/recruitment/jobs/${job.id}`}>
                        {job.title}
                      </Link>
                      <p className="mt-1 text-muted">{job.code || "No code"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <JobOpeningStatusBadge status={job.status} />
                    </td>
                    <td className="px-5 py-4 text-muted">{job.applications.length} application(s)</td>
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
