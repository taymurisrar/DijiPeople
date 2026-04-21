import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { CandidateListResponse } from "../types";
import { RecruitmentStageBadge } from "../_components/recruitment-stage-badge";

export default async function TalentPoolPage() {
  const candidates = await apiRequestJson<CandidateListResponse>(
    "/candidates?pageSize=100&currentStatus=REJECTED",
  );

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">Talent Pool</p>
          <h3 className="font-serif text-4xl text-foreground">
            Keep rejected candidates reusable.
          </h3>
          <p className="max-w-3xl text-muted">
            Rejected candidates stay searchable here so recruiters can revisit them for future openings.
          </p>
        </div>
        <Link
          className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
          href="/dashboard/recruitment/candidates"
        >
          Back to candidates
        </Link>
      </section>

      <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-strong text-left text-muted">
              <tr>
                <th className="px-5 py-4 font-medium">Candidate</th>
                <th className="px-5 py-4 font-medium">Location</th>
                <th className="px-5 py-4 font-medium">Source</th>
                <th className="px-5 py-4 font-medium">Skills</th>
                <th className="px-5 py-4 font-medium">Last application</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/90">
              {candidates.items.map((candidate) => (
                <tr key={candidate.id}>
                  <td className="px-5 py-4">
                    <Link
                      className="font-semibold text-foreground hover:text-accent"
                      href={`/dashboard/recruitment/candidates/${candidate.id}`}
                    >
                      {candidate.fullName}
                    </Link>
                    <div className="mt-2">
                      <RecruitmentStageBadge stage={candidate.currentStatus} />
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted">
                    {[candidate.currentCity, candidate.currentCountry]
                      .filter(Boolean)
                      .join(", ") || "Not captured"}
                  </td>
                  <td className="px-5 py-4 text-muted">{candidate.source || "Unspecified"}</td>
                  <td className="px-5 py-4 text-muted">
                    {candidate.skills.slice(0, 3).join(", ") || "No skills captured"}
                  </td>
                  <td className="px-5 py-4 text-muted">
                    {candidate.applications[0]
                      ? new Date(candidate.applications[0].appliedAt).toLocaleDateString()
                      : "No application history"}
                  </td>
                </tr>
              ))}
              {candidates.items.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-muted" colSpan={5}>
                    No rejected candidates in the talent pool yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
