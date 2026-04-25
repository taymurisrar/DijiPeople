import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { getBusinessUnitAccessSummary, hasBusinessUnitScope } from "../../_lib/business-unit-access";
import { CandidateListResponse } from "../types";
import { RecruitmentStageBadge } from "../_components/recruitment-stage-badge";

export default async function RecruitmentCandidatesPage() {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include candidate records."
          title="Candidates are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const candidates = await apiRequestJson<CandidateListResponse>("/candidates?pageSize=50");

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">Candidates</p>
          <h3 className="font-serif text-4xl text-foreground">Track talent across your hiring funnel.</h3>
          <p className="max-w-3xl text-muted">
            Keep candidate records practical today and ready for interviews and onboarding later.
          </p>
        </div>
        <div className="flex gap-3">
          <Link className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground" href="/dashboard/recruitment/candidates/upload-cv">
            Upload CV
          </Link>
          <Link className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground" href="/dashboard/recruitment/talent-pool">
            Talent pool
          </Link>
          <Link className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground" href="/dashboard/recruitment/applications">
            View pipeline
          </Link>
          <Link className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong" href="/dashboard/recruitment/candidates/new">
            Add candidate
          </Link>
        </div>
      </section>

      {candidates.items.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">No candidates yet</p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">Add your first candidate to start building a pipeline.</h4>
        </section>
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  <th className="px-5 py-4 font-medium">Candidate</th>
                  <th className="px-5 py-4 font-medium">Source</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Applications</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/90">
                {candidates.items.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-accent-soft/30">
                    <td className="px-5 py-4">
                      <Link className="font-semibold text-foreground hover:text-accent" href={`/dashboard/recruitment/candidates/${candidate.id}`}>
                        {candidate.fullName}
                      </Link>
                      <p className="mt-1 text-muted">
                        {candidate.email}
                        {candidate.currentDesignation ? ` • ${candidate.currentDesignation}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {candidate.source || "Unspecified"}
                      <p>{candidate.currentCity || candidate.currentCountry || "Location pending"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <RecruitmentStageBadge stage={candidate.currentStatus} />
                    </td>
                    <td className="px-5 py-4 text-muted">{candidate.applications.length} application(s)</td>
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
